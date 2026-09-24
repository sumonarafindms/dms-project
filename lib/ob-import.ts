import { foldDigits } from "@/lib/format";
import crypto from "crypto";
import { assertRowLimit, looksLikeWorkbook } from "./upload-safety";
import { createMissingRetailers, describeCreatedRetailers } from "./retailer-autocreate";
import { IMPORT_TX_OPTIONS } from "./c2-import-core";
import * as XLSX from "xlsx";
import { ImportStatus, ImportType, Prisma } from "@prisma/client";
import { priorImport } from "./import-batch";
import { prisma } from "@/lib/prisma";
import { phoneKey } from "./phone";

type Cell = string | number | boolean | Date | null | undefined;
type Matrix = Cell[][];

function text(value: Cell) {
  return value === null || value === undefined ? "" : String(value).trim();
}
function header(value: Cell) {
  return text(value).toUpperCase().replace(/\s+/g, "_");
}
function numberValue(value: Cell): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  // v200: Bengali digits (১২০) read as the number they are.
  const raw = foldDigits(text(value)).replace(/,/g, "");
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
function digits(value: Cell) {
  return text(value).replace(/\D/g, "");
}
const MONTHS: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};
function parseDateHeader(value: Cell): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // v200: local getters — see parseHeaderDate in lib/c2-import-core.ts.
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  }
  const raw = text(value).replace(/\s+/g, " ").trim();
  const named = raw.match(/^(\d{1,2})[-\/\s]([A-Za-z]{3,9})[-\/\s](\d{2,4})(?:\s.*)?$/);
  if (named) {
    const mi = MONTHS[named[2].slice(0, 3).toUpperCase()];
    if (mi !== undefined) {
      let year = Number(named[3]);
      if (year < 100) year += 2000;
      const day = Number(named[1]);
      const result = new Date(Date.UTC(year, mi, day));
      if (result.getUTCFullYear() === year && result.getUTCMonth() === mi && result.getUTCDate() === day) return result;
    }
  }
  const numeric = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s.*)?$/);
  if (numeric) {
    const month = Number(numeric[1]) - 1,
      day = Number(numeric[2]),
      year = Number(numeric[3]);
    const result = new Date(Date.UTC(year, month, day));
    if (result.getUTCFullYear() === year && result.getUTCMonth() === month && result.getUTCDate() === day)
      return result;
  }
  return null;
}
function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}
function decodeReportText(bytes: Buffer): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString("utf16le");
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = Buffer.allocUnsafe(bytes.length - 2);
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      swapped[i - 2] = bytes[i + 1];
      swapped[i - 1] = bytes[i];
    }
    return swapped.toString("utf16le");
  }
  const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
  let nul = 0;
  for (const b of sample) if (b === 0) nul++;
  if (sample.length && nul / sample.length > 0.15) return bytes.toString("utf16le").replace(/^\uFEFF/, "");
  return bytes.toString("utf8").replace(/^\uFEFF/, "");
}
function parseTabText(bytes: Buffer): Matrix | null {
  const source = decodeReportText(bytes);
  const firstChunk = source.slice(0, 12000);
  if (!firstChunk.includes("\t") || !firstChunk.toUpperCase().includes("RETAILER_CODE")) return null;
  return source
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split("\t"));
}
/**
 * Exported for `tests/import-formats.smoke.test.ts`.
 *
 * The rest of this module needs a database, so the only way to guard the
 * format handling — the part that was broken for every `.xls` — without one is
 * to reach the reader directly.
 */
export function readMatrix(bytes: Buffer): Matrix {
  // Workbook first — see `looksLikeWorkbook`. Sniffing the text first made
  // every .xls upload fail with a wall of mojibake.
  if (!looksLikeWorkbook(bytes)) {
    const tab = parseTabText(bytes);
    if (tab) return tab;
  }
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("No worksheet found in OB file.");
  const rows = XLSX.utils.sheet_to_json<Cell[]>(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null });
  assertRowLimit(rows.length, "Opening Balance sheet");
  return rows;
}
function findHeaderRow(matrix: Matrix, required: string[]) {
  const max = Math.min(matrix.length, 30);
  for (let r = 0; r < max; r++) {
    const headers = (matrix[r] ?? []).map(header);
    if (required.every((key) => headers.includes(key))) return r;
  }
  return -1;
}

export type ObMappedRow = { retailerId: string; amount: number; transactionCount: number };

/**
 * One row per retailer, whatever the file does.
 *
 * `ObRecord` is unique on `(retailerId, date)`, and the carrier's exports are
 * known to repeat a retailer: the StockLifting file lists a BP once per RSO
 * that serves it, and eight retailers were duplicated that way in the owner's
 * real file — which aborted the whole C2C import on a constraint error. The
 * same shape in a Balance file would lose the whole snapshot the same way, so
 * the rows are combined here with the same arithmetic as `mergeRowsByRetailer`
 * in c2-import-core.
 *
 * Today's Balance file has no duplicates. That is not a reason to leave the
 * crash in place; it is the reason this is cheap to add now.
 */
export function mergeObRowsByRetailer(rows: ObMappedRow[]): ObMappedRow[] {
  const merged = new Map<string, ObMappedRow>();
  for (const row of rows) {
    const seen = merged.get(row.retailerId);
    if (!seen) merged.set(row.retailerId, { ...row });
    else {
      seen.amount += row.amount;
      seen.transactionCount += row.transactionCount;
    }
  }
  return [...merged.values()];
}

export async function importObWorkbook(fileName: string, bytes: Buffer) {
  const matrix = readMatrix(bytes);
  if (matrix.length < 2) throw new Error("The Opening Balance report is empty.");
  const required = ["RETAILER_CODE", "RETAILER_ITOPUP_NO", "TRANSACTION_COUNT", "TOTAL_AMOUNT", "SRNUMBER"];
  const headerRowIndex = findHeaderRow(matrix, required);
  if (headerRowIndex < 0) {
    const candidates = matrix
      .slice(0, 30)
      .map((row, rowIndex) => {
        const hs = (row ?? []).map(header).filter(Boolean);
        const matched = required.filter((key) => hs.includes(key));
        return { rowIndex, hs, matched };
      })
      .sort((a, b) => b.matched.length - a.matched.length);
    const best = candidates[0] || { rowIndex: 0, hs: [], matched: [] };
    const missing = required.filter((key) => !best.hs.includes(key));
    throw new Error(
      `Required headings missing: ${missing.join(", ")}. Best header candidate was row ${best.rowIndex + 1} and contained: ${best.hs.join(", ") || "no recognizable headings"}.`,
    );
  }
  const headerRow = matrix[headerRowIndex] ?? [];
  const headers = headerRow.map(header);
  const idx: Record<string, number> = {};
  for (const key of required) {
    const i = headers.indexOf(key);
    if (i < 0) throw new Error(`Required column ${key} was not found in the OB report.`);
    idx[key] = i;
  }
  const dateCols = headerRow
    .map((v, i) => ({ i, date: parseDateHeader(v), label: text(v) }))
    .filter((x) => x.date) as Array<{ i: number; date: Date; label: string }>;
  if (dateCols.length !== 1)
    throw new Error(
      "Opening Balance file must contain exactly one recognizable snapshot date column in the detected header.",
    );
  const snapshotDate = dateCols[0].date;

  // Optional columns, present in the carrier's Balance export and used only to
  // fill in an outlet the Retailer Master has not caught up with yet.
  const optional = (key: string) => {
    const i = headers.indexOf(key);
    return i < 0 ? null : i;
  };
  const nameCol = optional("RETAILER_NAME"),
    itopCol = optional("RETAILER_ITOPUP_NO"),
    sellerCol = optional("ITOPUPSELLER"),
    itopSrCol = optional("ITOPUPSRNUMBER"),
    rsoCodeCol = optional("RSOCODE");

  const parsed: Array<{
    rowNumber: number;
    retailerCode: string;
    amount: number;
    transactionCount: number;
    srNumber: string;
    retailerName: string;
    iTopUpNumber: string;
    iTopUpSeller: string;
    iTopUpSrNumber: string;
    rsoCode: string;
  }> = [];
  const errors: Array<{ rowNumber: number; message: string; rawData: object }> = [];
  for (let r = headerRowIndex + 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    if (!row.some((c) => text(c))) continue;
    const retailerCode = text(row[idx.RETAILER_CODE]).toUpperCase();
    if (!retailerCode) continue;
    const amount = numberValue(row[idx.TOTAL_AMOUNT]);
    const datedAmount = numberValue(row[dateCols[0].i]);
    const transactionCount = numberValue(row[idx.TRANSACTION_COUNT]);
    if (amount === null || amount < 0 || datedAmount === null || datedAmount < 0) {
      errors.push({ rowNumber: r + 1, message: "Invalid opening balance amount", rawData: { retailerCode } });
      continue;
    }
    if (Math.abs(amount - datedAmount) > 0.01) {
      errors.push({
        rowNumber: r + 1,
        message: `${dateCols[0].label} amount does not match TOTAL_AMOUNT`,
        rawData: { retailerCode },
      });
      continue;
    }
    if (transactionCount === null || transactionCount < 0 || !Number.isInteger(transactionCount)) {
      errors.push({ rowNumber: r + 1, message: "TRANSACTION_COUNT is invalid", rawData: { retailerCode } });
      continue;
    }
    parsed.push({
      rowNumber: r + 1,
      retailerCode,
      amount,
      transactionCount,
      srNumber: digits(row[idx.SRNUMBER]),
      retailerName: nameCol === null ? "" : text(row[nameCol]),
      iTopUpNumber: itopCol === null ? "" : digits(row[itopCol]),
      iTopUpSeller: sellerCol === null ? "" : text(row[sellerCol]),
      iTopUpSrNumber: itopSrCol === null ? "" : digits(row[itopSrCol]),
      rsoCode: rsoCodeCol === null ? "" : text(row[rsoCodeCol]),
    });
  }
  if (!parsed.length) throw new Error("No valid retailer rows were found in the OB report.");

  const retailerCodes = [...new Set(parsed.map((r) => r.retailerCode))];
  const retailerSelect = { id: true, retailerCode: true, employee: { select: { rsoMsisdn: true } } };
  let retailers = await prisma.retailer.findMany({
    where: { retailerCode: { in: retailerCodes } },
    select: retailerSelect,
  });

  /*
   * OB was the harshest of the three: one unknown retailer code and the entire
   * snapshot was refused, with a message telling the operator to fix a file
   * that was correct. The report names the outlet and its RSO, so it is created
   * here instead. See lib/retailer-autocreate.ts.
   */
  // v200: a file that will be refused for bad rows creates no retailers first.
  if (errors.length) {
    const preview = errors
      .slice(0, 5)
      .map((e) => `Row ${e.rowNumber}: ${e.message}`)
      .join("; ");
    throw new Error(
      `OB import stopped: ${errors.length} invalid row(s). Fix the file before replacing the current snapshot. ${preview}`,
    );
  }

  const known = new Set(retailers.map((r) => r.retailerCode.toUpperCase()));
  const autoCreated = await createMissingRetailers(
    parsed.map((r) => ({
      retailerCode: r.retailerCode,
      retailerName: r.retailerName,
      iTopUpNumber: r.iTopUpNumber,
      iTopUpSrNumber: r.iTopUpSrNumber,
      srNumber: r.srNumber,
      rsoCode: r.rsoCode,
      iTopUpSeller: r.iTopUpSeller,
    })),
    known,
    `OB import: ${fileName}`,
  );
  if (autoCreated.created.length)
    retailers = await prisma.retailer.findMany({
      where: { retailerCode: { in: retailerCodes } },
      select: retailerSelect,
    });

  const map = new Map(retailers.map((r) => [r.retailerCode.toUpperCase(), r]));
  const mapped: Array<{ retailerId: string; amount: number; transactionCount: number }> = [];
  let assignmentWarnings = 0;
  for (const row of parsed) {
    const retailer = map.get(row.retailerCode);
    if (!retailer) {
      errors.push({
        rowNumber: row.rowNumber,
        message: `Retailer ${row.retailerCode} does not exist in Retailer Master`,
        rawData: { retailerCode: row.retailerCode },
      });
      continue;
    }
    if (
      phoneKey(retailer.employee?.rsoMsisdn ?? "") &&
      phoneKey(row.srNumber) &&
      phoneKey(retailer.employee?.rsoMsisdn ?? "") !== phoneKey(row.srNumber)
    )
      assignmentWarnings++;
    mapped.push({ retailerId: retailer.id, amount: row.amount, transactionCount: row.transactionCount });
  }

  const obRows = mergeObRowsByRetailer(mapped);

  if (errors.length) {
    const preview = errors
      .slice(0, 5)
      .map((e) => `Row ${e.rowNumber}: ${e.message}`)
      .join("; ");
    throw new Error(
      `OB import stopped: ${errors.length} invalid/unmapped row(s). Fix the file before replacing the current snapshot. ${preview}`,
    );
  }
  if (!mapped.length) throw new Error("OB import stopped: no mapped retailer rows are available.");

  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  /*
   * v200: the same file twice is said plainly. OB had no duplicate check and
   * crashed on the unique hash with a raw database error.
   */
  const prior = await priorImport(hash);
  if (prior)
    throw new Error(
      `This exact OB file was already imported (${prior.fileName}). Nothing was changed — the current snapshot stands.`,
    );
  const batch = await prisma.importBatch.create({
    data: {
      type: ImportType.OB,
      fileName,
      hash,
      businessDate: snapshotDate,
      totalRows: parsed.length,
      status: ImportStatus.PROCESSING,
    },
  });
  try {
    /*
     * The same budget as C2C/C2S. OB already writes its rows in one
     * `createMany`, so it was never the 1,927-round-trip case — but it deletes
     * and rewrites the entire snapshot in one transaction, and on a hosted
     * database that is not guaranteed to fit in Prisma's default 5 seconds.
     */
    await prisma.$transaction(async (tx) => {
      await tx.obRecord.deleteMany({});
      if (obRows.length)
        await tx.obRecord.createMany({
          data: obRows.map((row) => ({
            retailerId: row.retailerId,
            date: snapshotDate,
            transactionCount: row.transactionCount,
            amount: new Prisma.Decimal(row.amount),
            batchId: batch.id,
          })),
        });
      if (errors.length)
        await tx.importError.createMany({
          data: errors.map((e) => ({
            batchId: batch.id,
            rowNumber: e.rowNumber,
            message: e.message,
            rawData: e.rawData,
          })),
        });
      await tx.importBatch.update({
        where: { id: batch.id },
        data: {
          successRows: mapped.length,
          failedRows: errors.length,
          status: errors.length ? ImportStatus.COMPLETED_WITH_ERRORS : ImportStatus.COMPLETED,
        },
      });
      // OB records are latest-snapshot-only: the obRecord rows above are
      // replaced wholesale, because the file is a balance snapshot rather than
      // a ledger.
      //
      // The IMPORT BATCH history is NOT deleted. It used to be, which erased
      // the upload audit trail — who uploaded which OB file and when — and
      // left the Upload Center with a single row no matter how many OB files
      // had ever been processed. The batch rows are metadata about the upload,
      // not the snapshot, and Data Operations is required to show them.
    }, IMPORT_TX_OPTIONS);
    const totalOpeningBalance = mapped.reduce((s, r) => s + r.amount, 0);
    return {
      fileName,
      batchId: batch.id,
      snapshotDate: iso(snapshotDate),
      totalRows: parsed.length,
      successRows: mapped.length,
      failedRows: errors.length,
      assignmentWarnings,
      newRetailers: autoCreated.created.length,
      newRetailerNote: describeCreatedRetailers(autoCreated),
      totalOpeningBalance,
      status: errors.length ? ImportStatus.COMPLETED_WITH_ERRORS : ImportStatus.COMPLETED,
    };
  } catch (error) {
    await prisma.importBatch
      .update({ where: { id: batch.id }, data: { status: ImportStatus.FAILED } })
      .catch(() => undefined);
    throw error;
  }
}

/**
 * Shared parsing and planning logic for the C2C and C2S monthly cumulative
 * imports (lib/c2c-import.ts, lib/c2s-import.ts).
 *
 * The two report types share an identical file format and business rules —
 * only the target Prisma models differ (C2cRecord/C2cMonthlySummary vs
 * C2sRecord/C2sMonthlySummary). Everything here is PURE (no Prisma import, no
 * I/O beyond reading the bytes already in memory), which is what makes it
 * possible to regression-test the import rules without a live database. The
 * two `import*Workbook` functions do the DB reads/writes and call into this
 * module for parsing, retailer mapping, and the month-replacement plan.
 *
 * Handoff rule (§11, §12, §30): a new C2C/C2S cumulative file is the
 * authoritative snapshot for that calendar month — the whole stored month is
 * replaced, never partially upserted. `planMonthReplacement` encodes that
 * contract: the delete side always covers the entire month regardless of
 * which retailers the new file contains, and the insert side contains
 * exactly the retailers present in the new file. A retailer missing from a
 * newer upload has no insert entry, so it has no visible data for that month
 * once the plan runs — this is what "no stale rows" means in practice.
 */

import * as XLSX from "xlsx";
import { assertRowLimit, looksLikeWorkbook } from "./upload-safety";
import crypto from "crypto";
import { phoneKey } from "./phone";

export type C2Kind = "C2C" | "C2S";

export type Cell = string | number | boolean | Date | null | undefined;
export type Matrix = Cell[][];

export type DateColumn = { index: number; label: string; date: Date };

export type ParsedC2Row = {
  rowNumber: number;
  retailerCode: string;
  retailerItopupNo: string;
  transactionCount: number;
  totalAmount: number;
  srNumber: string;
  daily: Array<{ date: Date; amount: number }>;
  /**
   * Everything the file knows about the outlet itself, which is enough to
   * create it if the Retailer Master has not caught up yet. Optional because
   * only RETAILER_CODE is required of these reports — a file without a name
   * column still imports, it just cannot name a retailer it creates.
   */
  identity: {
    retailerName: string;
    iTopUpSeller: string;
    enabled: string;
    /** The RSO's number as the master holds it, and the RSO's code. */
    iTopUpSrNumber: string;
    rsoCode: string;
  };
};

export type C2PreError = { rowNumber: number; message: string; rawData: object };

export type C2ParseResult = {
  dateColumns: DateColumn[];
  month: Date;
  firstDate: Date;
  reportEndDate: Date;
  sourceRows: ParsedC2Row[];
  preErrors: C2PreError[];
};

export const REQUIRED_C2_COLUMNS = [
  "RETAILER_CODE",
  "RETAILER_ITOPUP_NO",
  "TRANSACTION_COUNT",
  "TOTAL_AMOUNT",
  "SRNUMBER",
] as const;

export function text(value: Cell) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function header(value: Cell) {
  return text(value).toUpperCase().replace(/\s+/g, "_");
}

export function numberValue(value: Cell): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = text(value).replace(/,/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function digits(value: Cell) {
  return text(value).replace(/\D/g, "");
}

export function utcDate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day));
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

export function parseHeaderDate(value: Cell): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return utcDate(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return utcDate(parsed.y, parsed.m - 1, parsed.d);
  }
  const raw = text(value).replace(/\s+/g, " ").trim();
  const named = raw.match(/^(\d{1,2})[-/\s]([A-Za-z]{3,9})[-/\s](\d{2,4})(?:\s.*)?$/);
  if (named) {
    const monthIndex = MONTHS[named[2].slice(0, 3).toUpperCase()];
    if (monthIndex !== undefined) {
      const day = Number(named[1]);
      let year = Number(named[3]);
      if (year < 100) year += 2000;
      const result = utcDate(year, monthIndex, day);
      if (result.getUTCFullYear() === year && result.getUTCMonth() === monthIndex && result.getUTCDate() === day)
        return result;
    }
  }
  const numeric = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s.*)?$/);
  if (numeric) {
    const month = Number(numeric[1]) - 1,
      day = Number(numeric[2]),
      year = Number(numeric[3]);
    const result = utcDate(year, month, day);
    if (result.getUTCFullYear() === year && result.getUTCMonth() === month && result.getUTCDate() === day)
      return result;
  }
  return null;
}

export function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function monthStart(date: Date) {
  return utcDate(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

export function decodeReportText(bytes: Buffer): string {
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
  if (sample.length && nul / sample.length > 0.15) return bytes.toString("utf16le").replace(/^﻿/, "");
  return bytes.toString("utf8").replace(/^﻿/, "");
}

export function parseTabText(bytes: Buffer): Matrix | null {
  const source = decodeReportText(bytes);
  const firstChunk = source.slice(0, 12000);
  if (!firstChunk.includes("\t") || !firstChunk.toUpperCase().includes("RETAILER_CODE")) return null;
  return source
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split("\t"));
}

export function readMatrix(bytes: Buffer, kind: C2Kind): Matrix {
  /*
   * The workbook check comes FIRST, and that ordering is the whole fix.
   *
   * `parseTabText` used to run first and decide by looking for a tab and the
   * word RETAILER_CODE in the decoded bytes. A legacy .xls is an OLE2 file
   * whose strings are UTF-16, so decoded as text it contains both — the
   * sniffer claimed every .xls, split the binary on tabs, and the real parser
   * never ran. See `looksLikeWorkbook` for the full story.
   */
  if (!looksLikeWorkbook(bytes)) {
    const tab = parseTabText(bytes);
    if (tab) {
      // The tab-separated export returns before the workbook path below, so it
      // needs the same cap — a .txt file is not smaller by nature.
      assertRowLimit(tab.length, `${kind} text export`);
      return tab;
    }
  }

  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error(`No worksheet found in ${kind} file.`);
  const rows = XLSX.utils.sheet_to_json<Cell[]>(workbook.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: null,
  });
  assertRowLimit(rows.length, `${kind} workbook`);
  return rows;
}

export function findHeaderRow(matrix: Matrix, required: readonly string[]) {
  const max = Math.min(matrix.length, 30);
  for (let r = 0; r < max; r++) {
    const headers = (matrix[r] ?? []).map(header);
    if (required.every((key) => headers.includes(key))) return r;
  }
  return -1;
}

/**
 * Parses raw file bytes into validated rows. Throws on structural problems
 * (missing headings, no date columns, mixed calendar months, empty file) —
 * the same conditions the original single-file importers rejected before any
 * database call. Returns per-row validation failures in `preErrors` rather
 * than throwing, matching the original "collect them, report as one error"
 * behavior used by the caller.
 */
export function parseC2Workbook(bytes: Buffer, kind: C2Kind): C2ParseResult {
  const matrix = readMatrix(bytes, kind);
  if (matrix.length < 2) throw new Error(`The ${kind} report is empty.`);

  const headerRowIndex = findHeaderRow(matrix, REQUIRED_C2_COLUMNS);
  if (headerRowIndex < 0) {
    const candidates = matrix
      .slice(0, 30)
      .map((row, rowIndex) => {
        const hs = (row ?? []).map(header).filter(Boolean);
        const matched = REQUIRED_C2_COLUMNS.filter((key) => hs.includes(key));
        return { rowIndex, hs, matched };
      })
      .sort((a, b) => b.matched.length - a.matched.length);
    const best = candidates[0] || { rowIndex: 0, hs: [], matched: [] };
    const missing = REQUIRED_C2_COLUMNS.filter((key) => !best.hs.includes(key));
    throw new Error(
      `Required headings missing: ${missing.join(", ")}. Best header candidate was row ${best.rowIndex + 1} and contained: ${best.hs.join(", ") || "no recognizable headings"}.`,
    );
  }
  const headerRow = matrix[headerRowIndex] ?? [];
  const headers = headerRow.map(header);
  const idx: Record<string, number> = {};
  for (const key of REQUIRED_C2_COLUMNS) {
    const found = headers.indexOf(key);
    if (found < 0) throw new Error(`Required column ${key} was not found in the ${kind} report.`);
    idx[key] = found;
  }

  /*
   * Optional columns. The carrier's Sales and Balance exports carry
   * RETAILER_NAME, ITOPUPSELLER and ENABLED; StockLifting carries only the
   * name. None is required, so a missing one is an absent value rather than a
   * failed import.
   */
  const optional = (key: string) => {
    const found = headers.indexOf(key);
    return found < 0 ? null : found;
  };
  const nameCol = optional("RETAILER_NAME"),
    sellerCol = optional("ITOPUPSELLER"),
    enabledCol = optional("ENABLED"),
    itopSrCol = optional("ITOPUPSRNUMBER"),
    rsoCodeCol = optional("RSOCODE");

  const dateColumns: DateColumn[] = [];
  for (let i = 0; i < headerRow.length; i++) {
    const date = parseHeaderDate(headerRow[i]);
    if (date) dateColumns.push({ index: i, label: text(headerRow[i]), date });
  }
  if (!dateColumns.length)
    throw new Error(
      "No daily date columns were found in the detected report header. Supported examples: 01-Aug-2026, 01-Aug-26, 8/1/2026.",
    );

  dateColumns.sort((a, b) => a.date.getTime() - b.date.getTime());
  const firstDate = dateColumns[0].date;
  const reportEndDate = dateColumns[dateColumns.length - 1].date;
  const month = monthStart(firstDate);
  if (
    dateColumns.some(
      (c) => c.date.getUTCFullYear() !== firstDate.getUTCFullYear() || c.date.getUTCMonth() !== firstDate.getUTCMonth(),
    )
  ) {
    throw new Error(`${kind} date columns must belong to one calendar month per upload.`);
  }

  const sourceRows: ParsedC2Row[] = [];
  const preErrors: C2PreError[] = [];

  for (let i = headerRowIndex + 1; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    if (!row.some((cell) => text(cell))) continue;

    const retailerCode = text(row[idx.RETAILER_CODE]).toUpperCase();
    if (!retailerCode) continue;

    const transactionCount = numberValue(row[idx.TRANSACTION_COUNT]);
    const totalAmount = numberValue(row[idx.TOTAL_AMOUNT]);
    if (transactionCount === null || transactionCount < 0 || !Number.isInteger(transactionCount)) {
      preErrors.push({ rowNumber: i + 1, message: "TRANSACTION_COUNT is invalid", rawData: { retailerCode } });
      continue;
    }
    if (totalAmount === null || totalAmount < 0) {
      preErrors.push({ rowNumber: i + 1, message: "TOTAL_AMOUNT is invalid", rawData: { retailerCode } });
      continue;
    }

    const daily: Array<{ date: Date; amount: number }> = [];
    let dailyTotal = 0;
    let invalidDaily = false;
    for (const col of dateColumns) {
      const amount = numberValue(row[col.index]);
      if (amount === null || amount < 0) {
        preErrors.push({ rowNumber: i + 1, message: `Invalid amount in ${col.label}`, rawData: { retailerCode } });
        invalidDaily = true;
        break;
      }
      dailyTotal += amount;
      if (amount !== 0) daily.push({ date: col.date, amount });
    }
    if (invalidDaily) continue;

    if (Math.abs(dailyTotal - totalAmount) > 0.01) {
      preErrors.push({
        rowNumber: i + 1,
        message: `Daily amount sum (${dailyTotal}) does not match TOTAL_AMOUNT (${totalAmount})`,
        rawData: { retailerCode },
      });
      continue;
    }

    sourceRows.push({
      rowNumber: i + 1,
      retailerCode,
      retailerItopupNo: digits(row[idx.RETAILER_ITOPUP_NO]),
      transactionCount,
      totalAmount,
      srNumber: digits(row[idx.SRNUMBER]),
      daily,
      identity: {
        retailerName: nameCol === null ? "" : text(row[nameCol]),
        iTopUpSeller: sellerCol === null ? "" : text(row[sellerCol]),
        enabled: enabledCol === null ? "" : text(row[enabledCol]),
        iTopUpSrNumber: itopSrCol === null ? "" : digits(row[itopSrCol]),
        rsoCode: rsoCodeCol === null ? "" : text(row[rsoCodeCol]),
      },
    });
  }

  // Only throw here when the file had no attempted data rows at all (every
  // line was blank or missing a retailer code). A row that was attempted but
  // failed field validation lands in `preErrors` instead, and is reported by
  // the caller as part of its normal "N invalid or unmapped row(s)" message —
  // that is a different, more specific failure than "nothing to import".
  if (!sourceRows.length && !preErrors.length)
    throw new Error(`No valid retailer rows were found in the ${kind} report.`);

  return { dateColumns, month, firstDate, reportEndDate, sourceRows, preErrors };
}

export type C2RetailerRef = {
  id: string;
  retailerCode: string;
  employeeId: string | null;
  employee: { rsoMsisdn: string | null } | null;
};

export type MappedC2Row = ParsedC2Row & { retailerId: string };

/**
 * Maps validated source rows to retailer ids and flags RSO/SR-number
 * mismatches. Rows whose retailer code is not in the map become errors
 * rather than being silently dropped — an unmapped row must never write.
 */
export function mapRetailersForC2Rows(sourceRows: ParsedC2Row[], retailerMap: Map<string, C2RetailerRef>) {
  const errors: C2PreError[] = [];
  const mapped: MappedC2Row[] = [];
  let assignmentWarnings = 0;

  for (const row of sourceRows) {
    const retailer = retailerMap.get(row.retailerCode);
    if (!retailer) {
      errors.push({
        rowNumber: row.rowNumber,
        message: `Retailer ${row.retailerCode} does not exist in Retailer Master`,
        rawData: { retailerCode: row.retailerCode, srNumber: row.srNumber },
      });
      continue;
    }
    const masterRso = phoneKey(retailer.employee?.rsoMsisdn ?? "");
    const sourceRso = phoneKey(row.srNumber);
    if (masterRso && sourceRso && masterRso !== sourceRso) assignmentWarnings++;
    mapped.push({ ...row, retailerId: retailer.id });
  }

  return { mapped, errors, assignmentWarnings };
}

export function computeImportHash(bytes: Buffer) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

/**
 * How long one import's write transaction may take, and how long it may wait
 * for a connection.
 *
 * ## Why these are not the defaults
 *
 * Prisma allows an interactive transaction 5 seconds. That is generous on a
 * database running on the same machine and nowhere near enough on a hosted one,
 * where every round trip costs real network time. The owner's upload failed
 * with:
 *
 *     Transaction API error: Transaction already closed: A query cannot be
 *     executed on an expired transaction. The timeout for this transaction was
 *     5000 ms, however 5041 ms passed since the start of the transaction.
 *
 * 5041 ms — it ran out by 41 milliseconds. The same file imports in about two
 * seconds against a local Postgres, which is why nothing here ever showed it.
 *
 * The round trips were the real fault and are fixed separately (see the
 * `createMany` below). This budget exists because the remaining work is still
 * proportional to the file: a 250,000-row import is allowed to take minutes,
 * and a slow link must not turn a correct import into a rollback. The route
 * itself is capped at 60 seconds, so this is a ceiling rather than a promise.
 */
/** Rows per `createMany`. Large enough to be few round trips, small enough to
 *  stay under any driver's parameter limit. */
export const IMPORT_CHUNK = 1000;

export const IMPORT_TX_OPTIONS = { maxWait: 30_000, timeout: 120_000 } as const;

export type C2DailyRecordInput = {
  retailerId: string;
  date: Date;
  transactionCount: number;
  amount: number;
  batchId: string;
};

export type C2MonthlySummaryInput = {
  retailerId: string;
  month: Date;
  transactionCount: number;
  totalAmount: number;
  reportEndDate: Date;
};

export type C2ReplacementPlan = {
  month: Date;
  monthEnd: Date;
  /** Whole-month delete filter for the daily table. Never narrowed by retailer. */
  deleteDailyWhere: { date: { gte: Date; lt: Date } };
  /** Whole-month delete filter for the monthly-summary table. Never narrowed by retailer. */
  deleteSummaryWhere: { month: Date };
  dailyRecords: C2DailyRecordInput[];
  monthlySummaries: C2MonthlySummaryInput[];
};

/**
 * Builds the authoritative-replacement plan for one month: delete the entire
 * stored month, then insert exactly what the new file contains. This is the
 * pure decision layer behind the "newer cumulative file replaces the whole
 * month" rule — the delete side is intentionally NOT filtered by which
 * retailers appear in `mapped`, so a retailer absent from the new file has no
 * insert entry and therefore no data left for the month once this plan runs.
 */
/**
 * Combines the rows of one retailer into one.
 *
 * ## Why this is necessary
 *
 * A BP retailer served by more than one RSO gets **one line per RSO** in the
 * carrier's StockLifting export. In the owner's real file, eight retailers
 * appeared twice or three times — every one of them a BP — and one of them
 * appeared twice under the same RSO code:
 *
 *     R341946  R.R Enterprise BP-15  RS041549 …
 *     R341946  R.R Enterprise BP-15  RS055606 …
 *     R341946  R.R Enterprise BP-15  RS041549 …
 *
 * Both storage tables are unique on the retailer — `C2cDaily(retailerId, date)`
 * and `C2cMonthlySummary(retailerId, month)` — so the second line of a repeated
 * retailer violated the constraint and **the entire upload was rolled back**.
 * Not that retailer's row: the whole file, all 1,936 rows of it, with a Prisma
 * constraint error on screen. A daily upload could not complete at all.
 *
 * ## Why summing is the right answer
 *
 * The amounts are the same retailer's, arriving through different RSOs. What
 * that outlet lifted this month is what came through all of them, so the
 * figures add. Keeping only the first line would silently discard the rest —
 * which is worse than the crash, because nothing would say so. On the owner's
 * current file every duplicate happens to be zero, so this changes no number
 * today; it changes what happens the day one of those BPs actually lifts stock
 * through two RSOs.
 */
export function mergeRowsByRetailer(mapped: MappedC2Row[]): MappedC2Row[] {
  const byRetailer = new Map<string, MappedC2Row>();
  for (const row of mapped) {
    const seen = byRetailer.get(row.retailerId);
    if (!seen) {
      // Copied, not referenced — the caller's rows must not be mutated.
      byRetailer.set(row.retailerId, { ...row, daily: row.daily.map((d) => ({ ...d })) });
      continue;
    }
    seen.transactionCount += row.transactionCount;
    seen.totalAmount += row.totalAmount;
    for (const day of row.daily) {
      const key = day.date.getTime();
      const existing = seen.daily.find((d) => d.date.getTime() === key);
      if (existing) existing.amount += day.amount;
      else seen.daily.push({ ...day });
    }
  }
  for (const row of byRetailer.values()) row.daily.sort((a, b) => a.date.getTime() - b.date.getTime());
  return [...byRetailer.values()];
}

export function planMonthReplacement(params: {
  month: Date;
  batchId: string;
  reportEndDate: Date;
  mapped: MappedC2Row[];
}): C2ReplacementPlan {
  const { month, batchId, reportEndDate } = params;
  const mapped = mergeRowsByRetailer(params.mapped);
  const monthEnd = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));

  const dailyRecords: C2DailyRecordInput[] = [];
  for (const row of mapped) {
    for (const day of row.daily) {
      dailyRecords.push({
        retailerId: row.retailerId,
        date: day.date,
        transactionCount: 0,
        amount: day.amount,
        batchId,
      });
    }
  }

  const monthlySummaries: C2MonthlySummaryInput[] = mapped.map((row) => ({
    retailerId: row.retailerId,
    month,
    transactionCount: row.transactionCount,
    totalAmount: row.totalAmount,
    reportEndDate,
  }));

  return {
    month,
    monthEnd,
    deleteDailyWhere: { date: { gte: month, lt: monthEnd } },
    deleteSummaryWhere: { month },
    dailyRecords,
    monthlySummaries,
  };
}

/**
 * The four writes a month replacement needs, independent of which table.
 *
 * C2C and C2S do the same thing to different models, and Prisma's transaction
 * client types them as unrelated. This interface is what lets both share one
 * implementation — and, more usefully, what lets a test count the statements
 * without a database.
 */
export type C2MonthWriter = {
  deleteDaily(where: C2ReplacementPlan["deleteDailyWhere"]): Promise<unknown>;
  deleteSummaries(where: C2ReplacementPlan["deleteSummaryWhere"]): Promise<unknown>;
  createDaily(rows: C2DailyRecordInput[]): Promise<unknown>;
  createSummaries(rows: C2MonthlySummaryInput[]): Promise<unknown>;
};

/**
 * Writes one month, in as few statements as the chunk size allows.
 *
 * ## The bug this shape exists to prevent
 *
 * The summaries used to be written one row at a time — `create` in a loop,
 * 1,927 of them for the owner's real file, inside one interactive transaction.
 * Against a database on the same machine that is about two seconds and nobody
 * notices. Against a hosted one, every statement is a network round trip, and
 * the upload died with:
 *
 *     Transaction API error: Transaction already closed … The timeout for this
 *     transaction was 5000 ms, however 5041 ms passed since the start of the
 *     transaction.
 *
 * The whole transaction rolled back, so a file that was entirely valid stored
 * nothing at all. The daily records beside it were already batched; only the
 * summaries were not.
 *
 * The number of statements here depends on the CHUNK COUNT, never on the row
 * count. That is the property worth holding, and it is what
 * tests/import-write-batching.smoke.test.ts measures.
 */
export async function writeMonthPlan(writer: C2MonthWriter, plan: C2ReplacementPlan): Promise<void> {
  await writer.deleteDaily(plan.deleteDailyWhere);
  await writer.deleteSummaries(plan.deleteSummaryWhere);
  for (let i = 0; i < plan.dailyRecords.length; i += IMPORT_CHUNK)
    await writer.createDaily(plan.dailyRecords.slice(i, i + IMPORT_CHUNK));
  for (let i = 0; i < plan.monthlySummaries.length; i += IMPORT_CHUNK)
    await writer.createSummaries(plan.monthlySummaries.slice(i, i + IMPORT_CHUNK));
}

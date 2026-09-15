import crypto from "crypto";
import { assertRowLimit } from "./upload-safety";
import * as XLSX from "xlsx";
import { ImportStatus, ImportType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { IMPORT_CHUNK, IMPORT_TX_OPTIONS } from "./c2-import-core";
import { classifyGaActivation, ga170Tariff, isStandardGaProduct, isSimSwapProduct } from "./business-rules";
import { forgetGaTariff } from "./ga-tariff";

type Cell = string | number | boolean | Date | null | undefined;

/** A row the import could not accept, as it is stored against the batch. */
export type ImportErrorRow = { rowNumber: number; message: string; rawData: object };

type ParsedActivation = {
  rowNumber: number;
  retailerCode: string;
  simNo: string;
  sellingPrice: number;
  productCode: string;
  activationDate: Date;
  activationTime: string | null;
};

function asText(value: Cell) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeHeader(value: Cell) {
  return asText(value).toUpperCase().replace(/\s+/g, "_");
}

function normalizeSimNo(value: Cell) {
  return asText(value).replace(/^'+/, "").replace(/\s+/g, "");
}

function asNumber(value: Cell): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = asText(value).replace(/,/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function dateOnlyUtc(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day));
}

function parseDate(value: Cell): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return dateOnlyUtc(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return dateOnlyUtc(parsed.y, parsed.m - 1, parsed.d);
  }

  const text = asText(value);
  if (!text) return null;

  const dmy = text.match(/^(\d{1,2})[-\/]([A-Za-z]{3}|\d{1,2})[-\/](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const monthToken = dmy[2];
    const year = Number(dmy[3]);
    const monthNames: Record<string, number> = {
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
    const monthIndex = /^[A-Za-z]/.test(monthToken)
      ? monthNames[monthToken.slice(0, 3).toUpperCase()]
      : Number(monthToken) - 1;
    if (monthIndex !== undefined && monthIndex >= 0 && monthIndex <= 11) {
      const result = dateOnlyUtc(year, monthIndex, day);
      if (result.getUTCFullYear() === year && result.getUTCMonth() === monthIndex && result.getUTCDate() === day) {
        return result;
      }
    }
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return dateOnlyUtc(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
  }
  return null;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizeTime(value: Cell): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
  }
  if (typeof value === "number" && value >= 0 && value < 1) {
    const totalSeconds = Math.round(value * 24 * 60 * 60) % 86400;
    const h24 = Math.floor(totalSeconds / 3600);
    const minute = Math.floor((totalSeconds % 3600) / 60);
    const second = totalSeconds % 60;
    const suffix = h24 >= 12 ? "PM" : "AM";
    const hour = h24 % 12 || 12;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")} ${suffix}`;
  }
  return asText(value) || null;
}

/**
 * Everything the GA importer decides before it touches the database.
 *
 * Split out so the rules a row must satisfy can be tested against a real
 * workbook without a Postgres. The rule that broke — a swap had to cost exactly
 * 350 — lived in here and was only reachable through a function that opened a
 * transaction, which is a large part of why nobody noticed until the tariff
 * moved and every upload started failing.
 */
export function parseGaWorkbook(bytes: Buffer) {
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("No worksheet found in Excel file.");

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, raw: true, defval: null });
  assertRowLimit(rows.length, "GA workbook");
  if (rows.length < 2) throw new Error("The activation file is empty.");

  const headers = (rows[0] ?? []).map(normalizeHeader);
  const required = ["RETAILER_CODE", "SIM_NO", "PRODUCT_CODE", "SELLING_PRICE", "ACTIVATION_DATE", "ACTIVATION_TIME"];
  const index: Record<string, number> = {};
  const missingHeaders = required.filter((header) => !headers.includes(header));
  if (missingHeaders.length) {
    throw new Error(
      `Required heading${missingHeaders.length > 1 ? "s" : ""} missing: ${missingHeaders.join(", ")}. Found headings: ${headers.filter(Boolean).join(", ") || "none"}.`,
    );
  }
  for (const header of required) index[header] = headers.indexOf(header);

  const parsedRows: ParsedActivation[] = [];
  const preErrors: ImportErrorRow[] = [];
  let sourceRows = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (!row.some((cell) => asText(cell))) continue;
    sourceRows++;

    const retailerCode = asText(row[index.RETAILER_CODE]).toUpperCase();
    const simNo = normalizeSimNo(row[index.SIM_NO]);
    const productCode = asText(row[index.PRODUCT_CODE]).toUpperCase();
    const sellingPrice = asNumber(row[index.SELLING_PRICE]);
    const activationDate = parseDate(row[index.ACTIVATION_DATE]);
    const activationTime = normalizeTime(row[index.ACTIVATION_TIME]);

    if (!retailerCode) {
      preErrors.push({ rowNumber: i + 1, message: "RETAILER_CODE is blank", rawData: { simNo } });
      continue;
    }
    if (!simNo) {
      preErrors.push({ rowNumber: i + 1, message: "SIM_NO is blank", rawData: { retailerCode } });
      continue;
    }
    if (!productCode) {
      preErrors.push({ rowNumber: i + 1, message: "PRODUCT_CODE is blank", rawData: { retailerCode, simNo } });
      continue;
    }
    if (sellingPrice === null || sellingPrice < 0) {
      preErrors.push({ rowNumber: i + 1, message: "SELLING_PRICE is invalid", rawData: { retailerCode, simNo } });
      continue;
    }
    /*
     * No price check here, deliberately.
     *
     * This used to require a SIMWAP row to cost exactly 350 and an EV-SWAP row
     * exactly 100, and rejected the row otherwise. The moment the swap price
     * moved to 150 that turned into a wall: every swap row in every new GA file
     * failed with "SIMWAP must have SELLING_PRICE 350 for SIM SWAP
     * verification", so the whole upload could not update the list.
     *
     * The price is a tariff. It changes, and it will change again. What makes a
     * row a replacement rather than a new activation is its PRODUCT_CODE, and
     * that is what classifies it — see `classifyGaActivation`. The price is
     * still read and stored, because it is real data worth keeping; it simply
     * no longer decides whether the row is allowed in.
     */
    if (!activationDate) {
      preErrors.push({ rowNumber: i + 1, message: "ACTIVATION_DATE is invalid", rawData: { retailerCode, simNo } });
      continue;
    }

    parsedRows.push({
      rowNumber: i + 1,
      retailerCode,
      simNo,
      productCode,
      sellingPrice,
      activationDate,
      activationTime,
    });
  }

  if (!sourceRows) throw new Error("No activation rows were found in the uploaded file.");
  if (preErrors.length) {
    const preview = preErrors
      .slice(0, 8)
      .map((e) => `Row ${e.rowNumber}: ${e.message}`)
      .join("; ");
    throw new Error(
      `Data validation failed: ${preErrors.length} invalid row(s). ${preview}${preErrors.length > 8 ? " …" : ""}`,
    );
  }
  if (!parsedRows.length) throw new Error("No valid activation rows were found in the uploaded file.");

  // `preErrors` is empty by the time we get here — the throw above sees to
  // that — but it is returned rather than dropped so the caller's accounting
  // stays literally the same as before this split.
  return { parsedRows, sourceRows, sheetName, preErrors };
}

/** One activation as it will be written. `id`/`createdAt` are set only on a rewrite. */
export type GaWriteRow = {
  id?: string;
  createdAt?: Date;
  simNo: string;
  retailerId: string;
  activationDate: Date;
  activationTime: string | null;
  sellingPrice: Prisma.Decimal;
  productCode: string;
  batchId: string;
};

export type GaWritePlan = {
  /** Every row to land in the table — new activations and rewritten ones. */
  rows: GaWriteRow[];
  /** The ids being replaced, cleared first so the unique simNo is free. */
  replacedIds: string[];
};

/** The database calls writeGaPlan makes, so the plan can be tested without one. */
export interface GaWriter {
  deleteActivations(ids: string[]): Promise<unknown>;
  createActivations(rows: GaWriteRow[]): Promise<unknown>;
}

export type GaExistingRow = {
  id: string;
  retailerId: string;
  activationDate: Date;
  activationTime: string | null;
  sellingPrice: Prisma.Decimal | number;
  productCode: string | null;
  createdAt: Date;
};

export type GaPlanInput = {
  parsedRows: ParsedActivation[];
  /** RETAILER_CODE (upper case) to retailer id. */
  retailerMap: Map<string, string>;
  /** SIM_NO to the row already stored under it. */
  existing: Map<string, GaExistingRow>;
  batchId: string;
  preErrors: ImportErrorRow[];
};

/**
 * Decide what the import will write, without touching the database.
 *
 * Pure on purpose, and split out for the same reason `planMonthReplacement` is:
 * the interesting rules — which row is new, which is a correction, which is the
 * same row arriving twice, and the fact that a correction keeps its `id` and
 * `createdAt` — can then be tested by reading the plan rather than by standing
 * up Postgres and reading it back.
 */
export function planGaWrite(input: GaPlanInput) {
  const { parsedRows, retailerMap, existing, batchId, preErrors } = input;
  const plan: GaWritePlan = { rows: [], replacedIds: [] };
  const errors: ImportErrorRow[] = [...preErrors];
  const seenInFile = new Set<string>();
  let insertedRows = 0;
  let updatedRows = 0;
  let duplicateRows = 0;

  for (const row of parsedRows) {
    // The same SIM twice in one file is the file's problem, not a correction:
    // the second line is counted and dropped rather than rewriting the first.
    if (seenInFile.has(row.simNo)) {
      duplicateRows++;
      continue;
    }
    seenInFile.add(row.simNo);

    const retailerId = retailerMap.get(row.retailerCode);
    if (!retailerId) {
      errors.push({
        rowNumber: row.rowNumber,
        message: `Retailer ${row.retailerCode} does not exist in Retailer Master`,
        rawData: { retailerCode: row.retailerCode, simNo: row.simNo },
      });
      continue;
    }

    const written = {
      simNo: row.simNo,
      retailerId,
      activationDate: row.activationDate,
      activationTime: row.activationTime,
      sellingPrice: new Prisma.Decimal(row.sellingPrice),
      productCode: row.productCode,
      batchId,
    };

    const old = existing.get(row.simNo);
    if (!old) {
      insertedRows++;
      plan.rows.push(written);
      continue;
    }

    const unchanged =
      old.retailerId === retailerId &&
      isoDate(old.activationDate) === isoDate(row.activationDate) &&
      (old.activationTime ?? "") === (row.activationTime ?? "") &&
      Number(old.sellingPrice) === row.sellingPrice &&
      (old.productCode ?? "") === row.productCode;

    if (unchanged) {
      duplicateRows++;
      continue;
    }

    /*
     * A changed row is rewritten, not updated in place — and it carries its own
     * `id` and `createdAt` across, so the swap is invisible to every reader.
     * That is what makes the batching safe; see writeGaPlan for why an update
     * cannot be batched and a rewrite can.
     */
    updatedRows++;
    plan.replacedIds.push(old.id);
    plan.rows.push({ id: old.id, createdAt: old.createdAt, ...written });
  }

  return { plan, insertedRows, updatedRows, duplicateRows, errors };
}

/**
 * Write a GA import in a handful of statements instead of one per row.
 *
 * ## What was wrong
 *
 * The importer built one `prisma.gaActivation.create()` or `.update()` per row
 * and handed the whole array to `$transaction`. A 9,000-row GA file was 9,000
 * statements, measured at **8,974 ms against a Postgres on the same machine**.
 * On the owner's hosted database every one of those is a network round trip —
 * the C2C importer died at 2.6 ms each — and `/api/import/[type]` is capped at
 * `maxDuration = 60`. The file does not have to be much larger than a normal
 * day before the route is killed mid-transaction, which rolls the whole thing
 * back and stores nothing.
 *
 * This is the third time this project has paid for per-row writes (v156 OB,
 * v163 C2C/C2S). The guard written in v163 listed the importers by name and GA
 * was not among them, which is exactly the failure mode its own comment warned
 * about — "fixing two importers and forgetting the third".
 *
 * ## Why a rewrite rather than an update
 *
 * `createMany` batches inserts, and nothing batches per-row updates: each one
 * carries a different payload, so `updateMany` cannot express them. A changed
 * row is therefore deleted and re-inserted **carrying its original `id` and
 * `createdAt`**, which makes the two paths identical in cost and the swap
 * invisible: no column any reader can see changes value, nothing holds a
 * foreign key to GaActivation, and both statements run inside one transaction.
 *
 * Cost is now `1 + ceil(rows / IMPORT_CHUNK)` statements, and it stops growing
 * with the file.
 */
export async function writeGaPlan(writer: GaWriter, plan: GaWritePlan) {
  /*
   * Deletes first, and all of them before any insert. A rewritten row re-uses
   * its own simNo, which is unique — inserting it before its old copy is gone
   * is a constraint violation, and doing the two chunk-by-chunk would trip over
   * rows in a later chunk.
   */
  if (plan.replacedIds.length)
    for (let i = 0; i < plan.replacedIds.length; i += IMPORT_CHUNK)
      await writer.deleteActivations(plan.replacedIds.slice(i, i + IMPORT_CHUNK));

  for (let i = 0; i < plan.rows.length; i += IMPORT_CHUNK)
    await writer.createActivations(plan.rows.slice(i, i + IMPORT_CHUNK));
}

/**
 * What the file turned out to contain, in the app's own terms.
 *
 * Returned with every import so a new product code announces itself instead of
 * disappearing. That is the whole lesson of the September file: `SIMSWAP`,
 * `ESIMSWAP`, `MMSTSC` and `MMST1911` — 579 of 2,527 rows — were classified as
 * "unknown" and silently left out of every total, and nothing on any screen
 * said so. The rules now place them automatically; this line is how anybody
 * notices that a decision was made on their behalf.
 */
export function gaShape(rows: readonly ParsedActivation[]) {
  const tariff = ga170Tariff(rows);
  let ga170 = 0,
    ga300 = 0,
    simSwap = 0;
  const unfamiliar = new Map<string, number>();
  for (const row of rows) {
    switch (classifyGaActivation(row, tariff)) {
      case "GA_170":
        ga170++;
        break;
      case "GA_300":
        ga300++;
        break;
      case "SIM_SWAP":
        simSwap++;
        break;
    }
    // "Unfamiliar" is not "uncounted": every one of these was placed. It is
    // reported because a code the app has never seen is worth a human glance.
    if (!isStandardGaProduct(row.productCode) && !isSimSwapProduct(row.productCode))
      unfamiliar.set(row.productCode, (unfamiliar.get(row.productCode) ?? 0) + 1);
  }
  return {
    standardGa: ga170 + ga300,
    ga170,
    ga300,
    simSwap,
    ga170Tariff: [...tariff].sort((a, b) => a - b),
    unfamiliarCodes: [...unfamiliar.entries()].sort((a, b) => b[1] - a[1]).map(([code, count]) => ({ code, count })),
  };
}

export async function importGaActivationWorkbook(fileName: string, bytes: Buffer) {
  const { parsedRows, sourceRows, sheetName, preErrors } = parseGaWorkbook(bytes);

  const activationDates = parsedRows.map((row) => row.activationDate.getTime());
  const reportStartDate = new Date(Math.min(...activationDates));
  const reportEndDate = new Date(Math.max(...activationDates));

  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  const duplicateFile = await prisma.importBatch.findUnique({ where: { hash } });
  if (duplicateFile) {
    return {
      duplicate: true,
      batchId: duplicateFile.id,
      fileName: duplicateFile.fileName,
      businessDate: duplicateFile.businessDate,
      totalRows: duplicateFile.totalRows,
      successRows: duplicateFile.successRows,
      failedRows: duplicateFile.failedRows,
      duplicateRows: duplicateFile.duplicateRows,
      status: duplicateFile.status,
    };
  }

  const retailerCodes = [...new Set(parsedRows.map((row) => row.retailerCode))];
  const retailers = await prisma.retailer.findMany({
    where: { retailerCode: { in: retailerCodes } },
    select: { id: true, retailerCode: true },
  });
  const retailerMap = new Map(retailers.map((r) => [r.retailerCode.toUpperCase(), r.id]));
  const missingRetailers = [
    ...new Set(parsedRows.filter((row) => !retailerMap.has(row.retailerCode)).map((row) => row.retailerCode)),
  ];
  if (missingRetailers.length) {
    throw new Error(
      `Data validation failed: retailer code${missingRetailers.length > 1 ? "s" : ""} not found in Retailer Master: ${missingRetailers.slice(0, 12).join(", ")}${missingRetailers.length > 12 ? " …" : ""}`,
    );
  }

  const simNumbers = [...new Set(parsedRows.map((row) => row.simNo))];
  const existing = await prisma.gaActivation.findMany({
    where: { simNo: { in: simNumbers } },
    select: {
      id: true,
      simNo: true,
      retailerId: true,
      activationDate: true,
      activationTime: true,
      sellingPrice: true,
      productCode: true,
      // Carried through a replacement rather than re-stamped. See writeGaPlan.
      createdAt: true,
    },
  });
  const existingMap = new Map(existing.map((row) => [row.simNo, row]));

  const batch = await prisma.importBatch.create({
    data: {
      type: ImportType.GA,
      fileName,
      hash,
      businessDate: reportEndDate,
      totalRows: sourceRows,
      status: ImportStatus.PROCESSING,
    },
  });

  const { plan, insertedRows, updatedRows, duplicateRows, errors } = planGaWrite({
    parsedRows,
    retailerMap,
    existing: existingMap,
    batchId: batch.id,
    preErrors,
  });
  const failedRows = errors.length;

  try {
    if (plan.rows.length)
      await prisma.$transaction(
        async (tx) =>
          writeGaPlan(
            {
              deleteActivations: (ids) => tx.gaActivation.deleteMany({ where: { id: { in: ids } } }),
              createActivations: (rows) => tx.gaActivation.createMany({ data: rows }),
            },
            plan,
          ),
        IMPORT_TX_OPTIONS,
      );
    if (errors.length) {
      await prisma.importError.createMany({
        data: errors.map((error) => ({ batchId: batch.id, ...error })),
      });
    }

    /*
     * The tariff has just moved, if it moved at all — the next screen must not
     * read a cached one from before this file landed.
     */
    forgetGaTariff();

    const successRows = insertedRows + updatedRows;
    const status = failedRows ? ImportStatus.COMPLETED_WITH_ERRORS : ImportStatus.COMPLETED;
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: { successRows, failedRows, duplicateRows, status },
    });

    return {
      duplicate: false,
      batchId: batch.id,
      fileName,
      sheetName,
      businessDate: isoDate(reportEndDate),
      reportStartDate: isoDate(reportStartDate),
      reportEndDate: isoDate(reportEndDate),
      totalRows: sourceRows,
      successRows,
      insertedRows,
      updatedRows,
      duplicateRows,
      failedRows,
      status,
      ...gaShape(parsedRows),
    };
  } catch (error) {
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: { status: ImportStatus.FAILED },
    });
    throw error;
  }
}

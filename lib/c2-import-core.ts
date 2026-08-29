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
import { assertRowLimit } from "./upload-safety";
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
  const tab = parseTabText(bytes);
  if (tab) {
    // The tab-separated export returns before the workbook path below, so it
    // needs the same cap — a .txt file is not smaller by nature.
    assertRowLimit(tab.length, `${kind} text export`);
    return tab;
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
export function planMonthReplacement(params: {
  month: Date;
  batchId: string;
  reportEndDate: Date;
  mapped: MappedC2Row[];
}): C2ReplacementPlan {
  const { month, batchId, reportEndDate, mapped } = params;
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

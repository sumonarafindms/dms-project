import crypto from "crypto";
import * as XLSX from "xlsx";
import { ImportStatus, ImportType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Cell = string | number | boolean | Date | null | undefined;
type Matrix = Cell[][];

type DateColumn = { index: number; label: string; date: Date };

type ParsedRow = {
  rowNumber: number;
  retailerCode: string;
  retailerItopupNo: string;
  transactionCount: number;
  totalAmount: number;
  srNumber: string;
  daily: Array<{ date: Date; amount: number }>;
};

function text(value: Cell) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function header(value: Cell) {
  return text(value).toUpperCase().replace(/\s+/g, "_");
}

function numberValue(value: Cell): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = text(value).replace(/,/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function digits(value: Cell) {
  return text(value).replace(/\D/g, "");
}

function phoneKey(value: Cell) {
  return digits(value).replace(/^0+/, "");
}

function utcDate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day));
}

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

function parseHeaderDate(value: Cell): Date | null {
  const raw = text(value);
  const match = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!match) return null;
  const monthIndex = MONTHS[match[2].toUpperCase()];
  if (monthIndex === undefined) return null;
  const day = Number(match[1]);
  const year = Number(match[3]);
  const result = utcDate(year, monthIndex, day);
  return result.getUTCFullYear() === year && result.getUTCMonth() === monthIndex && result.getUTCDate() === day
    ? result
    : null;
}

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function monthStart(date: Date) {
  return utcDate(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function parseTabText(bytes: Buffer): Matrix | null {
  const sample = bytes.subarray(0, Math.min(bytes.length, 4096)).toString("utf8");
  if (!sample.includes("\t") || !sample.includes("RETAILER_CODE")) return null;
  const source = bytes.toString("utf8").replace(/^\uFEFF/, "");
  return source.split(/\r?\n/).filter((line) => line.length > 0).map((line) => line.split("\t"));
}

function readMatrix(bytes: Buffer): Matrix {
  const tab = parseTabText(bytes);
  if (tab) return tab;

  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("No worksheet found in C2C file.");
  return XLSX.utils.sheet_to_json<Cell[]>(workbook.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: null,
  });
}

export async function importC2cWorkbook(fileName: string, bytes: Buffer) {
  const matrix = readMatrix(bytes);
  if (matrix.length < 2) throw new Error("The C2C report is empty.");

  const headers = (matrix[0] ?? []).map(header);
  const required = ["RETAILER_CODE", "RETAILER_ITOPUP_NO", "TRANSACTION_COUNT", "TOTAL_AMOUNT", "SRNUMBER"];
  const idx: Record<string, number> = {};
  for (const key of required) {
    const found = headers.indexOf(key);
    if (found < 0) throw new Error(`Required column ${key} was not found in the C2C report.`);
    idx[key] = found;
  }

  const dateColumns: DateColumn[] = [];
  for (let i = 0; i < (matrix[0] ?? []).length; i++) {
    const date = parseHeaderDate((matrix[0] ?? [])[i]);
    if (date) dateColumns.push({ index: i, label: text((matrix[0] ?? [])[i]), date });
  }
  if (!dateColumns.length) throw new Error("No daily date columns such as 01-Aug-2026 were found in row 1.");

  dateColumns.sort((a, b) => a.date.getTime() - b.date.getTime());
  const firstDate = dateColumns[0].date;
  const reportEndDate = dateColumns[dateColumns.length - 1].date;
  const month = monthStart(firstDate);
  if (dateColumns.some((c) => c.date.getUTCFullYear() !== firstDate.getUTCFullYear() || c.date.getUTCMonth() !== firstDate.getUTCMonth())) {
    throw new Error("C2C date columns must belong to one calendar month per upload.");
  }

  const sourceRows: ParsedRow[] = [];
  const preErrors: Array<{ rowNumber: number; message: string; rawData: object }> = [];

  for (let i = 1; i < matrix.length; i++) {
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
    if (daily.length !== transactionCount) {
      preErrors.push({
        rowNumber: i + 1,
        message: `Non-zero date count (${daily.length}) does not match TRANSACTION_COUNT (${transactionCount})`,
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

  if (!sourceRows.length) throw new Error("No valid retailer rows were found in the C2C report.");

  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  const prior = await prisma.importBatch.findUnique({ where: { hash } });
  if (prior) {
    return {
      duplicate: true,
      batchId: prior.id,
      fileName: prior.fileName,
      businessDate: prior.businessDate,
      totalRows: prior.totalRows,
      successRows: prior.successRows,
      failedRows: prior.failedRows,
      status: prior.status,
      month: iso(month),
      reportEndDate: iso(reportEndDate),
    };
  }

  const retailerCodes = [...new Set(sourceRows.map((r) => r.retailerCode))];
  const retailers = await prisma.retailer.findMany({
    where: { retailerCode: { in: retailerCodes } },
    select: {
      id: true,
      retailerCode: true,
      employeeId: true,
      employee: { select: { rsoMsisdn: true } },
    },
  });
  const retailerMap = new Map(retailers.map((r) => [r.retailerCode.toUpperCase(), r]));

  const batch = await prisma.importBatch.create({
    data: {
      type: ImportType.C2C,
      fileName,
      hash,
      businessDate: reportEndDate,
      totalRows: sourceRows.length + preErrors.length,
      status: ImportStatus.PROCESSING,
    },
  });

  const errors = [...preErrors];
  const mapped: Array<ParsedRow & { retailerId: string }> = [];
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

  try {
    const retailerIds = mapped.map((r) => r.retailerId);
    const endExclusive = new Date(reportEndDate.getTime() + 24 * 60 * 60 * 1000);

    // The file is month-to-date and is treated as source of truth through reportEndDate.
    // We replace only the covered retailer/date range, then store non-zero daily amounts.
    if (retailerIds.length) {
      await prisma.$transaction([
        prisma.c2cRecord.deleteMany({
          where: {
            retailerId: { in: retailerIds },
            date: { gte: firstDate, lt: endExclusive },
          },
        }),
      ]);

      const dailyData: Prisma.C2cRecordCreateManyInput[] = [];

      for (const row of mapped) {
        for (const day of row.daily) {
          dailyData.push({
            retailerId: row.retailerId,
            date: day.date,
            transactionCount: 1,
            amount: new Prisma.Decimal(day.amount),
            batchId: batch.id,
          });
        }
      }

      // Keep write batches modest for serverless PostgreSQL connections.
      for (let i = 0; i < dailyData.length; i += 1000) {
        await prisma.c2cRecord.createMany({ data: dailyData.slice(i, i + 1000) });
      }
    }

    if (errors.length) {
      await prisma.importError.createMany({
        data: errors.map((e) => ({ batchId: batch.id, rowNumber: e.rowNumber, message: e.message, rawData: e.rawData })),
      });
    }

    const failedRows = errors.length;
    const status = failedRows ? ImportStatus.COMPLETED_WITH_ERRORS : ImportStatus.COMPLETED;
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        successRows: mapped.length,
        failedRows,
        duplicateRows: 0,
        status,
      },
    });

    return {
      duplicate: false,
      batchId: batch.id,
      fileName,
      month: iso(month),
      reportStartDate: iso(firstDate),
      reportEndDate: iso(reportEndDate),
      totalRows: sourceRows.length + preErrors.length,
      successRows: mapped.length,
      failedRows,
      assignmentWarnings,
      dailyRecordsStored: mapped.reduce((sum, row) => sum + row.daily.length, 0),
      status,
    };
  } catch (error) {
    await prisma.importBatch.update({ where: { id: batch.id }, data: { status: ImportStatus.FAILED } });
    throw error;
  }
}

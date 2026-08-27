import crypto from "crypto";
import * as XLSX from "xlsx";
import { ImportStatus, ImportType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {expectedSimSwapPrice} from "@/lib/ga-product";

type Cell = string | number | boolean | Date | null | undefined;

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
      JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
      JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
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

export async function importGaActivationWorkbook(
  fileName: string,
  bytes: Buffer,
) {
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("No worksheet found in Excel file.");

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, raw: true, defval: null });
  if (rows.length < 2) throw new Error("The activation file is empty.");

  const headers = (rows[0] ?? []).map(normalizeHeader);
  const required = ["RETAILER_CODE", "SIM_NO", "PRODUCT_CODE", "SELLING_PRICE", "ACTIVATION_DATE", "ACTIVATION_TIME"];
  const index: Record<string, number> = {};
  const missingHeaders=required.filter(header=>!headers.includes(header));
  if(missingHeaders.length){
    throw new Error(`Required heading${missingHeaders.length>1?"s":""} missing: ${missingHeaders.join(", ")}. Found headings: ${headers.filter(Boolean).join(", ")||"none"}.`);
  }
  for (const header of required) index[header]=headers.indexOf(header);

  const parsedRows: ParsedActivation[] = [];
  const preErrors: Array<{ rowNumber: number; message: string; rawData: object }> = [];
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
    const expectedSwapPrice=expectedSimSwapPrice(productCode);
    if (expectedSwapPrice !== null && sellingPrice !== expectedSwapPrice) {
      preErrors.push({
        rowNumber: i + 1,
        message: `${productCode} must have SELLING_PRICE ${expectedSwapPrice} for SIM SWAP verification`,
        rawData: { retailerCode, simNo, productCode, sellingPrice, expectedSwapPrice },
      });
      continue;
    }
    if (!activationDate) {
      preErrors.push({ rowNumber: i + 1, message: "ACTIVATION_DATE is invalid", rawData: { retailerCode, simNo } });
      continue;
    }

    parsedRows.push({ rowNumber: i + 1, retailerCode, simNo, productCode, sellingPrice, activationDate, activationTime });
  }

  if (!sourceRows) throw new Error("No activation rows were found in the uploaded file.");
  if (preErrors.length) {
    const preview=preErrors.slice(0,8).map(e=>`Row ${e.rowNumber}: ${e.message}`).join("; ");
    throw new Error(`Data validation failed: ${preErrors.length} invalid row(s). ${preview}${preErrors.length>8?" …":""}`);
  }
  if (!parsedRows.length) throw new Error("No valid activation rows were found in the uploaded file.");

  const activationDates=parsedRows.map(row=>row.activationDate.getTime());
  const reportStartDate=new Date(Math.min(...activationDates));
  const reportEndDate=new Date(Math.max(...activationDates));

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
  const missingRetailers=[...new Set(parsedRows.filter(row=>!retailerMap.has(row.retailerCode)).map(row=>row.retailerCode))];
  if(missingRetailers.length){
    throw new Error(`Data validation failed: retailer code${missingRetailers.length>1?"s":""} not found in Retailer Master: ${missingRetailers.slice(0,12).join(", ")}${missingRetailers.length>12?" …":""}`);
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
    },
  });
  const existingMap = new Map(existing.map((row) => [row.simNo, row]));

  const seenInFile = new Set<string>();
  const errors = [...preErrors];
  let insertedRows = 0;
  let updatedRows = 0;
  let duplicateRows = 0;
  let failedRows = preErrors.length;

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

  const operations: Prisma.PrismaPromise<unknown>[] = [];

  for (const row of parsedRows) {
    if (seenInFile.has(row.simNo)) {
      duplicateRows++;
      continue;
    }
    seenInFile.add(row.simNo);

    const retailerId = retailerMap.get(row.retailerCode);
    if (!retailerId) {
      failedRows++;
      errors.push({
        rowNumber: row.rowNumber,
        message: `Retailer ${row.retailerCode} does not exist in Retailer Master`,
        rawData: { retailerCode: row.retailerCode, simNo: row.simNo },
      });
      continue;
    }

    const old = existingMap.get(row.simNo);
    if (!old) {
      insertedRows++;
      operations.push(prisma.gaActivation.create({
        data: {
          simNo: row.simNo,
          retailerId,
          activationDate: row.activationDate,
          activationTime: row.activationTime,
          sellingPrice: new Prisma.Decimal(row.sellingPrice),
          productCode: row.productCode,
          batchId: batch.id,
        },
      }));
      continue;
    }

    const unchanged = old.retailerId === retailerId
      && isoDate(old.activationDate) === isoDate(row.activationDate)
      && (old.activationTime ?? "") === (row.activationTime ?? "")
      && Number(old.sellingPrice) === row.sellingPrice
      && (old.productCode ?? "") === row.productCode;

    if (unchanged) {
      duplicateRows++;
      continue;
    }

    updatedRows++;
    operations.push(prisma.gaActivation.update({
      where: { simNo: row.simNo },
      data: {
        retailerId,
        activationDate: row.activationDate,
        activationTime: row.activationTime,
        sellingPrice: new Prisma.Decimal(row.sellingPrice),
        productCode: row.productCode,
        batchId: batch.id,
      },
    }));
  }

  try {
    if (operations.length) await prisma.$transaction(operations);
    if (errors.length) {
      await prisma.importError.createMany({
        data: errors.map((error) => ({ batchId: batch.id, ...error })),
      });
    }

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
    };
  } catch (error) {
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: { status: ImportStatus.FAILED },
    });
    throw error;
  }
}

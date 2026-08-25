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
function header(value: Cell) { return text(value).toUpperCase().replace(/\s+/g, "_"); }
function numberValue(value: Cell): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = text(value).replace(/,/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
function digits(value: Cell) { return text(value).replace(/\D/g, ""); }
function phoneKey(value: Cell) { return digits(value).replace(/^0+/, ""); }
function utcDate(year: number, monthIndex: number, day: number) { return new Date(Date.UTC(year, monthIndex, day)); }
const MONTHS: Record<string, number> = { JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11 };
function parseHeaderDate(value: Cell): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return utcDate(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return utcDate(parsed.y, parsed.m - 1, parsed.d);
  }
  const raw = text(value).replace(/\s+/g, " ").trim();
  const named = raw.match(/^(\d{1,2})[-\/\s]([A-Za-z]{3,9})[-\/\s](\d{2,4})(?:\s.*)?$/);
  if (named) {
    const monthIndex = MONTHS[named[2].slice(0,3).toUpperCase()];
    if (monthIndex !== undefined) {
      const day = Number(named[1]); let year = Number(named[3]); if (year < 100) year += 2000;
      const result = utcDate(year, monthIndex, day);
      if (result.getUTCFullYear() === year && result.getUTCMonth() === monthIndex && result.getUTCDate() === day) return result;
    }
  }
  const numeric = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s.*)?$/);
  if (numeric) {
    const month = Number(numeric[1]) - 1, day = Number(numeric[2]), year = Number(numeric[3]);
    const result = utcDate(year, month, day);
    if (result.getUTCFullYear() === year && result.getUTCMonth() === month && result.getUTCDate() === day) return result;
  }
  return null;
}
function iso(date: Date) { return date.toISOString().slice(0,10); }
function monthStart(date: Date) { return utcDate(date.getUTCFullYear(), date.getUTCMonth(), 1); }
function decodeReportText(bytes: Buffer): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString("utf16le");
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = Buffer.allocUnsafe(bytes.length - 2);
    for (let i = 2; i + 1 < bytes.length; i += 2) { swapped[i - 2] = bytes[i + 1]; swapped[i - 1] = bytes[i]; }
    return swapped.toString("utf16le");
  }
  const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
  let nul = 0; for (const b of sample) if (b === 0) nul++;
  if (sample.length && nul / sample.length > 0.15) return bytes.toString("utf16le").replace(/^\uFEFF/, "");
  return bytes.toString("utf8").replace(/^\uFEFF/, "");
}
function parseTabText(bytes: Buffer): Matrix | null {
  const source = decodeReportText(bytes);
  const firstChunk = source.slice(0, 12000);
  if (!firstChunk.includes("\t") || !firstChunk.toUpperCase().includes("RETAILER_CODE")) return null;
  return source.split(/\r?\n/).filter(line => line.trim().length > 0).map(line => line.split("\t"));
}
function readMatrix(bytes: Buffer): Matrix {
  const tab = parseTabText(bytes);
  if (tab) return tab;
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("No worksheet found in C2S file.");
  return XLSX.utils.sheet_to_json<Cell[]>(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null });
}
function findHeaderRow(matrix: Matrix, required: string[]) {
  const max = Math.min(matrix.length, 30);
  for (let r = 0; r < max; r++) {
    const headers = (matrix[r] ?? []).map(header);
    if (required.every(key => headers.includes(key))) return r;
  }
  return -1;
}


export async function importC2sWorkbook(fileName: string, bytes: Buffer) {
  const matrix = readMatrix(bytes);
  if (matrix.length < 2) throw new Error("The C2S report is empty.");

  const required = ["RETAILER_CODE", "RETAILER_ITOPUP_NO", "TRANSACTION_COUNT", "TOTAL_AMOUNT", "SRNUMBER"];
  const headerRowIndex = findHeaderRow(matrix, required);
  if (headerRowIndex < 0) throw new Error("Could not find the report header row containing RETAILER_CODE, TOTAL_AMOUNT and SRNUMBER.");
  const headerRow = matrix[headerRowIndex] ?? [];
  const headers = headerRow.map(header);
  const idx: Record<string, number> = {};
  for (const key of required) {
    const found = headers.indexOf(key);
    if (found < 0) throw new Error(`Required column ${key} was not found in the C2S report.`);
    idx[key] = found;
  }

  const dateColumns: DateColumn[] = [];
  for (let i=0; i<headerRow.length; i++) {
    const date = parseHeaderDate(headerRow[i]);
    if (date) dateColumns.push({ index:i, label:text(headerRow[i]), date });
  }
  if (!dateColumns.length) throw new Error("No daily date columns were found in the detected report header. Supported examples: 01-Aug-2026, 01-Aug-26, 8/1/2026.");
  dateColumns.sort((a,b)=>a.date.getTime()-b.date.getTime());
  const firstDate = dateColumns[0].date;
  const reportEndDate = dateColumns[dateColumns.length-1].date;
  const month = monthStart(firstDate);
  if (dateColumns.some(c => c.date.getUTCFullYear() !== firstDate.getUTCFullYear() || c.date.getUTCMonth() !== firstDate.getUTCMonth())) {
    throw new Error("C2S date columns must belong to one calendar month per upload.");
  }

  const sourceRows: ParsedRow[] = [];
  const preErrors: Array<{ rowNumber:number; message:string; rawData:object }> = [];
  for (let i=headerRowIndex+1; i<matrix.length; i++) {
    const row = matrix[i] ?? [];
    if (!row.some(cell => text(cell))) continue;
    const retailerCode = text(row[idx.RETAILER_CODE]).toUpperCase();
    if (!retailerCode) continue;
    const transactionCount = numberValue(row[idx.TRANSACTION_COUNT]);
    const totalAmount = numberValue(row[idx.TOTAL_AMOUNT]);
    if (transactionCount === null || transactionCount < 0 || !Number.isInteger(transactionCount)) {
      preErrors.push({ rowNumber:i+1, message:"TRANSACTION_COUNT is invalid", rawData:{retailerCode} }); continue;
    }
    if (totalAmount === null || totalAmount < 0) {
      preErrors.push({ rowNumber:i+1, message:"TOTAL_AMOUNT is invalid", rawData:{retailerCode} }); continue;
    }
    const daily: Array<{date:Date;amount:number}> = [];
    let dailyTotal = 0; let invalidDaily = false;
    for (const col of dateColumns) {
      const amount = numberValue(row[col.index]);
      if (amount === null || amount < 0) {
        preErrors.push({ rowNumber:i+1, message:`Invalid amount in ${col.label}`, rawData:{retailerCode} }); invalidDaily=true; break;
      }
      dailyTotal += amount;
      if (amount !== 0) daily.push({ date:col.date, amount });
    }
    if (invalidDaily) continue;
    if (Math.abs(dailyTotal-totalAmount) > 0.01) {
      preErrors.push({ rowNumber:i+1, message:`Daily amount sum (${dailyTotal}) does not match TOTAL_AMOUNT (${totalAmount})`, rawData:{retailerCode} }); continue;
    }
    if (daily.length !== transactionCount) {
      preErrors.push({ rowNumber:i+1, message:`Non-zero date count (${daily.length}) does not match TRANSACTION_COUNT (${transactionCount})`, rawData:{retailerCode} }); continue;
    }
    sourceRows.push({ rowNumber:i+1, retailerCode, retailerItopupNo:digits(row[idx.RETAILER_ITOPUP_NO]), transactionCount, totalAmount, srNumber:digits(row[idx.SRNUMBER]), daily });
  }
  if (!sourceRows.length) throw new Error("No valid retailer rows were found in the C2S report.");

  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  const prior = await prisma.importBatch.findUnique({ where:{hash} });
  if (prior) return { duplicate:true, batchId:prior.id, fileName:prior.fileName, businessDate:prior.businessDate, totalRows:prior.totalRows, successRows:prior.successRows, failedRows:prior.failedRows, status:prior.status, month:iso(month), reportEndDate:iso(reportEndDate) };

  const retailerCodes = [...new Set(sourceRows.map(r=>r.retailerCode))];
  const retailers = await prisma.retailer.findMany({
    where:{ retailerCode:{in:retailerCodes} },
    select:{ id:true, retailerCode:true, employeeId:true, employee:{select:{rsoMsisdn:true}} },
  });
  const retailerMap = new Map(retailers.map(r=>[r.retailerCode.toUpperCase(),r]));

  const batch = await prisma.importBatch.create({ data:{ type:ImportType.C2S, fileName, hash, businessDate:reportEndDate, totalRows:sourceRows.length+preErrors.length, status:ImportStatus.PROCESSING } });
  const errors = [...preErrors];
  const mapped: Array<ParsedRow & {retailerId:string}> = [];
  let assignmentWarnings = 0;
  for (const row of sourceRows) {
    const retailer = retailerMap.get(row.retailerCode);
    if (!retailer) { errors.push({rowNumber:row.rowNumber,message:`Retailer ${row.retailerCode} does not exist in Retailer Master`,rawData:{retailerCode:row.retailerCode,srNumber:row.srNumber}}); continue; }
    const masterRso = phoneKey(retailer.employee?.rsoMsisdn ?? "");
    const sourceRso = phoneKey(row.srNumber);
    if (masterRso && sourceRso && masterRso !== sourceRso) assignmentWarnings++;
    mapped.push({...row,retailerId:retailer.id});
  }

  try {
    const endExclusive = new Date(reportEndDate.getTime()+86400000);
    // C2S upload is a complete month-to-date snapshot. Replace the covered date window,
    // then store only non-zero retailer/day rows to keep the database compact.
    await prisma.c2sRecord.deleteMany({ where:{ date:{gte:firstDate,lt:endExclusive} } });

    const dailyData: Prisma.C2sRecordCreateManyInput[] = [];
    for (const row of mapped) {
      for (const day of row.daily) dailyData.push({ retailerId:row.retailerId, date:day.date, transactionCount:1, amount:new Prisma.Decimal(day.amount), batchId:batch.id });
    }
    for (let i=0;i<dailyData.length;i+=1000) await prisma.c2sRecord.createMany({data:dailyData.slice(i,i+1000)});

    if (errors.length) await prisma.importError.createMany({ data:errors.map(e=>({batchId:batch.id,rowNumber:e.rowNumber,message:e.message,rawData:e.rawData})) });
    const failedRows = errors.length;
    const status = failedRows ? ImportStatus.COMPLETED_WITH_ERRORS : ImportStatus.COMPLETED;
    await prisma.importBatch.update({ where:{id:batch.id}, data:{successRows:mapped.length,failedRows,duplicateRows:0,status} });
    return { duplicate:false,batchId:batch.id,fileName,month:iso(month),reportStartDate:iso(firstDate),reportEndDate:iso(reportEndDate),totalRows:sourceRows.length+preErrors.length,successRows:mapped.length,failedRows,assignmentWarnings,dailyRecordsStored:dailyData.length,status };
  } catch (error) {
    await prisma.importBatch.update({ where:{id:batch.id}, data:{status:ImportStatus.FAILED} });
    throw error;
  }
}

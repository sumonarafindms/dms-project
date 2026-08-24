import crypto from "crypto";
import * as XLSX from "xlsx";
import { ImportStatus, ImportType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Cell = string | number | boolean | Date | null | undefined;
type Matrix = Cell[][];

function text(value: Cell) { return value === null || value === undefined ? "" : String(value).trim(); }
function header(value: Cell) { return text(value).toUpperCase().replace(/\s+/g, "_"); }
function numberValue(value: Cell): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = text(value).replace(/,/g, "");
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
function digits(value: Cell) { return text(value).replace(/\D/g, ""); }
function phoneKey(value: Cell) { return digits(value).replace(/^0+/, ""); }
const MONTHS: Record<string, number> = { JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11 };
function parseDateHeader(value: Cell): Date | null {
  const m = text(value).match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const mi = MONTHS[m[2].toUpperCase()];
  if (mi === undefined) return null;
  return new Date(Date.UTC(Number(m[3]), mi, Number(m[1])));
}
function iso(date: Date) { return date.toISOString().slice(0,10); }
function parseTabText(bytes: Buffer): Matrix | null {
  const sample = bytes.subarray(0, Math.min(bytes.length, 4096)).toString("utf8");
  if (!sample.includes("\t") || !sample.includes("RETAILER_CODE")) return null;
  return bytes.toString("utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean).map(line => line.split("\t"));
}
function readMatrix(bytes: Buffer): Matrix {
  const tab = parseTabText(bytes);
  if (tab) return tab;
  const workbook = XLSX.read(bytes, { type:"buffer", cellDates:true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("No worksheet found in OB file.");
  return XLSX.utils.sheet_to_json<Cell[]>(workbook.Sheets[sheetName], { header:1, raw:true, defval:null });
}

export async function importObWorkbook(fileName: string, bytes: Buffer) {
  const matrix = readMatrix(bytes);
  if (matrix.length < 2) throw new Error("The Opening Balance report is empty.");
  const headers = (matrix[0] ?? []).map(header);
  const required = ["RETAILER_CODE","RETAILER_ITOPUP_NO","TRANSACTION_COUNT","TOTAL_AMOUNT","SRNUMBER"];
  const idx: Record<string, number> = {};
  for (const key of required) {
    const i = headers.indexOf(key);
    if (i < 0) throw new Error(`Required column ${key} was not found in the OB report.`);
    idx[key] = i;
  }
  const dateCols = (matrix[0] ?? []).map((v,i)=>({i,date:parseDateHeader(v),label:text(v)})).filter(x=>x.date) as Array<{i:number;date:Date;label:string}>;
  if (dateCols.length !== 1) throw new Error("Opening Balance file must contain exactly one date column in row 1.");
  const snapshotDate = dateCols[0].date;

  const parsed: Array<{rowNumber:number;retailerCode:string;amount:number;transactionCount:number;srNumber:string}> = [];
  const errors: Array<{rowNumber:number;message:string;rawData:object}> = [];
  for (let r=1;r<matrix.length;r++) {
    const row = matrix[r] ?? [];
    if (!row.some(c=>text(c))) continue;
    const retailerCode = text(row[idx.RETAILER_CODE]).toUpperCase();
    if (!retailerCode) continue;
    const amount = numberValue(row[idx.TOTAL_AMOUNT]);
    const datedAmount = numberValue(row[dateCols[0].i]);
    const transactionCount = numberValue(row[idx.TRANSACTION_COUNT]);
    if (amount === null || amount < 0 || datedAmount === null || datedAmount < 0) {
      errors.push({rowNumber:r+1,message:"Invalid opening balance amount",rawData:{retailerCode}}); continue;
    }
    if (Math.abs(amount-datedAmount) > 0.01) {
      errors.push({rowNumber:r+1,message:`${dateCols[0].label} amount does not match TOTAL_AMOUNT`,rawData:{retailerCode}}); continue;
    }
    if (transactionCount === null || transactionCount < 0 || !Number.isInteger(transactionCount)) {
      errors.push({rowNumber:r+1,message:"TRANSACTION_COUNT is invalid",rawData:{retailerCode}}); continue;
    }
    parsed.push({rowNumber:r+1,retailerCode,amount,transactionCount,srNumber:digits(row[idx.SRNUMBER])});
  }
  if (!parsed.length) throw new Error("No valid retailer rows were found in the OB report.");

  const retailerCodes = [...new Set(parsed.map(r=>r.retailerCode))];
  const retailers = await prisma.retailer.findMany({ where:{retailerCode:{in:retailerCodes}}, select:{id:true,retailerCode:true,employee:{select:{rsoMsisdn:true}}} });
  const map = new Map(retailers.map(r=>[r.retailerCode.toUpperCase(),r]));
  const mapped: Array<{retailerId:string;amount:number;transactionCount:number}> = [];
  let assignmentWarnings = 0;
  for (const row of parsed) {
    const retailer = map.get(row.retailerCode);
    if (!retailer) { errors.push({rowNumber:row.rowNumber,message:`Retailer ${row.retailerCode} does not exist in Retailer Master`,rawData:{retailerCode:row.retailerCode}}); continue; }
    if (phoneKey(retailer.employee?.rsoMsisdn ?? "") && phoneKey(row.srNumber) && phoneKey(retailer.employee?.rsoMsisdn ?? "") !== phoneKey(row.srNumber)) assignmentWarnings++;
    mapped.push({retailerId:retailer.id,amount:row.amount,transactionCount:row.transactionCount});
  }

  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  const batch = await prisma.importBatch.create({ data:{type:ImportType.OB,fileName,hash,businessDate:snapshotDate,totalRows:parsed.length,status:ImportStatus.PROCESSING} });
  try {
    await prisma.$transaction(async tx => {
      await tx.obRecord.deleteMany({});
      if (mapped.length) await tx.obRecord.createMany({ data:mapped.map(row=>({retailerId:row.retailerId,date:snapshotDate,transactionCount:row.transactionCount,amount:new Prisma.Decimal(row.amount),batchId:batch.id})) });
      if (errors.length) await tx.importError.createMany({data:errors.map(e=>({batchId:batch.id,rowNumber:e.rowNumber,message:e.message,rawData:e.rawData}))});
      await tx.importBatch.update({where:{id:batch.id},data:{successRows:mapped.length,failedRows:errors.length,status:errors.length?ImportStatus.COMPLETED_WITH_ERRORS:ImportStatus.COMPLETED}});
      // OB is latest-snapshot-only. Remove old OB import metadata after its records were replaced.
      await tx.importBatch.deleteMany({where:{type:ImportType.OB,id:{not:batch.id}}});
    });
    const totalOpeningBalance = mapped.reduce((s,r)=>s+r.amount,0);
    return {fileName,batchId:batch.id,snapshotDate:iso(snapshotDate),totalRows:parsed.length,successRows:mapped.length,failedRows:errors.length,assignmentWarnings,totalOpeningBalance,status:errors.length?ImportStatus.COMPLETED_WITH_ERRORS:ImportStatus.COMPLETED};
  } catch (error) {
    await prisma.importBatch.update({where:{id:batch.id},data:{status:ImportStatus.FAILED}}).catch(()=>undefined);
    throw error;
  }
}

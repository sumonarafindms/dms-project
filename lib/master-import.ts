import {phoneKey} from "./phone";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";

type ExcelRow = Record<string, unknown>;

const text = (value: unknown) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  return String(value).trim();
};

const normalizeHeader = (value: string) =>
  value.trim().toUpperCase().replace(/\s+/g, " ").replace(/[^A-Z0-9_ ]/g, "");

const normalizedRow = (row: ExcelRow) => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) out[normalizeHeader(key)] = value;
  return out;
};

function rowsFromWorkbook(buffer: Buffer, requiredHeaders: string[], preferredSheet?: string) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const normalizedRequired = requiredHeaders.map(normalizeHeader);
  const names = preferredSheet
    ? [preferredSheet, ...workbook.SheetNames.filter((n) => n !== preferredSheet)]
    : workbook.SheetNames;

  for (const name of names) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<ExcelRow>(sheet, { defval: "", raw: true });
    if (!rows.length) continue;
    const keys = new Set(Object.keys(normalizedRow(rows[0])));
    if (normalizedRequired.every((header) => keys.has(header))) {
      return { sheetName: name, rows: rows.map(normalizedRow) };
    }
  }
  throw new Error(`Could not find a sheet containing: ${requiredHeaders.join(", ")}`);
}

export async function importEmployees(buffer: Buffer, fileName: string) {
  const { rows, sheetName } = rowsFromWorkbook(buffer, ["RSO Code", "RS0 MSISDN", "RSO Name", "Supervisor"], "RSO");
  const batch = await prisma.importBatch.create({ data: { type: "EMPLOYEES", fileName, totalRows: rows.length } });
  const existingEmployees=await prisma.employee.findMany({select:{id:true,rsoMsisdn:true,employeeCode:true}});
  const employeeByPhoneKey=new Map(existingEmployees.map(e=>[phoneKey(e.rsoMsisdn),e]));
  const employeeByCode=new Map(existingEmployees.filter(e=>e.employeeCode).map(e=>[e.employeeCode!.trim().toUpperCase(),e]));
  const seenPhone=new Set<string>(),seenCode=new Set<string>();
  const errors:Array<{batchId:string;rowNumber:number;message:string;rawData:object}>=[],valid:Array<{rsoMsisdn:string;employeeCode:string|null;name:string;supervisorName:string}>=[];

  for(let i=0;i<rows.length;i++){
    const row=rows[i],rsoMsisdn=text(row["RS0 MSISDN"]),employeeCodeRaw=text(row["RSO CODE"]),employeeCode=employeeCodeRaw?employeeCodeRaw.toUpperCase():null,name=text(row["RSO NAME"]),supervisorName=text(row["SUPERVISOR"]);
    if(!rsoMsisdn||!name){errors.push({batchId:batch.id,rowNumber:i+2,message:"RSO MSISDN and RSO Name are required",rawData:row as object});continue}
    const pkey=phoneKey(rsoMsisdn);if(!pkey){errors.push({batchId:batch.id,rowNumber:i+2,message:"RSO MSISDN is invalid",rawData:row as object});continue}
    if(seenPhone.has(pkey)){errors.push({batchId:batch.id,rowNumber:i+2,message:"Duplicate RSO MSISDN in upload",rawData:row as object});continue}
    if(employeeCode&&seenCode.has(employeeCode)){errors.push({batchId:batch.id,rowNumber:i+2,message:"Duplicate RSO Code in upload",rawData:row as object});continue}
    const byPhone=employeeByPhoneKey.get(pkey),byCode=employeeCode?employeeByCode.get(employeeCode):undefined;
    if(byPhone&&byCode&&byPhone.id!==byCode.id){errors.push({batchId:batch.id,rowNumber:i+2,message:"RSO MSISDN and RSO Code belong to different existing employees",rawData:row as object});continue}
    if(!byPhone&&byCode){errors.push({batchId:batch.id,rowNumber:i+2,message:"RSO Code is already assigned to another MSISDN",rawData:row as object});continue}
    seenPhone.add(pkey);if(employeeCode)seenCode.add(employeeCode);
    valid.push({rsoMsisdn,employeeCode,name,supervisorName});
  }

  const supervisorNames=[...new Set(valid.map(x=>x.supervisorName).filter(Boolean))];
  for(let i=0;i<supervisorNames.length;i+=50){
    await prisma.$transaction(supervisorNames.slice(i,i+50).map(name=>prisma.supervisor.upsert({where:{name},update:{active:true},create:{name}})));
  }
  const supervisors=await prisma.supervisor.findMany({where:{name:{in:supervisorNames}},select:{id:true,name:true}});
  const supervisorByName=new Map(supervisors.map(x=>[x.name,x.id]));

  const ops=[];
  for(const row of valid){
    const existing=employeeByPhoneKey.get(phoneKey(row.rsoMsisdn)),supervisorId=row.supervisorName?supervisorByName.get(row.supervisorName)||null:null;
    if(existing)ops.push(prisma.employee.update({where:{id:existing.id},data:{rsoMsisdn:row.rsoMsisdn,employeeCode:row.employeeCode,name:row.name,supervisorId,active:true}}));
    else ops.push(prisma.employee.create({data:{rsoMsisdn:row.rsoMsisdn,employeeCode:row.employeeCode,name:row.name,supervisorId}}));
  }
  for(let i=0;i<ops.length;i+=100)await prisma.$transaction(ops.slice(i,i+100));
  if(errors.length)await prisma.importError.createMany({data:errors});

  const successRows=valid.length,failedRows=errors.length;
  await prisma.importBatch.update({where:{id:batch.id},data:{successRows,failedRows,status:failedRows?"COMPLETED_WITH_ERRORS":"COMPLETED"}});
  return {batchId:batch.id,sheetName,totalRows:rows.length,successRows,failedRows};
}

export async function importRetailers(buffer: Buffer, fileName: string) {
  const required = ["RETAILER_CODE", "RETAILER_NAME", "I_TOP_UP_SR_NUMBER"];
  const { rows, sheetName } = rowsFromWorkbook(buffer, required);
  const batch = await prisma.importBatch.create({ data: { type: "RETAILERS", fileName, totalRows: rows.length } });

  const employees = await prisma.employee.findMany({ select: { id: true, rsoMsisdn: true } });
  const employeeByMsisdn = new Map(employees.map((employee) => [phoneKey(employee.rsoMsisdn), employee.id]));
  const sourceCodes = [...new Set(rows.map(row => text(row["RETAILER_CODE"]).toUpperCase()).filter(Boolean))];
  const existingRows = await prisma.retailer.findMany({
    where: { retailerCode: { in: sourceCodes } },
    select: {retailerCode:true,retailerName:true,simSeller:true,iTopUpSeller:true,tranMobileNo:true,iTopUpSrNumber:true,iTopUpNumber:true,category:true,rsoCode:true,route:true,employeeId:true}
  });
  const existingByCode = new Map(existingRows.map(row => [row.retailerCode, row]));

  let mappedRows=0,unassignedRows=0,newRows=0,updatedRows=0,unchangedRows=0;
  const errors:Array<{batchId:string;rowNumber:number;message:string;rawData:object}>=[],ops=[];
  const seenRetailerCodes=new Set<string>();

  for(let i=0;i<rows.length;i++){
    const row=rows[i],retailerCode=text(row["RETAILER_CODE"]).toUpperCase();
    if(!retailerCode){errors.push({batchId:batch.id,rowNumber:i+2,message:"RETAILER_CODE is required",rawData:row as object});continue}
    if(seenRetailerCodes.has(retailerCode)){errors.push({batchId:batch.id,rowNumber:i+2,message:"Duplicate RETAILER_CODE in upload",rawData:row as object});continue}
    seenRetailerCodes.add(retailerCode);
    const iTopUpSrNumber=text(row["I_TOP_UP_SR_NUMBER"]),employeeId=employeeByMsisdn.get(phoneKey(iTopUpSrNumber))??null;
    employeeId?mappedRows++:unassignedRows++;
    const next={retailerName:text(row["RETAILER_NAME"])||null,simSeller:text(row["SIM_SELLER"])||null,iTopUpSeller:text(row["I_TOP_UP_SELLER"])||null,tranMobileNo:text(row["TRANMOBILENO"])||null,iTopUpSrNumber:iTopUpSrNumber||null,iTopUpNumber:text(row["I_TOP_UP_NUMBER"])||null,category:text(row["CATEGORY"])||null,rsoCode:text(row["RSOCODE"])||null,route:text(row["ROUTE"])||null,employeeId,active:true};
    const old=existingByCode.get(retailerCode);
    if(!old)newRows++;else{
      const changed=old.retailerName!==next.retailerName||old.simSeller!==next.simSeller||old.iTopUpSeller!==next.iTopUpSeller||old.tranMobileNo!==next.tranMobileNo||old.iTopUpSrNumber!==next.iTopUpSrNumber||old.iTopUpNumber!==next.iTopUpNumber||old.category!==next.category||old.rsoCode!==next.rsoCode||old.route!==next.route||old.employeeId!==next.employeeId;
      changed?updatedRows++:unchangedRows++;
    }
    ops.push(prisma.retailer.upsert({where:{retailerCode},update:next,create:{retailerCode,...next}}));
  }

  for(let i=0;i<ops.length;i+=100)await prisma.$transaction(ops.slice(i,i+100));
  if(errors.length)await prisma.importError.createMany({data:errors});
  const successRows=ops.length,failedRows=errors.length;
  await prisma.importBatch.update({where:{id:batch.id},data:{successRows,failedRows,status:failedRows?"COMPLETED_WITH_ERRORS":"COMPLETED"}});
  return {batchId:batch.id,sheetName,totalRows:rows.length,successRows,failedRows,mappedRows,unassignedRows,newRows,updatedRows,unchangedRows};
}


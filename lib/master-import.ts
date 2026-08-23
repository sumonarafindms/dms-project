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
  const { rows, sheetName } = rowsFromWorkbook(
    buffer,
    ["RSO Code", "RS0 MSISDN", "RSO Name", "Supervisor"],
    "RSO",
  );

  const batch = await prisma.importBatch.create({ data: { type: "EMPLOYEES", fileName, totalRows: rows.length } });
  let successRows = 0;
  let failedRows = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rsoMsisdn = text(row["RS0 MSISDN"]);
    const employeeCode = text(row["RSO CODE"]);
    const name = text(row["RSO NAME"]);
    const supervisorName = text(row["SUPERVISOR"]);

    if (!rsoMsisdn || !name) {
      failedRows++;
      await prisma.importError.create({
        data: { batchId: batch.id, rowNumber: i + 2, message: "RSO MSISDN and RSO Name are required", rawData: row as object },
      });
      continue;
    }

    const supervisor = supervisorName
      ? await prisma.supervisor.upsert({
          where: { name: supervisorName },
          update: { active: true },
          create: { name: supervisorName },
        })
      : null;

    await prisma.employee.upsert({
      where: { rsoMsisdn },
      update: {
        employeeCode: employeeCode || null,
        name,
        supervisorId: supervisor?.id ?? null,
        active: true,
      },
      create: {
        rsoMsisdn,
        employeeCode: employeeCode || null,
        name,
        supervisorId: supervisor?.id ?? null,
      },
    });
    successRows++;
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      successRows,
      failedRows,
      status: failedRows ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
    },
  });

  return { batchId: batch.id, sheetName, totalRows: rows.length, successRows, failedRows };
}

export async function importRetailers(buffer: Buffer, fileName: string) {
  const required = ["RETAILER_CODE", "RETAILER_NAME", "I_TOP_UP_SR_NUMBER"];
  const { rows, sheetName } = rowsFromWorkbook(buffer, required);
  const batch = await prisma.importBatch.create({ data: { type: "RETAILERS", fileName, totalRows: rows.length } });

  const employees = await prisma.employee.findMany({ select: { id: true, rsoMsisdn: true } });
  const employeeByMsisdn = new Map(employees.map((employee) => [employee.rsoMsisdn, employee.id]));

  let successRows = 0;
  let failedRows = 0;
  let mappedRows = 0;
  let unassignedRows = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const retailerCode = text(row["RETAILER_CODE"]);
    if (!retailerCode) {
      failedRows++;
      await prisma.importError.create({
        data: { batchId: batch.id, rowNumber: i + 2, message: "RETAILER_CODE is required", rawData: row as object },
      });
      continue;
    }

    const iTopUpSrNumber = text(row["I_TOP_UP_SR_NUMBER"]);
    const employeeId = employeeByMsisdn.get(iTopUpSrNumber) ?? null;
    if (employeeId) mappedRows++;
    else unassignedRows++;

    await prisma.retailer.upsert({
      where: { retailerCode },
      update: {
        retailerName: text(row["RETAILER_NAME"]) || null,
        simSeller: text(row["SIM_SELLER"]) || null,
        iTopUpSeller: text(row["I_TOP_UP_SELLER"]) || null,
        tranMobileNo: text(row["TRANMOBILENO"]) || null,
        iTopUpSrNumber: iTopUpSrNumber || null,
        iTopUpNumber: text(row["I_TOP_UP_NUMBER"]) || null,
        category: text(row["CATEGORY"]) || null,
        rsoCode: text(row["RSOCODE"]) || null,
        route: text(row["ROUTE"]) || null,
        employeeId,
        active: true,
      },
      create: {
        retailerCode,
        retailerName: text(row["RETAILER_NAME"]) || null,
        simSeller: text(row["SIM_SELLER"]) || null,
        iTopUpSeller: text(row["I_TOP_UP_SELLER"]) || null,
        tranMobileNo: text(row["TRANMOBILENO"]) || null,
        iTopUpSrNumber: iTopUpSrNumber || null,
        iTopUpNumber: text(row["I_TOP_UP_NUMBER"]) || null,
        category: text(row["CATEGORY"]) || null,
        rsoCode: text(row["RSOCODE"]) || null,
        route: text(row["ROUTE"]) || null,
        employeeId,
      },
    });
    successRows++;
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      successRows,
      failedRows,
      status: failedRows ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
    },
  });

  return { batchId: batch.id, sheetName, totalRows: rows.length, successRows, failedRows, mappedRows, unassignedRows };
}

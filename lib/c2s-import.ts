import { ImportStatus, ImportType, Prisma } from "@prisma/client";
import { priorImport } from "./import-batch";
import { prisma } from "@/lib/prisma";
import {
  computeImportHash,
  iso,
  mapRetailersForC2Rows,
  parseC2Workbook,
  planMonthReplacement,
  type C2RetailerRef,
  IMPORT_TX_OPTIONS,
  writeMonthPlan,
} from "./c2-import-core";
import { createMissingRetailers, describeCreatedRetailers } from "./retailer-autocreate";

export async function importC2sWorkbook(fileName: string, bytes: Buffer) {
  const parsed = parseC2Workbook(bytes, "C2S");
  const { month, firstDate, reportEndDate, sourceRows, preErrors } = parsed;

  const hash = computeImportHash(bytes);
  // v200: a FAILED or abandoned batch does not block the same file again.
  const prior = await priorImport(hash);
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
  const retailerSelect = {
    id: true,
    retailerCode: true,
    employeeId: true,
    employee: { select: { rsoMsisdn: true } },
  };
  let retailers = await prisma.retailer.findMany({
    where: { retailerCode: { in: retailerCodes } },
    select: retailerSelect,
  });

  /*
   * An outlet the carrier has added since the last Retailer Master upload used
   * to fail the ENTIRE file — three unknown codes out of 2,190 stored nothing
   * at all. The report already names the outlet and its RSO, so it is created
   * here and the day's numbers go in. See lib/retailer-autocreate.ts.
   */
  /*
   * v200: a file that is going to be rejected creates nothing. The retailers
   * below were created BEFORE the row errors were checked, so a file refused
   * for one bad TOTAL_AMOUNT still left its unknown outlets — and their
   * assignment history — behind in the master list.
   */
  if (preErrors.length) {
    const preview = preErrors
      .slice(0, 8)
      .map((e) => `Row ${e.rowNumber}: ${e.message}`)
      .join("; ");
    throw new Error(
      `C2S data validation failed: ${preErrors.length} invalid row(s). ${preview}${preErrors.length > 8 ? " …" : ""}`,
    );
  }

  const known = new Set(retailers.map((r) => r.retailerCode.toUpperCase()));
  const autoCreated = await createMissingRetailers(
    sourceRows.map((r) => ({
      retailerCode: r.retailerCode,
      retailerName: r.identity.retailerName,
      iTopUpNumber: r.retailerItopupNo,
      iTopUpSrNumber: r.identity.iTopUpSrNumber,
      srNumber: r.srNumber,
      rsoCode: r.identity.rsoCode,
      iTopUpSeller: r.identity.iTopUpSeller,
    })),
    known,
    `C2S import: ${fileName}`,
  );
  if (autoCreated.created.length)
    retailers = await prisma.retailer.findMany({
      where: { retailerCode: { in: retailerCodes } },
      select: retailerSelect,
    });

  const retailerMap = new Map<string, C2RetailerRef>(retailers.map((r) => [r.retailerCode.toUpperCase(), r]));

  const batch = await prisma.importBatch.create({
    data: {
      type: ImportType.C2S,
      fileName,
      hash,
      businessDate: reportEndDate,
      totalRows: sourceRows.length + preErrors.length,
      status: ImportStatus.PROCESSING,
    },
  });

  const { mapped, errors: mapErrors, assignmentWarnings } = mapRetailersForC2Rows(sourceRows, retailerMap);
  const errors = [...preErrors, ...mapErrors];

  if (errors.length) {
    const preview = errors
      .slice(0, 8)
      .map((e) => `Row ${e.rowNumber}: ${e.message}`)
      .join("; ");
    await prisma.importBatch.delete({ where: { id: batch.id } }).catch(() => undefined);
    throw new Error(
      `C2S data validation failed: ${errors.length} invalid or unmapped row(s). ${preview}${errors.length > 8 ? " …" : ""}`,
    );
  }

  try {
    // The uploaded C2S report is an authoritative month-to-date snapshot.
    // Replace the whole stored month so removed/changed retailers never retain stale sales.
    const plan = planMonthReplacement({ month, batchId: batch.id, reportEndDate, mapped });

    await prisma.$transaction(
      (tx) =>
        writeMonthPlan(
          {
            deleteDaily: (where) => tx.c2sRecord.deleteMany({ where }),
            deleteSummaries: (where) => tx.c2sMonthlySummary.deleteMany({ where }),
            createDaily: (rows) =>
              tx.c2sRecord.createMany({
                data: rows.map((r) => ({ ...r, amount: new Prisma.Decimal(r.amount) })),
              }),
            createSummaries: (rows) =>
              tx.c2sMonthlySummary.createMany({
                data: rows.map((r) => ({ ...r, totalAmount: new Prisma.Decimal(r.totalAmount) })),
              }),
          },
          plan,
        ),
      IMPORT_TX_OPTIONS,
    );

    if (errors.length) {
      await prisma.importError.createMany({
        data: errors.map((e) => ({
          batchId: batch.id,
          rowNumber: e.rowNumber,
          message: e.message,
          rawData: e.rawData,
        })),
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
      newRetailers: autoCreated.created.length,
      newRetailerNote: describeCreatedRetailers(autoCreated),
      dailyRecordsStored: plan.dailyRecords.length,
      replacedMonth: iso(month),
      status,
    };
  } catch (error) {
    await prisma.importBatch.update({ where: { id: batch.id }, data: { status: ImportStatus.FAILED } });
    throw error;
  }
}

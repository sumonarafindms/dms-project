import { ImportStatus, ImportType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  computeImportHash,
  iso,
  mapRetailersForC2Rows,
  parseC2Workbook,
  planMonthReplacement,
  type C2RetailerRef,
} from "./c2-import-core";
import { createMissingRetailers, describeCreatedRetailers } from "./retailer-autocreate";

export async function importC2cWorkbook(fileName: string, bytes: Buffer) {
  const parsed = parseC2Workbook(bytes, "C2C");
  const { month, firstDate, reportEndDate, sourceRows, preErrors } = parsed;

  const hash = computeImportHash(bytes);
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
  const known = new Set(retailers.map((r) => r.retailerCode.toUpperCase()));
  const autoCreated = await createMissingRetailers(
    sourceRows.map((r) => ({
      retailerCode: r.retailerCode,
      retailerName: r.identity.retailerName,
      iTopUpNumber: r.retailerItopupNo,
      srNumber: r.srNumber,
      iTopUpSeller: r.identity.iTopUpSeller,
    })),
    known,
    `C2C import: ${fileName}`,
  );
  if (autoCreated.created.length)
    retailers = await prisma.retailer.findMany({
      where: { retailerCode: { in: retailerCodes } },
      select: retailerSelect,
    });

  const retailerMap = new Map<string, C2RetailerRef>(retailers.map((r) => [r.retailerCode.toUpperCase(), r]));

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

  const { mapped, errors: mapErrors, assignmentWarnings } = mapRetailersForC2Rows(sourceRows, retailerMap);
  const errors = [...preErrors, ...mapErrors];

  if (errors.length) {
    const preview = errors
      .slice(0, 8)
      .map((e) => `Row ${e.rowNumber}: ${e.message}`)
      .join("; ");
    await prisma.importBatch.delete({ where: { id: batch.id } }).catch(() => undefined);
    throw new Error(
      `C2C data validation failed: ${errors.length} invalid or unmapped row(s). ${preview}${errors.length > 8 ? " …" : ""}`,
    );
  }

  try {
    // The uploaded C2C report is an authoritative month-to-date snapshot.
    // Replace the entire stored month so retailers/dates missing from the new file cannot leave stale values behind.
    const plan = planMonthReplacement({ month, batchId: batch.id, reportEndDate, mapped });

    await prisma.$transaction(async (tx) => {
      await tx.c2cRecord.deleteMany({ where: plan.deleteDailyWhere });
      await tx.c2cMonthlySummary.deleteMany({ where: plan.deleteSummaryWhere });
      for (let i = 0; i < plan.dailyRecords.length; i += 1000) {
        await tx.c2cRecord.createMany({
          data: plan.dailyRecords.slice(i, i + 1000).map((r) => ({ ...r, amount: new Prisma.Decimal(r.amount) })),
        });
      }
      for (const summary of plan.monthlySummaries) {
        await tx.c2cMonthlySummary.create({
          data: { ...summary, totalAmount: new Prisma.Decimal(summary.totalAmount) },
        });
      }
    });

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

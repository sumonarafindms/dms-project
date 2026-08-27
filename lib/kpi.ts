import { prisma } from "@/lib/prisma";
import { monthBounds } from "@/lib/month";
import {
  GA_CLASSIFICATION_SELECT,
  isSsoComplete,
  isStandardGaActivation,
  lsoCompleteMonthlySummaryWhere,
} from "@/lib/business-rules";

export async function getEmployeeMonthlyKpis(employeeId: string, month: string | Date) {
  const { start, end } = monthBounds(month);

  const [gaActivations, c2c, manual, lsoRows, target] = await Promise.all([
    prisma.gaActivation.findMany({
      where: {
        retailer: { employeeId },
        activationDate: { gte: start, lt: end },
      },
      select: {
        retailerId: true,
        ...GA_CLASSIFICATION_SELECT,
        retailer: { select: { simSeller: true } },
      },
    }),
    prisma.c2cRecord.aggregate({
      where: { retailer: { employeeId }, date: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
    prisma.manualMetric.findUnique({
      where: { employeeId_month: { employeeId, month: start } },
    }),
    prisma.c2sMonthlySummary.findMany({
      where: { retailer: { employeeId }, month: start, ...lsoCompleteMonthlySummaryWhere },
      select: { retailerId: true },
    }),
    prisma.monthlyTarget.findUnique({
      where: { employeeId_month: { employeeId, month: start } },
    }),
  ]);

  // SIMWAP / EV-SWAP replacements never count toward GA achievement or SSO.
  const standardGa = gaActivations.filter(isStandardGaActivation);

  const ssoRetailers = new Map<string, { count: number; simSeller: string | null }>();
  for (const row of standardGa) {
    const current = ssoRetailers.get(row.retailerId) || {
      count: 0,
      simSeller: row.retailer.simSeller,
    };
    current.count += 1;
    ssoRetailers.set(row.retailerId, current);
  }

  const gaAchieved = standardGa.length;
  const c2cAchieved = Number(c2c._sum.amount ?? 0);
  const scAchieved = Number(manual?.scAchieved ?? 0);
  const ssoAchieved = [...ssoRetailers.values()].filter((r) =>
    isSsoComplete(r.simSeller, r.count),
  ).length;

  return {
    month: start,
    employeeId,
    target,
    achievement: {
      ga: gaAchieved,
      c2c: c2cAchieved,
      sc: scAchieved,
      totalRecharge: c2cAchieved + scAchieved,
      sso: ssoAchieved,
      lso: lsoRows.length,
    },
  };
}

import { prisma } from "@/lib/prisma";
import { monthBounds } from "@/lib/month";
import { isSsoComplete, lsoCompleteMonthlySummaryWhere, withStandardGa } from "@/lib/business-rules";

export async function getEmployeeMonthlyKpis(employeeId: string, month: string | Date) {
  const { start, end } = monthBounds(month);

  const [gaGroups, retailers, c2c, manual, lsoRows, target] = await Promise.all([
    // SIMWAP / EV-SWAP replacements never count toward GA achievement or SSO, so
    // they are excluded in SQL rather than loaded and filtered here. The window is
    // one calendar month, so a per-retailer count already answers the SSO rule.
    prisma.gaActivation.groupBy({
      by: ["retailerId"],
      where: withStandardGa({
        retailer: { employeeId },
        activationDate: { gte: start, lt: end },
      }),
      _count: { _all: true },
    }),
    prisma.retailer.findMany({
      where: { employeeId },
      select: { id: true, simSeller: true },
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

  const simSellerOf = new Map(retailers.map((r) => [r.id, r.simSeller]));

  let gaAchieved = 0;
  let ssoAchieved = 0;
  for (const group of gaGroups) {
    const count = group._count._all;
    gaAchieved += count;
    if (isSsoComplete(simSellerOf.get(group.retailerId) ?? null, count)) ssoAchieved += 1;
  }

  const c2cAchieved = Number(c2c._sum.amount ?? 0);
  const scAchieved = Number(manual?.scAchieved ?? 0);

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

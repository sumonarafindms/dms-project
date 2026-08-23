import { prisma } from "@/lib/prisma";
import { monthBounds } from "@/lib/month";

export async function getEmployeeMonthlyKpis(employeeId: string, month: string | Date) {
  const { start, end } = monthBounds(month);

  const [ga, c2c, manual, ssoRows, lsoRows, target] = await Promise.all([
    prisma.gaRecord.aggregate({
      where: { retailer: { employeeId }, date: { gte: start, lt: end } },
      _sum: { gaCount: true },
    }),
    prisma.c2cRecord.aggregate({
      where: { retailer: { employeeId }, date: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
    prisma.manualMetric.findUnique({
      where: { employeeId_month: { employeeId, month: start } },
    }),
    // SSO: one unique retailer counts as completed when monthly GA >= 2.
    prisma.gaRecord.groupBy({
      by: ["retailerId"],
      where: { retailer: { employeeId }, date: { gte: start, lt: end } },
      _sum: { gaCount: true },
      having: { gaCount: { _sum: { gte: 2 } } },
    }),
    // LSO currently follows the stated rule using C2S: monthly amount >= 500 AND transactions >= 7.
    // If the Excel workbook reveals extra eligibility conditions, add them here.
    prisma.c2sRecord.groupBy({
      by: ["retailerId"],
      where: { retailer: { employeeId }, date: { gte: start, lt: end } },
      _sum: { amount: true, transactionCount: true },
      having: {
        amount: { _sum: { gte: 500 } },
        transactionCount: { _sum: { gte: 7 } },
      },
    }),
    prisma.monthlyTarget.findUnique({
      where: { employeeId_month: { employeeId, month: start } },
    }),
  ]);

  const gaAchieved = ga._sum.gaCount ?? 0;
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
      sso: ssoRows.length,
      lso: lsoRows.length,
    },
  };
}

import { prisma } from "./prisma";
import { monthBounds } from "./month";
import { monthStartsInRange, monthStartUtc, parseYmd } from "./date-range";
import { normalizeMonth } from "./drilldown";
import {
  isLsoComplete,
  isSimSellerRetailer,
  isSsoComplete,
  isStandardGaActivation,
  lsoAmountRemaining,
  lsoTransactionsRemaining,
  ssoGaRemaining,
} from "./business-rules";

export type RetailerOpportunity = {
  id: string;
  retailerCode: string;
  retailerName: string;
  simSeller: boolean;
  category: string;
  route: string;
  employeeId: string | null;
  employeeName: string;
  supervisor: string;
  ga: number;
  c2c: number;
  c2s: number;
  c2sTransactions: number;
  openingBalance: number | null;
  ssoComplete: boolean;
  lsoComplete: boolean;
  reasons: string[];
  priority: number;
};

export async function retailerOpportunities(
  monthInput: string,
  employeeIds?: string[],
  fromInput?: string,
  toInput?: string,
) {
  const month = normalizeMonth(monthInput);
  const { start, end } = monthBounds(`${month}-01`);
  // The shared strict parser: a local copy accepted 2026-02-31 and rolled it
  // forward to 3 March.
  const parse = (v?: string) => parseYmd(v);
  const rangeStart = parse(fromInput) || start,
    to = parse(toInput),
    rangeEnd = to ? new Date(to.getTime() + 86400000) : end;
  const months = monthStartsInRange(rangeStart, rangeEnd),
    targetStart = months[0] || monthStartUtc(rangeStart),
    last = months.at(-1) || targetStart,
    targetEnd = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 1));
  const scope = employeeIds ? { employeeId: { in: employeeIds } } : {};
  const [retailers, ga, c2c, c2s, c2sMonthly, ob] = await Promise.all([
    prisma.retailer.findMany({
      where: { active: true, ...scope },
      select: {
        id: true,
        retailerCode: true,
        retailerName: true,
        simSeller: true,
        category: true,
        route: true,
        employeeId: true,
        employee: { select: { name: true, supervisor: { select: { name: true } } } },
      },
    }),
    prisma.gaActivation.groupBy({
      by: ["retailerId", "activationDate", "productCode", "sellingPrice"],
      where: {
        activationDate: { gte: rangeStart, lt: rangeEnd },
        ...(employeeIds ? { retailer: { employeeId: { in: employeeIds } } } : {}),
      },
      _count: { _all: true },
    }),
    prisma.c2cRecord.groupBy({
      by: ["retailerId"],
      where: {
        date: { gte: rangeStart, lt: rangeEnd },
        ...(employeeIds ? { retailer: { employeeId: { in: employeeIds } } } : {}),
      },
      _sum: { amount: true },
    }),
    prisma.c2sRecord.groupBy({
      by: ["retailerId"],
      where: {
        date: { gte: rangeStart, lt: rangeEnd },
        ...(employeeIds ? { retailer: { employeeId: { in: employeeIds } } } : {}),
      },
      _sum: { amount: true },
    }),
    prisma.c2sMonthlySummary.findMany({
      where: {
        month: { gte: targetStart, lt: targetEnd },
        ...(employeeIds ? { retailer: { employeeId: { in: employeeIds } } } : {}),
      },
      select: { retailerId: true, month: true, totalAmount: true, transactionCount: true },
    }),
    prisma.obRecord.findMany({
      where: employeeIds ? { retailer: { employeeId: { in: employeeIds } } } : {},
      select: { retailerId: true, amount: true },
    }),
  ]);

  const gaByMonth = new Map<string, number>(),
    gaTotal = new Map<string, number>();
  for (const x of ga) {
    if (!isStandardGaActivation(x)) continue;
    const count = x._count._all,
      mk = x.activationDate.toISOString().slice(0, 7),
      key = `${x.retailerId}|${mk}`;
    gaByMonth.set(key, (gaByMonth.get(key) || 0) + count);
    gaTotal.set(x.retailerId, (gaTotal.get(x.retailerId) || 0) + count);
  }
  const c2cMap = new Map(c2c.map((x) => [x.retailerId, Number(x._sum.amount || 0)]));
  const c2sMap = new Map(c2s.map((x) => [x.retailerId, Number(x._sum.amount || 0)]));
  const monthlyByRetailer = new Map<string, Array<{ month: string; amount: number; trx: number }>>();
  for (const x of c2sMonthly) {
    const arr = monthlyByRetailer.get(x.retailerId) || [];
    arr.push({ month: x.month.toISOString().slice(0, 7), amount: Number(x.totalAmount), trx: x.transactionCount });
    monthlyByRetailer.set(x.retailerId, arr);
  }
  const obMap = new Map(ob.map((x) => [x.retailerId, Number(x.amount)]));
  const monthKeys = months.map((x) => x.toISOString().slice(0, 7));

  return retailers.map((r) => {
    const gaCount = gaTotal.get(r.id) || 0,
      c2cAmount = c2cMap.get(r.id) || 0,
      c2sAmount = c2sMap.get(r.id) || 0,
      monthly = monthlyByRetailer.get(r.id) || [];
    const simSeller = isSimSellerRetailer(r.simSeller);
    const bestGa = monthKeys.reduce((n, m) => Math.max(n, gaByMonth.get(`${r.id}|${m}`) || 0), 0);
    const ssoComplete = monthKeys.some((m) => isSsoComplete(simSeller, gaByMonth.get(`${r.id}|${m}`) || 0));
    const lsoComplete = monthly.some((x) => isLsoComplete(x.amount, x.trx));
    const bestLso = monthly.reduce(
      (best, x) => {
        const score = 1 - lsoAmountRemaining(x.amount) / 500 + (1 - lsoTransactionsRemaining(x.trx) / 7);
        return score > best.score ? { amount: x.amount, trx: x.trx, score } : best;
      },
      { amount: 0, trx: 0, score: -1 },
    );
    const c2sTransactions = monthly.reduce((n, x) => n + x.trx, 0);
    const amountGap = lsoAmountRemaining(bestLso.amount),
      trxGap = lsoTransactionsRemaining(bestLso.trx);
    const reasons: string[] = [];
    if (simSeller && !ssoComplete) reasons.push(`SSO needs ${ssoGaRemaining(bestGa)} GA in one month`);
    if (!lsoComplete) {
      if (amountGap > 0 && trxGap > 0) reasons.push(`LSO needs ৳${Math.ceil(amountGap)} + ${trxGap} trx in one month`);
      else if (amountGap > 0) reasons.push(`LSO needs ৳${Math.ceil(amountGap)} in one month`);
      else reasons.push(`LSO needs ${trxGap} trx in one month`);
    }
    if (c2sAmount === 0) reasons.push("No C2S in selected range");
    if (simSeller && gaCount === 0) reasons.push("No GA in selected range");
    const priority =
      (simSeller && !ssoComplete ? 2 : 0) +
      (!lsoComplete ? 2 : 0) +
      (c2sAmount === 0 ? 1 : 0) +
      (simSeller && gaCount === 0 ? 1 : 0);
    return {
      id: r.id,
      retailerCode: r.retailerCode,
      retailerName: r.retailerName || "Unnamed retailer",
      simSeller,
      category: r.category || "—",
      route: r.route || "—",
      employeeId: r.employeeId,
      employeeName: r.employee?.name || "Unassigned",
      supervisor: r.employee?.supervisor?.name || "Unassigned",
      ga: gaCount,
      c2c: c2cAmount,
      c2s: c2sAmount,
      c2sTransactions,
      openingBalance: obMap.has(r.id) ? obMap.get(r.id)! : null,
      ssoComplete,
      lsoComplete,
      reasons,
      priority,
    } satisfies RetailerOpportunity;
  });
}

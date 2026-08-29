import { prisma } from "./prisma";
import { monthBounds } from "./month";
import { parseYmd, monthStartsInRange, monthStartUtc } from "./date-range";
import { dhakaMonth } from "./business-time";
import {
  GA_CLASSIFICATION_SELECT,
  addGaActivation,
  classifyGaActivation,
  emptyGaBreakdown,
  isLsoComplete,
  isSsoComplete,
  isStandardGaActivation,
} from "./business-rules";

export function normalizeMonth(value?: string) {
  const v = (value || dhakaMonth()).slice(0, 7);
  return /^\d{4}-\d{2}$/.test(v) ? v : dhakaMonth();
}
export async function retailerMonthDetail(retailerId: string, month: string, fromInput?: string, toInput?: string) {
  const { start, end } = monthBounds(`${normalizeMonth(fromInput?.slice(0, 7) || month)}-01`),
    rs = parseYmd(fromInput) || start,
    to = parseYmd(toInput),
    re = to ? new Date(to.getTime() + 86400000) : end;
  const months = monthStartsInRange(rs, re),
    targetStart = months[0] || monthStartUtc(rs),
    last = months.at(-1) || targetStart,
    targetEnd = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 1));
  const [retailer, ga, c2c, c2s, c2cMonthly, c2sMonthly, ob, bp] = await Promise.all([
    prisma.retailer.findUnique({ where: { id: retailerId }, include: { employee: { include: { supervisor: true } } } }),
    prisma.gaActivation.findMany({
      where: { retailerId, activationDate: { gte: rs, lt: re } },
      orderBy: [{ activationDate: "desc" }, { activationTime: "desc" }],
      select: { simNo: true, activationDate: true, activationTime: true, ...GA_CLASSIFICATION_SELECT },
    }),
    prisma.c2cRecord.findMany({
      where: { retailerId, date: { gte: rs, lt: re } },
      orderBy: { date: "desc" },
      select: { date: true, amount: true },
    }),
    prisma.c2sRecord.findMany({
      where: { retailerId, date: { gte: rs, lt: re } },
      orderBy: { date: "desc" },
      select: { date: true, amount: true },
    }),
    prisma.c2cMonthlySummary.findMany({
      where: { retailerId, month: { gte: targetStart, lt: targetEnd } },
      select: { transactionCount: true },
    }),
    prisma.c2sMonthlySummary.findMany({
      where: { retailerId, month: { gte: targetStart, lt: targetEnd } },
      select: { month: true, totalAmount: true, transactionCount: true },
    }),
    prisma.obRecord.findFirst({
      where: { retailerId },
      orderBy: { date: "desc" },
      select: { date: true, amount: true },
    }),
    prisma.bpAssignment.findFirst({
      where: { retailerId, active: true },
      select: { gaTarget: true, startDate: true, employee: { select: { name: true } } },
    }),
  ]);
  if (!retailer) return null;
  // Total GA = MMSTC + MMST/MMSTS only. SIMWAP / EV-SWAP are reported separately.
  const breakdown = emptyGaBreakdown();
  for (const x of ga) addGaActivation(breakdown, x);
  const gaTotal = breakdown.total,
    ga150 = breakdown.ga170,
    ga300 = breakdown.ga300,
    simSwap = breakdown.simSwap;
  const c2cAmount = c2c.reduce((a, x) => a + Number(x.amount), 0),
    c2cTrx = c2cMonthly.reduce((a, x) => a + x.transactionCount, 0);
  const c2sAmount = c2s.reduce((a, x) => a + Number(x.amount), 0),
    c2sTrx = c2sMonthly.reduce((a, x) => a + x.transactionCount, 0);
  const gaByMonth = new Map<string, number>();
  for (const x of ga) {
    if (!isStandardGaActivation(x)) continue;
    const k = x.activationDate.toISOString().slice(0, 7);
    gaByMonth.set(k, (gaByMonth.get(k) || 0) + 1);
  }
  const ssoComplete = [...gaByMonth.values()].some((n) => isSsoComplete(retailer.simSeller, n));
  const lsoComplete = c2sMonthly.some((x) => isLsoComplete(x.totalAmount, x.transactionCount));
  const gaRows = ga.map((x) => ({ ...x, category: classifyGaActivation(x) }));
  return {
    retailer,
    ga: gaRows,
    gaTotal,
    ga150,
    ga300,
    simSwap,
    c2c,
    c2cAmount,
    c2cTrx,
    c2s,
    c2sAmount,
    c2sTrx,
    ob,
    bp,
    ssoComplete,
    lsoComplete,
  };
}

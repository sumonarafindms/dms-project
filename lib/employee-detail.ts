import { prisma } from "./prisma";
import { employeePerformance } from "./performance";
import { monthBounds } from "./month";
import { normalizeMonth } from "./drilldown";
import { parseYmd, monthStartsInRange, monthStartUtc } from "./date-range";
import {
  addGaActivation,
  emptyGaBreakdown,
  isLsoComplete,
  isSsoComplete,
  isStandardGaActivation,
} from "./business-rules";

/**
 * One RSO's retailers, summarised for the drill-down list.
 *
 * This used to be a single nested `retailer.findMany` that included every GA
 * activation, C2S record and C2C record in the range for every retailer, then
 * summed them in JavaScript — an RSO with 130 outlets over a quarter pulled
 * tens of thousands of rows into server memory to render a list of totals.
 *
 * Now the aggregation happens in PostgreSQL: five flat queries whose result
 * sizes are bounded by the number of retailers (and, for GA, by the distinct
 * product/price/day combinations that actually occurred), not by the number of
 * underlying events.
 *
 * The classification still runs here rather than in SQL, because which product
 * codes count as GA is a business rule that must stay in one place
 * (lib/business-rules.ts). `addGaActivation` takes a count, so a grouped row
 * of 40 activations is classified once and added as 40.
 */
export async function employeeDetail(employeeId: string, month: string, fromInput?: string, toInput?: string) {
  const m = normalizeMonth(fromInput?.slice(0, 7) || month),
    { start, end } = monthBounds(`${m}-01`);
  const rs = parseYmd(fromInput) || start,
    to = parseYmd(toInput),
    re = to ? new Date(to.getTime() + 86400000) : end;
  const months = monthStartsInRange(rs, re),
    targetStart = months[0] || monthStartUtc(rs),
    last = months.at(-1) || targetStart,
    targetEnd = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 1));

  const perf = (await employeePerformance(`${m}-01`, [employeeId], fromInput, toInput))[0];
  if (!perf) return null;
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, include: { supervisor: true } });
  if (!employee) return null;

  // Every assigned retailer, not only the active ones.
  //
  // `perf` above aggregates over all of them, so listing only the active
  // outlets meant a deactivated retailer's sales sat in the RSO's totals with
  // nothing on the page to explain them — the drill-down could not reconcile
  // upward. Inactive rows are flagged and, below, only kept when they actually
  // contributed something in the period.
  const retailers = await prisma.retailer.findMany({
    where: { employeeId },
    select: {
      id: true,
      retailerCode: true,
      retailerName: true,
      simSeller: true,
      category: true,
      route: true,
      active: true,
    },
    orderBy: { retailerCode: "asc" },
  });
  if (!retailers.length) return { employee, perf, retailers: [] };

  const retailerIds = retailers.map((r) => r.id);
  const window = { gte: rs, lt: re };

  const [gaGroups, c2sSums, c2cSums, summaries, bpAssignments] = await Promise.all([
    // Grouped by month as well as classification: SSO is a per-calendar-month
    // rule, so a range spanning two months must not merge their counts.
    prisma.gaActivation.groupBy({
      by: ["retailerId", "productCode", "sellingPrice", "activationDate"],
      where: { retailerId: { in: retailerIds }, activationDate: window },
      _count: { _all: true },
    }),
    prisma.c2sRecord.groupBy({
      by: ["retailerId"],
      where: { retailerId: { in: retailerIds }, date: window },
      _sum: { amount: true },
    }),
    prisma.c2cRecord.groupBy({
      by: ["retailerId"],
      where: { retailerId: { in: retailerIds }, date: window },
      _sum: { amount: true },
    }),
    prisma.c2sMonthlySummary.findMany({
      where: { retailerId: { in: retailerIds }, month: { gte: targetStart, lt: targetEnd } },
      select: { retailerId: true, month: true, totalAmount: true, transactionCount: true },
    }),
    prisma.bpAssignment.findMany({
      where: { retailerId: { in: retailerIds }, active: true },
      select: { retailerId: true },
    }),
  ]);

  const breakdowns = new Map<string, ReturnType<typeof emptyGaBreakdown>>();
  const gaByRetailerMonth = new Map<string, Map<string, number>>();
  for (const g of gaGroups) {
    const b = breakdowns.get(g.retailerId) ?? emptyGaBreakdown();
    addGaActivation(b, g, g._count._all);
    breakdowns.set(g.retailerId, b);

    if (!isStandardGaActivation(g)) continue;
    const perMonth = gaByRetailerMonth.get(g.retailerId) ?? new Map<string, number>();
    const key = g.activationDate.toISOString().slice(0, 7);
    perMonth.set(key, (perMonth.get(key) || 0) + g._count._all);
    gaByRetailerMonth.set(g.retailerId, perMonth);
  }

  const c2s = new Map(c2sSums.map((x) => [x.retailerId, Number(x._sum.amount ?? 0)]));
  const c2c = new Map(c2cSums.map((x) => [x.retailerId, Number(x._sum.amount ?? 0)]));
  const isBp = new Set(bpAssignments.map((x) => x.retailerId));
  const summaryByRetailer = new Map<string, typeof summaries>();
  for (const s of summaries) {
    const list = summaryByRetailer.get(s.retailerId) ?? [];
    list.push(s);
    summaryByRetailer.set(s.retailerId, list);
  }

  /** Did this retailer contribute anything in the period? */
  const hadActivity = (id: string) =>
    (breakdowns.get(id)?.total ?? 0) > 0 ||
    (breakdowns.get(id)?.simSwap ?? 0) > 0 ||
    (c2s.get(id) ?? 0) > 0 ||
    (c2c.get(id) ?? 0) > 0;

  return {
    employee,
    perf,
    retailers: retailers
      .filter((r) => r.active || hadActivity(r.id))
      .map((r) => {
        const breakdown = breakdowns.get(r.id) ?? emptyGaBreakdown();
        const monthly = summaryByRetailer.get(r.id) ?? [];
        const perMonth = gaByRetailerMonth.get(r.id);
        return {
          ...r,
          // Total GA excludes SIMWAP / EV-SWAP; swaps are reported on their own.
          ga: breakdown.total,
          simSwap: breakdown.simSwap,
          c2sAmount: c2s.get(r.id) ?? 0,
          c2sTrx: monthly.reduce((a, x) => a + x.transactionCount, 0),
          c2cAmount: c2c.get(r.id) ?? 0,
          sso: perMonth ? [...perMonth.values()].some((n) => isSsoComplete(r.simSeller, n)) : false,
          lso: monthly.some((x) => isLsoComplete(x.totalAmount, x.transactionCount)),
          isBp: isBp.has(r.id),
        };
      }),
  };
}

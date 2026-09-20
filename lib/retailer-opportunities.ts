import { prisma } from "./prisma";
import { monthBounds } from "./month";
import { monthStartsInRange, monthStartUtc, parseYmd } from "./date-range";
import { normalizeMonth } from "./drilldown";
import {
  classifyGaActivation,
  isLsoComplete,
  isSimSellerRetailer,
  isSsoComplete,
  isStandardGaActivation,
  lsoAmountRemaining,
  lsoTransactionsRemaining,
  ssoGaRemaining,
} from "./business-rules";
import { addTier, noTiers, type GaTiers } from "./ga-category";
import { currentGa170Tariff } from "./ga-tariff";

export type RetailerOpportunity = {
  id: string;
  retailerCode: string;
  retailerName: string;
  simSeller: boolean;
  category: string;
  route: string;
  /** The outlet's own iTop-Up number. Blank when master data never carried one. */
  retailerWallet: string;
  employeeId: string | null;
  employeeName: string;
  /** The RSO's wallet number — the field people actually dial. */
  employeeMsisdn: string;
  supervisor: string;
  ga: number;
  /** The 170/300 split of `ga`. Adds up to it exactly. */
  gaTiers: GaTiers;
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
        iTopUpNumber: true,
        employeeId: true,
        employee: { select: { name: true, rsoMsisdn: true, supervisor: { select: { name: true } } } },
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
    /*
     * The date comes back too, so the newest row per retailer can be picked.
     *
     * `importOb` clears the table before writing, so normally there is one
     * snapshot and every retailer has one row. When there is more than one —
     * a restore, a seed, an interrupted import — this query returned several
     * rows per retailer and the Map below kept whichever the database happened
     * to return LAST, so a retailer's "opening balance" could silently be an
     * August figure sitting on a September screen.
     *
     * Settled in memory rather than by looking up `max(date)` first, because
     * `tests/query-depth.smoke.test.ts` holds this function to a single wave
     * of queries and a lookup-then-filter is two waves. Same answer, same
     * round trips. `lib/drilldown.ts` settles it the same way one retailer at
     * a time, with `orderBy: { date: "desc" }`.
     */
    prisma.obRecord.findMany({
      where: employeeIds ? { retailer: { employeeId: { in: employeeIds } } } : {},
      select: { retailerId: true, amount: true, date: true },
    }),
  ]);

  const gaByMonth = new Map<string, number>(),
    gaTotal = new Map<string, GaTiers>();
  /*
   * The tier split costs nothing here: this groupBy has ALWAYS carried
   * `productCode` and `sellingPrice` — it needs them to decide what is a
   * standard GA at all — and only the boolean was being read. Classifying
   * instead of testing turns the same rows into the 170/300 breakdown that
   * every attention row, retailer card and "visit first" row now shows.
   */
  const tariff = await currentGa170Tariff();
  for (const x of ga) {
    if (!isStandardGaActivation(x)) continue;
    const count = x._count._all,
      mk = x.activationDate.toISOString().slice(0, 7),
      key = `${x.retailerId}|${mk}`;
    gaByMonth.set(key, (gaByMonth.get(key) || 0) + count);
    const tiers = gaTotal.get(x.retailerId) ?? noTiers();
    addTier(tiers, classifyGaActivation(x, tariff), count);
    gaTotal.set(x.retailerId, tiers);
  }
  const c2cMap = new Map(c2c.map((x) => [x.retailerId, Number(x._sum.amount || 0)]));
  const c2sMap = new Map(c2s.map((x) => [x.retailerId, Number(x._sum.amount || 0)]));
  const monthlyByRetailer = new Map<string, Array<{ month: string; amount: number; trx: number }>>();
  for (const x of c2sMonthly) {
    const arr = monthlyByRetailer.get(x.retailerId) || [];
    arr.push({ month: x.month.toISOString().slice(0, 7), amount: Number(x.totalAmount), trx: x.transactionCount });
    monthlyByRetailer.set(x.retailerId, arr);
  }
  // Newest row wins, rather than whichever arrived last — see the note above.
  const obLatest = new Map<string, { date: Date; amount: number }>();
  for (const x of ob) {
    const held = obLatest.get(x.retailerId);
    if (!held || x.date > held.date) obLatest.set(x.retailerId, { date: x.date, amount: Number(x.amount) });
  }
  const obMap = new Map([...obLatest].map(([id, x]) => [id, x.amount] as const));
  const monthKeys = months.map((x) => x.toISOString().slice(0, 7));

  return retailers.map((r) => {
    const gaTiers = gaTotal.get(r.id) ?? noTiers(),
      gaCount = gaTiers.total,
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
      // Em dash on screen, but the spreadsheet writes "" for a missing value —
      // see blankIfDash in lib/report-builders.ts. A dash in a sheet column
      // people filter on is a value; an empty cell is the absence of one.
      retailerWallet: r.iTopUpNumber || "—",
      employeeId: r.employeeId,
      employeeName: r.employee?.name || "Unassigned",
      employeeMsisdn: r.employee?.rsoMsisdn || "—",
      supervisor: r.employee?.supervisor?.name || "Unassigned",
      ga: gaCount,
      gaTiers,
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

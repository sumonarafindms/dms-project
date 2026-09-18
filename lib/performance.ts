import { prisma } from "./prisma";
import { monthBounds } from "./month";
import { parseYmd, monthStartUtc, monthStartsInRange, fullyCoveredMonths } from "./date-range";
import { classifyGaActivation, isLsoComplete, isSsoComplete } from "./business-rules";
import { bpLedger } from "./bp-ledger";
// BpPortion lives in the Prisma-free rollup module so client components can
// name it without dragging this file (and Prisma) into the browser bundle.
import type { BpPortion, BpRetailerFigures } from "./bp-rollup";
export type { BpPortion, BpRetailerFigures };

/**
 * One RSO's own performance. **Every figure here excludes their BPs.**
 *
 * If you are building a team or company total, do not sum these fields — use
 * `teamTotals()` from `lib/bp-rollup.ts`, which adds `bp` back in.
 */
export type EmployeePerformance = {
  employeeId: string;
  name: string;
  rsoMsisdn: string;
  employeeCode: string | null;
  /**
   * Retailers currently assigned AND active — what every operational screen
   * means by "Retailers", and what the drill-down list shows. It used to be
   * the total including deactivated outlets, so a dashboard could say an RSO
   * had 132 retailers while their own page listed 119.
   */
  retailerCount: number;
  /** Every retailer ever assigned, active or not. Rarely what a screen wants. */
  totalRetailerCount: number;
  /**
   * The supervisor's id, alongside the display name below it. Pages that group
   * RSOs into teams used to match on `supervisor` (the name), so two
   * supervisors with the same name silently shared one team's totals — and
   * "Unassigned" collected every RSO with no supervisor into a single fake
   * team. Group on this; show the name.
   */
  supervisorId: string | null;
  supervisor: string;
  gaTarget: number;
  gaAchieved: number;
  ga170: number;
  ga300: number;
  ssoTarget: number;
  ssoAchieved: number;
  c2cTarget: number;
  c2cAchieved: number;
  scTarget: number;
  scAchieved: number;
  totalRechargeTarget: number;
  totalRechargeAchieved: number;
  lsoTarget: number;
  lsoAchieved: number;
  c2sAmount: number;
  c2sTransactions: number;
  /** The BP share, excluded from every field above. */
  bp: BpPortion;
};

const NO_BP: BpPortion = {
  count: 0,
  gaTarget: 0,
  gaAchieved: 0,
  ga170: 0,
  ga300: 0,
  ssoAchieved: 0,
  c2cAchieved: 0,
  lsoAchieved: 0,
  c2sAmount: 0,
  c2sTransactions: 0,
  byRetailer: {},
};

const NO_BP_RETAILER: BpRetailerFigures = {
  gaTarget: 0,
  gaAchieved: 0,
  ga170: 0,
  ga300: 0,
  ssoAchieved: 0,
  c2cAchieved: 0,
  lsoAchieved: 0,
  c2sAmount: 0,
  c2sTransactions: 0,
};

export async function employeePerformance(month: string, employeeIds?: string[], fromInput?: string, toInput?: string) {
  const { start, end } = monthBounds(month);
  const rangeStart = parseYmd(fromInput) || start,
    to = parseYmd(toInput),
    rangeEnd = to ? new Date(to.getTime() + 86400000) : end;
  if (rangeEnd <= rangeStart) return [];
  const targetMonths = monthStartsInRange(rangeStart, rangeEnd),
    firstMonth = targetMonths[0] || monthStartUtc(rangeStart),
    lastMonth = targetMonths.at(-1) || firstMonth,
    afterLast = new Date(Date.UTC(lastMonth.getUTCFullYear(), lastMonth.getUTCMonth() + 1, 1));
  const fullMonthKeys = new Set(fullyCoveredMonths(rangeStart, rangeEnd).map((x) => x.toISOString().slice(0, 7)));
  const employeeWhere: any = { active: true };
  if (employeeIds) employeeWhere.id = { in: employeeIds };
  /** An assignment that overlaps the reported range at all. */
  const assignmentWindowWhere = {
    startDate: { lt: rangeEnd },
    OR: [{ endDate: null }, { endDate: { gte: rangeStart } }],
  };

  /*
   * The retailers are fetched ALONGSIDE the employees, not after them.
   *
   * The retailer query used to filter on `employeeId: { in: eids }` — the ids
   * the employee query had just returned — so it could not start until that
   * round trip came back. Expressed as a relation filter it needs no ids at
   * all: "owned by an employee matching this scope" is the same set as "owned
   * by one of the employees that scope returned", and the two queries then run
   * together.
   *
   * `employeeWhere` is the single definition of the scope, used by both, so
   * they cannot drift apart.
   */
  const [employees, retailerRefs] = await Promise.all([
    prisma.employee.findMany({
      where: employeeWhere,
      include: {
        supervisor: true,
        _count: { select: { retailers: { where: { active: true } } } },
        targets: { where: { month: { gte: firstMonth, lt: afterLast } } },
        manualMetrics: { where: { month: { gte: firstMonth, lt: afterLast } } },
      },
    }),
    prisma.retailer.findMany({
      where: {
        OR: [
          { employee: employeeWhere },
          { bpAssignments: { some: { employee: employeeWhere, ...assignmentWindowWhere } } },
        ],
      },
      select: { id: true, employeeId: true, simSeller: true },
    }),
  ]);
  if (!employees.length) return [];

  const eids = employees.map((e) => e.id);
  const employeeIdSet = new Set(eids);
  // Every assigned retailer, active or not: a retailer deactivated mid-period
  // still made the sales it made, so its activity belongs in the period's
  // totals. The COUNT above is active-only because that is what the screens
  // mean by "Retailers"; the drill-down list shows the inactive ones that had
  // activity so the totals stay explainable.
  /*
   * A BP need not be one of this RSO's own retailers.
   *
   * Scope used to be "retailers whose employeeId is one of these", which is
   * the RSO's own base. Now that one outlet can be a Business Partner under
   * several RSOs, at most one of them owns it in the master list — so scoping
   * by ownership alone left every other holder looking at a BP with no
   * figures: the assignment showed, the count showed, and the GA was zero.
   */
  const totalByEmployee = new Map<string, number>();
  for (const r of retailerRefs) {
    if (!r.employeeId) continue;
    totalByEmployee.set(r.employeeId, (totalByEmployee.get(r.employeeId) ?? 0) + 1);
  }
  const retailerIds = retailerRefs.map((r) => r.id),
    retailerMap = new Map(retailerRefs.map((r) => [r.id, r]));

  /*
   * Which of these retailers were Business Partners, and WHEN.
   *
   * Dated, not current. A retailer that became a BP on the 12th produced GA for
   * its RSO on the 11th and for itself on the 13th, and the same report must
   * say both. `assignmentWindow` clips each assignment to the reported range;
   * everything below asks "was this day inside a BP window" rather than "is
   * this retailer a BP now".
   */
  if (!retailerIds.length) {
    return employees.map((e) => {
      const targets = e.targets.reduce(
        (a, t) => ({
          ga: a.ga + t.gaTarget,
          c2c: a.c2c + Number(t.c2cTarget),
          sc: a.sc + Number(t.scTarget),
          recharge: a.recharge + Number(t.totalRechargeTarget),
          sso: a.sso + t.ssoTarget,
          lso: a.lso + t.lsoTarget,
        }),
        { ga: 0, c2c: 0, sc: 0, recharge: 0, sso: 0, lso: 0 },
      );
      const sc = e.manualMetrics.reduce(
        (sum, m) => sum + (fullMonthKeys.has(m.month.toISOString().slice(0, 7)) ? Number(m.scAchieved || 0) : 0),
        0,
      );
      return {
        employeeId: e.id,
        name: e.name,
        rsoMsisdn: e.rsoMsisdn,
        employeeCode: e.employeeCode,
        supervisorId: e.supervisor?.id || null,
        supervisor: e.supervisor?.name || "Unassigned",
        retailerCount: e._count.retailers,
        // The early return runs when the employee has no retailers at all.
        totalRetailerCount: e._count.retailers,
        gaTarget: targets.ga,
        gaAchieved: 0,
        ga170: 0,
        ga300: 0,
        ssoTarget: targets.sso,
        ssoAchieved: 0,
        c2cTarget: targets.c2c,
        c2cAchieved: 0,
        scTarget: targets.sc,
        scAchieved: sc,
        totalRechargeTarget: targets.recharge,
        totalRechargeAchieved: sc,
        lsoTarget: targets.lso,
        lsoAchieved: 0,
        c2sAmount: 0,
        c2sTransactions: 0,
        // No retailers at all, so no BP either.
        bp: NO_BP,
      } satisfies EmployeePerformance;
    });
  }

  /*
   * The BP assignments join the parallel batch rather than preceding it.
   *
   * They used to be awaited on their own, and nothing below the fetch needed
   * them until the ledger was built — so the four aggregate queries sat waiting
   * on a round trip they did not depend on. All five want only `retailerIds`,
   * which is already in hand, so all five go together.
   */
  const [bpAssignments, gaGroups, c2cGroups, c2sGroups, c2sMonthly] = await Promise.all([
    prisma.bpAssignment.findMany({
      where: { retailerId: { in: retailerIds }, ...assignmentWindowWhere },
      select: {
        retailerId: true,
        employeeId: true,
        startDate: true,
        endDate: true,
        gaTarget: true,
        monthlyTargets: { select: { month: true, gaTarget: true } },
      },
    }),
    prisma.gaActivation.groupBy({
      by: ["retailerId", "sellingPrice", "productCode", "activationDate"],
      where: { retailerId: { in: retailerIds }, activationDate: { gte: rangeStart, lt: rangeEnd } },
      _count: { _all: true },
    }),
    // Grouped by DAY as well as retailer, because a BP assignment starts and
    // ends on a date: without the day there is no way to give the 11th to the
    // RSO and the 13th to the BP.
    prisma.c2cRecord.groupBy({
      by: ["retailerId", "date"],
      where: { retailerId: { in: retailerIds }, date: { gte: rangeStart, lt: rangeEnd } },
      _sum: { amount: true },
    }),
    prisma.c2sRecord.groupBy({
      by: ["retailerId", "date"],
      where: { retailerId: { in: retailerIds }, date: { gte: rangeStart, lt: rangeEnd } },
      _sum: { amount: true },
    }),
    prisma.c2sMonthlySummary.findMany({
      where: { retailerId: { in: retailerIds }, month: { gte: firstMonth, lt: afterLast } },
      select: { retailerId: true, totalAmount: true, transactionCount: true },
    }),
  ]);

  /*
   * One ledger answers both BP questions for this window: which days belong to
   * a BP at all, and which RSOs to credit for them. The rule lives in
   * lib/bp-ledger.ts because /api/dashboard/summary needs exactly the same
   * answers — two copies is how the dashboard and the RSO page start
   * disagreeing about one RSO.
   */
  const inScope = (id: string) => employeeIdSet.has(id);
  const ledger = bpLedger(bpAssignments, rangeStart, rangeEnd, inScope);
  const ownerOf = (retailerId: string) => retailerMap.get(retailerId)?.employeeId ?? null;

  const gaBy = new Map<string, { t: number; a170: number; a300: number }>(),
    retailerGaMonth = new Map<string, { eid: string; count: number; simSeller: string | null }>(),
    // Keyed by retailer-month, and it carries the retailer and a day inside
    // that month: SSO is credited to whoever HELD the BP, which is no longer
    // knowable from an employee id alone.
    bpGaMonth = new Map<
      string,
      { retailerId: string; ownerId: string; month: Date; count: number; simSeller: string | null }
    >();
  for (const x of gaGroups) {
    const rr = retailerMap.get(x.retailerId),
      eid = rr?.employeeId;
    if (!eid) continue;
    const count = x._count._all;
    // Standard GA only. SIMWAP / EV-SWAP and unknown product codes never count.
    const category = classifyGaActivation(x);
    if (category !== "GA_170" && category !== "GA_300") continue;
    if (ledger.ownsDay(x.retailerId, x.activationDate.getTime())) {
      // The BP sold this, not the RSO. It still belongs to the territory, so
      // it is kept here rather than dropped — teamTotals() adds it back, once
      // per outlet however many RSOs hold it.
      /*
       * The TIER goes through with the count, not just the count.
       *
       * This used to credit `gaAchieved` alone and drop `category` on the
       * floor. Nothing was wrong with the total — but the moment a screen
       * shows the 170/300 split beside it, an RSO holding a BP would read
       * "GA 41 · GA 170 12 · GA 300 9": three numbers, each correct, that do
       * not add up. Two of them would be describing only the RSO's own
       * outlets while the third described the territory.
       *
       * `ga170 + ga300 === gaAchieved` is asserted at every level in
       * tests/ga-tier-rollup.smoke.test.ts.
       */
      ledger.credit(x.retailerId, x.activationDate.getTime(), eid, (f) => {
        f.gaAchieved += count;
        if (category === "GA_170") f.ga170 += count;
        else f.ga300 += count;
      });
      const bpKey = `${x.retailerId}|${x.activationDate.toISOString().slice(0, 7)}`,
        br = bpGaMonth.get(bpKey) || {
          retailerId: x.retailerId,
          ownerId: eid,
          month: x.activationDate,
          count: 0,
          simSeller: rr?.simSeller ?? null,
        };
      br.count += count;
      bpGaMonth.set(bpKey, br);
      continue;
    }
    const g = gaBy.get(eid) || { t: 0, a170: 0, a300: 0 };
    g.t += count;
    if (category === "GA_170") g.a170 += count;
    else g.a300 += count;
    gaBy.set(eid, g);
    const key = `${x.retailerId}|${x.activationDate.toISOString().slice(0, 7)}`,
      r = retailerGaMonth.get(key) || { eid, count: 0, simSeller: rr?.simSeller ?? null };
    r.count += count;
    retailerGaMonth.set(key, r);
  }
  const sso = new Map<string, number>();
  for (const r of retailerGaMonth.values())
    if (isSsoComplete(r.simSeller, r.count)) sso.set(r.eid, (sso.get(r.eid) || 0) + 1);
  // SSO counts RETAILER-MONTHS, so a BP's months are tallied on the same rule
  // against the BP side rather than being lost.
  for (const r of bpGaMonth.values())
    if (isSsoComplete(r.simSeller, r.count))
      ledger.credit(r.retailerId, r.month.getTime(), r.ownerId, (f) => {
        f.ssoAchieved += 1;
      });

  const c2cBy = new Map<string, number>();
  for (const x of c2cGroups) {
    const eid = retailerMap.get(x.retailerId)?.employeeId;
    if (!eid) continue;
    const amount = Number(x._sum.amount || 0);
    if (ledger.ownsDay(x.retailerId, x.date.getTime()))
      ledger.credit(x.retailerId, x.date.getTime(), eid, (f) => {
        f.c2cAchieved += amount;
      });
    else c2cBy.set(eid, (c2cBy.get(eid) || 0) + amount);
  }
  const c2sAmountBy = new Map<string, number>();
  for (const x of c2sGroups) {
    const eid = retailerMap.get(x.retailerId)?.employeeId;
    if (!eid) continue;
    const amount = Number(x._sum.amount || 0);
    if (ledger.ownsDay(x.retailerId, x.date.getTime()))
      ledger.credit(x.retailerId, x.date.getTime(), eid, (f) => {
        f.c2sAmount += amount;
      });
    else c2sAmountBy.set(eid, (c2sAmountBy.get(eid) || 0) + amount);
  }
  const c2sBy = new Map<string, { amount: number; trx: number; lso: number }>();
  for (const r of c2sMonthly) {
    const eid = retailerMap.get(r.retailerId)?.employeeId;
    if (!eid) continue;
    if (ledger.ownsRetailer(r.retailerId)) {
      const lso = isLsoComplete(r.totalAmount, r.transactionCount);
      ledger.credit(r.retailerId, null, eid, (f) => {
        f.c2sTransactions += r.transactionCount;
        if (lso) f.lsoAchieved += 1;
      });
      continue;
    }
    const e = c2sBy.get(eid) || { amount: c2sAmountBy.get(eid) || 0, trx: 0, lso: 0 };
    e.trx += r.transactionCount;
    if (isLsoComplete(r.totalAmount, r.transactionCount)) e.lso++;
    c2sBy.set(eid, e);
  }
  for (const [eid, amount] of c2sAmountBy) if (!c2sBy.has(eid)) c2sBy.set(eid, { amount, trx: 0, lso: 0 });

  return employees.map((e) => {
    const targets = e.targets.reduce(
      (a, t) => ({
        ga: a.ga + t.gaTarget,
        c2c: a.c2c + Number(t.c2cTarget),
        sc: a.sc + Number(t.scTarget),
        recharge: a.recharge + Number(t.totalRechargeTarget),
        sso: a.sso + t.ssoTarget,
        lso: a.lso + t.lsoTarget,
      }),
      { ga: 0, c2c: 0, sc: 0, recharge: 0, sso: 0, lso: 0 },
    );
    const sc = e.manualMetrics.reduce(
      (sum, m) => sum + (fullMonthKeys.has(m.month.toISOString().slice(0, 7)) ? Number(m.scAchieved || 0) : 0),
      0,
    );
    const g = gaBy.get(e.id) || { t: 0, a170: 0, a300: 0 },
      c = c2cBy.get(e.id) || 0,
      cs = c2sBy.get(e.id) || { amount: 0, trx: 0, lso: 0 };
    const bp: BpPortion = ledger.portionFor(e.id);
    /*
     * The RSO's GA target is used EXACTLY as entered.
     *
     * v136 reduced it by the BPs' own targets, on the assumption that the
     * figure in /targets covered the whole territory including its BPs. The
     * owner corrected that in v139: **RSO targets and BP targets are set
     * independently.** The number typed against an RSO is already that RSO's
     * alone, so subtracting the BP's target from it removed the same SIMs
     * twice — once from achieved, and again from the goal.
     *
     * The effect was invisible in the worst way: an RSO with a BP simply
     * looked better than they were, against a target quietly smaller than the
     * one their manager had set. Nothing errored and no screen was empty.
     *
     * A territory-level target is RSO + BP, and that sum is `withBp()` in
     * lib/bp-rollup.ts — the one place allowed to add them.
     */

    return {
      employeeId: e.id,
      name: e.name,
      rsoMsisdn: e.rsoMsisdn,
      employeeCode: e.employeeCode,
      supervisorId: e.supervisor?.id || null,
      supervisor: e.supervisor?.name || "Unassigned",
      retailerCount: e._count.retailers,
      totalRetailerCount: totalByEmployee.get(e.id) ?? e._count.retailers,
      gaTarget: targets.ga,
      gaAchieved: g.t,
      ga170: g.a170,
      ga300: g.a300,
      ssoTarget: targets.sso,
      ssoAchieved: sso.get(e.id) || 0,
      c2cTarget: targets.c2c,
      c2cAchieved: c,
      scTarget: targets.sc,
      scAchieved: sc,
      totalRechargeTarget: targets.recharge,
      totalRechargeAchieved: c + sc,
      lsoTarget: targets.lso,
      lsoAchieved: cs.lso,
      c2sAmount: cs.amount,
      c2sTransactions: cs.trx,
      bp,
    } satisfies EmployeePerformance;
  });
}
/*
 * `pct` used to live here, byte-identical to `targetPercent` in
 * lib/achievement.ts. It was removed in v134 and every caller now imports
 * `{ targetPercent as pct }` from there instead.
 *
 * Two reasons, and the second is the one that cost real bytes:
 *
 * 1. It was a second definition of the same rounding rule, which is exactly
 *    what lib/achievement.ts exists to own.
 * 2. This file imports `./prisma` on its first line, so ANY module that
 *    reached for `pct` here dragged @prisma/client in behind it.
 *    `EmployeeDetailView` is a client component and did exactly that, which
 *    shipped ~50KB of Prisma's browser stub to every visitor of an employee
 *    detail page — for one line of arithmetic.
 *
 * The lesson generalises: importing a value from a Prisma-touching module into
 * a client component is invisible in review and invisible at runtime. Only the
 * bundle knows. lib/achievement.ts, lib/pacing.ts and lib/comparison.ts are
 * deliberately Prisma-free; client components take their maths from those.
 */

import { prisma } from "./prisma";
import { monthBounds } from "./month";
import { parseYmd, monthStartUtc, monthStartsInRange, fullyCoveredMonths } from "./date-range";
import { classifyGaActivation, isLsoComplete, isSsoComplete } from "./business-rules";
import { assignmentGaTarget, assignmentWindow } from "./bp-period";
// BpPortion lives in the Prisma-free rollup module so client components can
// name it without dragging this file (and Prisma) into the browser bundle.
import type { BpPortion } from "./bp-rollup";
export type { BpPortion };

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
  ga150: number;
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

  const employees = await prisma.employee.findMany({
    where: employeeWhere,
    include: {
      supervisor: true,
      _count: { select: { retailers: { where: { active: true } } } },
      targets: { where: { month: { gte: firstMonth, lt: afterLast } } },
      manualMetrics: { where: { month: { gte: firstMonth, lt: afterLast } } },
    },
  });
  if (!employees.length) return [];

  const eids = employees.map((e) => e.id);
  // Every assigned retailer, active or not: a retailer deactivated mid-period
  // still made the sales it made, so its activity belongs in the period's
  // totals. The COUNT above is active-only because that is what the screens
  // mean by "Retailers"; the drill-down list shows the inactive ones that had
  // activity so the totals stay explainable.
  const retailerRefs = await prisma.retailer.findMany({
    where: { employeeId: { in: eids } },
    select: { id: true, employeeId: true, simSeller: true },
  });
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
  const bpAssignments = retailerIds.length
    ? await prisma.bpAssignment.findMany({
        where: {
          retailerId: { in: retailerIds },
          startDate: { lt: rangeEnd },
          OR: [{ endDate: null }, { endDate: { gte: rangeStart } }],
        },
        select: {
          retailerId: true,
          employeeId: true,
          startDate: true,
          endDate: true,
          gaTarget: true,
          monthlyTargets: { select: { month: true, gaTarget: true } },
        },
      })
    : [];

  /** Half-open BP windows per retailer, in epoch ms, for a cheap day test. */
  const bpWindows = new Map<string, { from: number; to: number }[]>();
  const bpTargetByEmployee = new Map<string, number>();
  const bpCountByEmployee = new Map<string, number>();
  for (const a of bpAssignments) {
    const { effectiveStart, effectiveEnd } = assignmentWindow(a, rangeStart, rangeEnd);
    if (effectiveStart >= effectiveEnd) continue;
    const list = bpWindows.get(a.retailerId) ?? [];
    list.push({ from: effectiveStart.getTime(), to: effectiveEnd.getTime() });
    bpWindows.set(a.retailerId, list);
    // The BP's own target, by the same rule the BP screens use. The RSO's GA
    // target is reduced by exactly this, so the same SIM is never targeted
    // twice.
    bpTargetByEmployee.set(
      a.employeeId,
      (bpTargetByEmployee.get(a.employeeId) ?? 0) +
        assignmentGaTarget(a, monthStartsInRange(effectiveStart, effectiveEnd)),
    );
    bpCountByEmployee.set(a.employeeId, (bpCountByEmployee.get(a.employeeId) ?? 0) + 1);
  }
  const bpOwnsDay = (retailerId: string, dayMs: number) =>
    (bpWindows.get(retailerId) ?? []).some((w) => dayMs >= w.from && dayMs < w.to);
  /**
   * For the monthly figures (LSO, C2S transactions) there is no day to test —
   * `C2sMonthlySummary` is one row per retailer-month. A retailer that was a BP
   * for any part of the reported window is treated as a BP for its monthly
   * summary. That is the only choice available without splitting the summary,
   * and it errs toward the BP, which is the side the RSO is not measured on.
   */
  const bpOwnsRetailerAtAll = (retailerId: string) => bpWindows.has(retailerId);
  const bpPortions = new Map<string, BpPortion>();
  const portion = (eid: string) => {
    let x = bpPortions.get(eid);
    if (!x) {
      x = { ...NO_BP };
      bpPortions.set(eid, x);
    }
    return x;
  };
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
        ga150: 0,
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

  const [gaGroups, c2cGroups, c2sGroups, c2sMonthly] = await Promise.all([
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

  const gaBy = new Map<string, { t: number; a150: number; a300: number }>(),
    retailerGaMonth = new Map<string, { eid: string; count: number; simSeller: string | null }>(),
    bpGaMonth = new Map<string, { eid: string; count: number; simSeller: string | null }>();
  for (const x of gaGroups) {
    const rr = retailerMap.get(x.retailerId),
      eid = rr?.employeeId;
    if (!eid) continue;
    const count = x._count._all;
    // Standard GA only. SIMWAP / EV-SWAP and unknown product codes never count.
    const category = classifyGaActivation(x);
    if (category !== "GA_170" && category !== "GA_300") continue;
    if (bpOwnsDay(x.retailerId, x.activationDate.getTime())) {
      // The BP sold this, not the RSO. It still belongs to the territory, so
      // it is kept here rather than dropped — teamTotals() adds it back.
      portion(eid).gaAchieved += count;
      const bpKey = `${x.retailerId}|${x.activationDate.toISOString().slice(0, 7)}`,
        br = bpGaMonth.get(bpKey) || { eid, count: 0, simSeller: rr?.simSeller ?? null };
      br.count += count;
      bpGaMonth.set(bpKey, br);
      continue;
    }
    const g = gaBy.get(eid) || { t: 0, a150: 0, a300: 0 };
    g.t += count;
    if (category === "GA_170") g.a150 += count;
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
  for (const r of bpGaMonth.values()) if (isSsoComplete(r.simSeller, r.count)) portion(r.eid).ssoAchieved += 1;

  const c2cBy = new Map<string, number>();
  for (const x of c2cGroups) {
    const eid = retailerMap.get(x.retailerId)?.employeeId;
    if (!eid) continue;
    const amount = Number(x._sum.amount || 0);
    if (bpOwnsDay(x.retailerId, x.date.getTime())) portion(eid).c2cAchieved += amount;
    else c2cBy.set(eid, (c2cBy.get(eid) || 0) + amount);
  }
  const c2sAmountBy = new Map<string, number>();
  const bpC2sAmountBy = new Map<string, number>();
  for (const x of c2sGroups) {
    const eid = retailerMap.get(x.retailerId)?.employeeId;
    if (!eid) continue;
    const amount = Number(x._sum.amount || 0);
    if (bpOwnsDay(x.retailerId, x.date.getTime())) bpC2sAmountBy.set(eid, (bpC2sAmountBy.get(eid) || 0) + amount);
    else c2sAmountBy.set(eid, (c2sAmountBy.get(eid) || 0) + amount);
  }
  const c2sBy = new Map<string, { amount: number; trx: number; lso: number }>();
  for (const r of c2sMonthly) {
    const eid = retailerMap.get(r.retailerId)?.employeeId;
    if (!eid) continue;
    if (bpOwnsRetailerAtAll(r.retailerId)) {
      const bp = portion(eid);
      bp.c2sTransactions += r.transactionCount;
      if (isLsoComplete(r.totalAmount, r.transactionCount)) bp.lsoAchieved += 1;
      continue;
    }
    const e = c2sBy.get(eid) || { amount: c2sAmountBy.get(eid) || 0, trx: 0, lso: 0 };
    e.trx += r.transactionCount;
    if (isLsoComplete(r.totalAmount, r.transactionCount)) e.lso++;
    c2sBy.set(eid, e);
  }
  for (const [eid, amount] of c2sAmountBy) if (!c2sBy.has(eid)) c2sBy.set(eid, { amount, trx: 0, lso: 0 });
  for (const [eid, amount] of bpC2sAmountBy) portion(eid).c2sAmount += amount;

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
    const g = gaBy.get(e.id) || { t: 0, a150: 0, a300: 0 },
      c = c2cBy.get(e.id) || 0,
      cs = c2sBy.get(e.id) || { amount: 0, trx: 0, lso: 0 };
    const bp: BpPortion = {
      ...(bpPortions.get(e.id) ?? NO_BP),
      gaTarget: bpTargetByEmployee.get(e.id) ?? 0,
      count: bpCountByEmployee.get(e.id) ?? 0,
    };
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
      ga150: g.a150,
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

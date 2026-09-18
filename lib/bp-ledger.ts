/**
 * Who holds a Business Partner, when, and whose figures they are.
 *
 * ## Why this module exists
 *
 * BP and RSO are many-to-many. One RSO may hold several BPs (v139), and one BP
 * may be held by several RSOs (v142). The second direction is the one that
 * needs care, because it makes two questions come apart that used to be the
 * same question:
 *
 *   - "Was this outlet a BP on this day?"  — decides what to REMOVE from the
 *     servicing RSO's own figures. Unchanged.
 *   - "Whose BP figures are these?"        — decides who to CREDIT. This used
 *     to be answered with the retailer's owner in the master list, which is at
 *     most one RSO and therefore cannot be the answer any more.
 *
 * The owner's rule: **each holder sees the whole thing; the company counts it
 * once.** Two RSOs working the same BP both see its full GA on their own page,
 * because both of them really are working it. The company sold those SIMs once.
 *
 * ## Why it is shared
 *
 * Two aggregation paths reach this data — `lib/performance.ts` for the role
 * pages and `/api/dashboard/summary` for the admin dashboard — and the older
 * comments in both already say they must apply the same rule or `/dashboard`
 * and `/admin/performance/rsos` will disagree about the same RSO. They said it
 * while holding two copies of the rule. Now there is one.
 *
 * Prisma-free, like `bp-period.ts` and `bp-rollup.ts`: it takes plain rows.
 */

import { assignmentGaTarget, assignmentWindow } from "./bp-period";
import { monthStartsInRange } from "./date-range";
import type { BpRetailerFigures } from "./bp-rollup";

export type BpAssignmentRow = {
  retailerId: string;
  employeeId: string;
  startDate: Date;
  endDate: Date | null;
  gaTarget: number;
  monthlyTargets: { month: Date; gaTarget: number }[];
};

type Window = { from: number; to: number; employeeId: string };

const emptyFigures = (): BpRetailerFigures => ({
  gaTarget: 0,
  gaAchieved: 0,
  ga170: 0,
  ga300: 0,
  ssoAchieved: 0,
  c2cAchieved: 0,
  lsoAchieved: 0,
  c2sAmount: 0,
  c2sTransactions: 0,
});

/**
 * Build the ledger for one report window.
 *
 * `inScope` says which employees this query is actually about — a supervisor's
 * page asks about their own RSOs only. It matters for the fallback below.
 */
export function bpLedger(
  assignments: BpAssignmentRow[],
  rangeStart: Date,
  rangeEnd: Date,
  inScope: (employeeId: string) => boolean,
) {
  const windows = new Map<string, Window[]>();
  const countByEmployee = new Map<string, number>();
  const targetByEmployee = new Map<string, number>();

  /*
   * TWO tallies, because they are two different numbers.
   *
   *   `credited`  — what each RSO is credited with. Simultaneous holders are
   *                 each credited the whole thing, which is what their own
   *                 page must show.
   *   `outlet`    — what the OUTLET actually did, added once per credit however
   *                 many RSOs it reaches. This is what a team total sums.
   *
   * Deriving the second from the first is not possible, and trying cost me a
   * bug that `tests/bp-ledger.smoke.test.ts` caught. De-duplicating the
   * credited figures by retailer works for holders who share an outlet at the
   * same time — identical figures, keep one — and silently drops half the
   * month for holders who share it SEQUENTIALLY. A BP handed from one RSO to
   * another on the 10th gives one 3 SIMs and the other 7, and "keep one" makes
   * the company's total 7. Neither max nor overwrite can tell those two
   * situations apart, because by then the days are gone.
   */
  const credited = new Map<string, Record<string, BpRetailerFigures>>();
  const outlet = new Map<string, BpRetailerFigures>();

  const creditedFor = (employeeId: string, retailerId: string) => {
    let byRetailer = credited.get(employeeId);
    if (!byRetailer) {
      byRetailer = {};
      credited.set(employeeId, byRetailer);
    }
    return (byRetailer[retailerId] ??= emptyFigures());
  };
  const outletFor = (retailerId: string) => {
    let f = outlet.get(retailerId);
    if (!f) {
      f = emptyFigures();
      outlet.set(retailerId, f);
    }
    return f;
  };

  for (const a of assignments) {
    const { effectiveStart, effectiveEnd } = assignmentWindow(a, rangeStart, rangeEnd);
    if (effectiveStart >= effectiveEnd) continue;
    const list = windows.get(a.retailerId) ?? [];
    list.push({ from: effectiveStart.getTime(), to: effectiveEnd.getTime(), employeeId: a.employeeId });
    windows.set(a.retailerId, list);
    if (!inScope(a.employeeId)) continue;
    const target = assignmentGaTarget(a, monthStartsInRange(effectiveStart, effectiveEnd));
    countByEmployee.set(a.employeeId, (countByEmployee.get(a.employeeId) ?? 0) + 1);
    targetByEmployee.set(a.employeeId, (targetByEmployee.get(a.employeeId) ?? 0) + target);
    /*
     * The per-retailer target is the LARGEST any holder set, not the sum.
     *
     * The target file gives one GA target per BP code and applies it to every
     * assignment of that code, so normally they are equal and this is that
     * number. They can still be edited apart by hand on the BP screen, and
     * then the company needs a single figure for an outlet that will only sell
     * so many SIMs. Summing would inflate the goal by the number of holders;
     * the largest is deterministic and never quietly lowers it.
     */
    creditedFor(a.employeeId, a.retailerId).gaTarget += target;
    const o = outletFor(a.retailerId);
    o.gaTarget = Math.max(o.gaTarget, target);
  }

  /** Was this outlet a BP on this day — by ANY RSO? */
  const ownsDay = (retailerId: string, dayMs: number) =>
    (windows.get(retailerId) ?? []).some((w) => dayMs >= w.from && dayMs < w.to);

  /**
   * Was it a BP at any point in the window?
   *
   * For monthly sources (LSO, C2S transaction counts) there is no day to test —
   * `C2sMonthlySummary` is one row per retailer-month. A retailer that was a BP
   * for any part of the window is treated as one, which errs toward the BP:
   * the side the RSO is not measured on.
   */
  const ownsRetailer = (retailerId: string) => windows.has(retailerId);

  /**
   * Which in-scope RSOs to credit, with the owner as a last resort.
   *
   * The fallback is what stops a partial-scope view losing sales. If a BP is
   * held only by RSOs outside this query — a supervisor looking at their own
   * team, while the outlet is worked by someone else's RSO — there is no holder
   * to credit, and without the fallback the outlet's GA would vanish from a
   * page that removed it from the servicing RSO's own figures a moment ago.
   *
   * It cannot double-count: holders and owner are never both used. At company
   * scope every holder is in scope, so the fallback never fires at all, which
   * is the only place the total has to be exactly right.
   */
  const creditees = (retailerId: string, dayMs: number | null, ownerId: string | null | undefined) => {
    const list = windows.get(retailerId) ?? [];
    const covering = dayMs === null ? list : list.filter((w) => dayMs >= w.from && dayMs < w.to);
    const holders = [...new Set(covering.map((w) => w.employeeId))].filter(inScope);
    if (holders.length) return holders;
    return ownerId && inScope(ownerId) ? [ownerId] : [];
  };

  /**
   * Add to every RSO holding this outlet.
   *
   * `dayMs` null means a monthly figure with no day to test. `apply` runs once
   * per creditee against that creditee's own copy of the retailer's figures —
   * each holder ends up with the full amount, and `teamTotals()` in
   * bp-rollup.ts unions them by retailer so the company counts it once.
   */
  const credit = (
    retailerId: string,
    dayMs: number | null,
    ownerId: string | null | undefined,
    apply: (f: BpRetailerFigures) => void,
  ) => {
    const holders = creditees(retailerId, dayMs, ownerId);
    if (!holders.length) return;
    // Once for the outlet, then once per holder. The outlet's tally is what a
    // team total adds up; the holders' are what their own pages show.
    apply(outletFor(retailerId));
    for (const employeeId of holders) apply(creditedFor(employeeId, retailerId));
  };

  /**
   * One RSO's BP portion.
   *
   * The aggregates are THIS RSO's credited figures — the whole of every outlet
   * they hold. `byRetailer` carries the OUTLETS' figures instead, one entry per
   * outlet this RSO holds, so that `teamTotals()` in bp-rollup.ts can union
   * them across RSOs and count each outlet exactly once.
   *
   * The two agree whenever an outlet has a single holder, which is every case
   * before this version and most cases after it.
   */
  const portionFor = (employeeId: string) => {
    const mine = credited.get(employeeId) ?? {};
    const byRetailer: Record<string, BpRetailerFigures> = {};
    for (const retailerId of Object.keys(mine)) byRetailer[retailerId] = outletFor(retailerId);
    const agg = Object.values(mine).reduce((a, f) => {
      a.gaAchieved += f.gaAchieved;
      a.ga170 += f.ga170;
      a.ga300 += f.ga300;
      a.ssoAchieved += f.ssoAchieved;
      a.c2cAchieved += f.c2cAchieved;
      a.lsoAchieved += f.lsoAchieved;
      a.c2sAmount += f.c2sAmount;
      a.c2sTransactions += f.c2sTransactions;
      return a;
    }, emptyFigures());
    return {
      count: countByEmployee.get(employeeId) ?? 0,
      gaTarget: targetByEmployee.get(employeeId) ?? 0,
      gaAchieved: agg.gaAchieved,
      ga170: agg.ga170,
      ga300: agg.ga300,
      ssoAchieved: agg.ssoAchieved,
      c2cAchieved: agg.c2cAchieved,
      lsoAchieved: agg.lsoAchieved,
      c2sAmount: agg.c2sAmount,
      c2sTransactions: agg.c2sTransactions,
      byRetailer,
    };
  };

  return { ownsDay, ownsRetailer, credit, portionFor };
}

export type BpLedger = ReturnType<typeof bpLedger>;

import { parseYmd } from "./date-range";
import { monthBounds } from "./month";
import type { RollupTotals } from "./bp-rollup";

/**
 * A supervisor's own target — the one they are measured against.
 *
 * ## Prisma-free, deliberately
 *
 * Like `lib/bp-rollup.ts` and `lib/ga-category.ts`: the company dashboard is a
 * client component and needs `withSupervisorTarget` and `sumSupervisorTargets`
 * to apply the same rule to the rows it fetched. Importing a value from a
 * Prisma-touching module into client code is how ~50KB of Prisma's browser stub
 * ended up in the bundle in v134, so the one function that queries the database
 * lives in `./supervisor-target-query`.
 *
 * ## What changed, and why
 *
 * Until v181 a supervisor held no target at all. Every supervisor figure in the
 * app was a SUM of the people under them: their RSOs' `MonthlyTarget` rows, and
 * on the dashboard path their BPs' GA target on top. Two comments in the
 * codebase stated it as settled law — `app/manager/page.tsx` said "Supervisors
 * hold no targets of their own, so a supervisor's target is the sum of their
 * RSOs'", and `lib/report-data.ts` said the same.
 *
 * The owner's ruling is that the sum is not a target anybody can manage
 * against. An RSO's target is what that RSO must sell; a supervisor's job is
 * not the addition of eight of those, and adding the BP targets on top made it
 * higher again. So a supervisor's target is now set directly on `/targets` and
 * stands on its own, exactly as v139 established for RSO and BP targets.
 *
 * ## Six metrics, not one
 *
 * The columns mirror `MonthlyTarget` because the screens do. A supervisor's
 * home shows GA, SSO, LSO and C2C cards; the manager's page shows GA and
 * Recharge. Storing only GA would have left five cards reading "No target set"
 * for everybody, which is a different kind of wrong from being too high.
 *
 * ## Not set is not zero
 *
 * `set` is false when no row exists for the month, and every target field is
 * then 0. That is deliberate and it is what `KpiCard` already does the right
 * thing with: no ring, no bar, "No target set". The old sum is NOT used as a
 * fallback — a figure nobody chose is what this change exists to remove.
 */
export type SupervisorTarget = {
  /** False when no row exists for any month in the range. */
  set: boolean;
  gaTarget: number;
  c2cTarget: number;
  scTarget: number;
  totalRechargeTarget: number;
  ssoTarget: number;
  lsoTarget: number;
};

export const emptySupervisorTarget = (): SupervisorTarget => ({
  set: false,
  gaTarget: 0,
  c2cTarget: 0,
  scTarget: 0,
  totalRechargeTarget: 0,
  ssoTarget: 0,
  lsoTarget: 0,
});

/**
 * The same window `employeePerformance` reports over.
 *
 * Every page that shows a supervisor figure takes a month and an optional
 * from/to overlay, and the target has to cover exactly the span the
 * achievement covers — a target for September against eight days of sales is
 * not a comparison, it is two different questions side by side. Written once
 * here rather than at seven call sites, because seven copies of a date
 * calculation is how two of them end up disagreeing.
 */
export function targetWindow(month: string, fromInput?: string, toInput?: string) {
  const { start, end } = monthBounds(month);
  const rangeStart = parseYmd(fromInput) || start;
  const to = parseYmd(toInput);
  const rangeEnd = to ? new Date(to.getTime() + 86400000) : end;
  return { start: rangeStart, endExclusive: rangeEnd > rangeStart ? rangeEnd : end };
}

/** One supervisor's target, or the honest empty one. */
export const targetFor = (map: Map<string, SupervisorTarget>, supervisorId: string | null | undefined) =>
  (supervisorId && map.get(supervisorId)) || emptySupervisorTarget();

/**
 * A manager's or the company's target: the supervisors' own targets added.
 *
 * This is the owner's second ruling and it follows from the first. Once a
 * supervisor's target is a number somebody chose, a manager's target has to be
 * the sum of those chosen numbers — otherwise the manager's page would show a
 * headline figure built from RSO targets above a row of supervisor cards built
 * from supervisor targets, and the two would never add up. That is precisely
 * the "two numbers wearing one word" defect v178 was about.
 *
 * `set` is true if ANY supervisor in the scope has a target, because a total
 * over a scope where half the supervisors are set is still a real number — it
 * is just incomplete, and the supervisor cards below it show which ones.
 */
export function sumSupervisorTargets(targets: Iterable<SupervisorTarget>): SupervisorTarget {
  const total = emptySupervisorTarget();
  for (const t of targets) {
    if (!t.set) continue;
    total.set = true;
    total.gaTarget += t.gaTarget;
    total.c2cTarget += t.c2cTarget;
    total.scTarget += t.scTarget;
    total.totalRechargeTarget += t.totalRechargeTarget;
    total.ssoTarget += t.ssoTarget;
    total.lsoTarget += t.lsoTarget;
  }
  return total;
}

/**
 * The achievements from the roll-up, the targets from the supervisor's own row.
 *
 * The achieved figures still come from `teamTotals` / `groupTotals`, and must:
 * a supervisor's ACHIEVEMENT is genuinely what their territory sold, BP outlets
 * included and shared outlets counted once. Only the target side is replaced.
 *
 * Kept here rather than at each call site so there is one place that knows
 * which six fields are targets, and so `tests/bp-rollup.smoke.test.ts` can go
 * on banning hand-summed target arithmetic under `app/`.
 */
export function withSupervisorTarget(totals: RollupTotals, target: SupervisorTarget): RollupTotals {
  return {
    ...totals,
    gaTarget: target.gaTarget,
    c2cTarget: target.c2cTarget,
    scTarget: target.scTarget,
    totalRechargeTarget: target.totalRechargeTarget,
    ssoTarget: target.ssoTarget,
    lsoTarget: target.lsoTarget,
  };
}

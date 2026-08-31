/**
 * BP assignment periods — pure date logic, no Prisma.
 *
 * A BP assignment is an interval [startDate, endDate], `endDate` null meaning
 * "still current". Every historical report must ask which assignment was in
 * force on the day being reported, never which one is active now: a retailer
 * moved from BP A to BP B last week was previously reported under B for every
 * past date, which is backwards for a Reporting Centre whose job is history.
 *
 * Kept free of @prisma/client so the rules can be unit-tested directly, the
 * same reason lib/achievement.ts exists.
 */

/** Prisma `where` for assignments whose interval overlaps [start, endExclusive). */
export function overlapsRange(start: Date, endExclusive: Date) {
  return {
    startDate: { lt: endExclusive },
    OR: [{ endDate: null }, { endDate: { gte: start } }],
  };
}

/** True when `date` falls inside both the report window and the assignment. */
export function coversDate(
  assignment: { startDate: Date; endDate: Date | null },
  date: Date,
  start: Date,
  endExclusive: Date,
) {
  if (date < start || date >= endExclusive) return false;
  if (date < assignment.startDate) return false;
  // endDate is the last effective day, inclusive.
  return assignment.endDate === null || date <= assignment.endDate;
}

/**
 * The part of an assignment that falls inside the report window.
 *
 * `endDate` is the last effective day, inclusive, so the exclusive end is the
 * day after it. Moved here from `bp-activations.ts` in v136 so that
 * `performance.ts` can apply the same window without importing that module —
 * two copies of this arithmetic is exactly how a BP that changed hands
 * mid-month ends up counted twice.
 */
export function assignmentWindow(a: { startDate: Date; endDate: Date | null }, rangeStart: Date, rangeEnd: Date) {
  const effectiveStart = a.startDate > rangeStart ? a.startDate : rangeStart;
  const assignmentEnd = a.endDate ? new Date(a.endDate.getTime() + 86400000) : rangeEnd;
  return { effectiveStart, effectiveEnd: assignmentEnd < rangeEnd ? assignmentEnd : rangeEnd };
}

/**
 * A BP's GA target over a window: the month-by-month override where one is set,
 * otherwise the assignment's standing target.
 *
 * This is the rule the BP screens already used; it lives here now because the
 * RSO's own target is reduced by exactly this number (v136), and the two must
 * agree or the same GA will be targeted twice.
 */
export function assignmentGaTarget(
  a: { gaTarget: number; monthlyTargets: { month: Date; gaTarget: number }[] },
  monthStarts: Date[],
) {
  const byMonth = new Map(a.monthlyTargets.map((x) => [x.month.toISOString().slice(0, 7), x.gaTarget]));
  return monthStarts.reduce((sum, m) => sum + (byMonth.get(m.toISOString().slice(0, 7)) ?? a.gaTarget), 0);
}

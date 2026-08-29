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

import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { monthBounds } from "./month";
/*
 * `paceStatus`, `rankRows` and the `PaceStatus` type were removed in v132:
 * nothing imported them. `rankRows` was the only caller of `paceStatus`, and
 * nothing called `rankRows` — so the whole chain was dead.
 *
 * Worth recording, because it is the sort of thing that wastes a later hour:
 * v128 "removed a duplicate" inside `paceStatus` (it inlined the 8 / -5
 * margins that lib/achievement.ts already owned as PACE_AHEAD_MARGIN and
 * PACE_BEHIND_MARGIN). The observation was right and the fix was correct, but
 * it was applied to code no screen ever ran. Deleting it is the real fix.
 */
import { dhakaTodayYmd, dhakaYesterdayYmd, businessDayBounds } from "./business-time";
import { feedDay } from "./feed-day";
import { withStandardGa } from "./business-rules";

export function monthPace(month: string, now = new Date()) {
  const { start, end } = monthBounds(month);
  const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000);
  const todayUtc = new Date(`${dhakaTodayYmd(now)}T00:00:00.000Z`);
  if (todayUtc < start) return 0;
  if (todayUtc >= end) return 100;
  const elapsed = Math.max(1, Math.min(totalDays, Math.floor((todayUtc.getTime() - start.getTime()) / 86400000) + 1));
  return Math.round((elapsed / totalDays) * 100);
}
/** A stored business date back to the `YYYY-MM-DD` it was written from. */
const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/** That day as a Prisma range — see `businessDayBounds` for why it is a range. */
function dayRange(day: string) {
  const { start, end } = businessDayBounds(day);
  return { gte: start, lt: end };
}

/**
 * The newest business day the GA feed has, or null when nothing is imported.
 *
 * Deliberately unscoped. Every screen that shows "GA on the latest day" must
 * anchor on the same day, or two roles looking at the same outlet disagree
 * about which day they are describing — and neither says which.
 */
export async function latestGaDay(): Promise<string | null> {
  const row = await prisma.gaActivation.findFirst({
    where: withStandardGa(),
    orderBy: { activationDate: "desc" },
    select: { activationDate: true },
  });
  return ymd(row?.activationDate);
}

/**
 * The newest day each daily feed has, and this scope's figure on that day.
 *
 * ## The anchor is the feed's, not the viewer's
 *
 * This function used to ask for the newest activation date **that matched the
 * scope filter** — so an RSO with no sales for three weeks got the count from
 * the last day they did sell, presented as "Latest GA" with no date. It was
 * structurally incapable of returning a zero, because a zero has no row to read
 * a date from. See `lib/feed-day.ts` for the whole story.
 *
 * The two `findFirst` calls below therefore carry **no scope filter at all**.
 * The scoped queries that follow count within the day the feed decided.
 *
 * ## Four queries, whatever the scope
 *
 * The old version pulled every GA row and every C2C row for the day into
 * memory to group them by employee, and the two maps it built were read by
 * nothing — all four callers used only the totals. A `count` and an `aggregate`
 * do the same work in the database.
 */
export async function latestDailySnapshot(employeeIds?: string[], now = new Date()) {
  const lastDue = dhakaYesterdayYmd(now);
  const scope = employeeIds ? { retailer: { employeeId: { in: employeeIds } } } : {};
  const gaScope = withStandardGa(scope);
  const c2cScope: Prisma.C2cRecordWhereInput = scope;

  const [gaYmd, latestC2c] = await Promise.all([
    latestGaDay(),
    prisma.c2cRecord.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
  ]);
  const c2cYmd = ymd(latestC2c?.date);

  const [gaCount, c2cSum] = await Promise.all([
    gaYmd
      ? prisma.gaActivation.count({ where: { AND: [gaScope, { activationDate: dayRange(gaYmd) }] } })
      : Promise.resolve(0),
    c2cYmd
      ? prisma.c2cRecord.aggregate({ _sum: { amount: true }, where: { ...c2cScope, date: dayRange(c2cYmd) } })
      : Promise.resolve(null),
  ]);

  return {
    ga: feedDay(gaYmd, gaCount, lastDue),
    c2c: feedDay(c2cYmd, Number(c2cSum?._sum.amount ?? 0), lastDue),
  };
}

import { monthBounds } from "./month";
import { dhakaTodayYmd, dhakaYesterdayYmd } from "./business-time";
import { ACHIEVEMENT_ON_TRACK_PERCENT } from "./achievement";

/**
 * Target pacing and month-end forecast.
 *
 * The question this answers is not "how much of the target is done" — that is
 * `targetPercent` — but "is that enough, and what has to happen for the rest of
 * the month". An RSO at 65% on the 12th is comfortable; the same 65% on the
 * 28th is in trouble, and the useful output in both cases is a number of units
 * per day, not a percentage.
 *
 * Kept Prisma-free like `achievement.ts`, so client components can use it
 * without dragging the Prisma runtime into the browser bundle.
 *
 * ## Two things that are easy to get wrong, and how they are handled
 *
 * **The business day is Dhaka, not UTC.** Every other figure in DMS is counted
 * against the Asia/Dhaka day, so "today" here comes from `business-time.ts`. A
 * UTC "today" would move the whole calculation by a day for six hours out of
 * every twenty-four, and would put the 1st of the month in the previous month.
 *
 * **Data lags a day.** GA, C2C, C2S and OB are uploaded for the previous day —
 * the daily report defaults to yesterday for that reason. So the achieved
 * figure normally covers days 1..yesterday, and dividing it by today's date
 * would understate the run rate every single day. `throughYmd` names the last
 * day the data actually covers and defaults to yesterday; pass the real date
 * when the caller knows it.
 */

export type MonthPhase = "future" | "current" | "past";

export type MonthWindow = {
  phase: MonthPhase;
  daysInMonth: number;
  /** Today's day number inside this month, or null when today is outside it. */
  dayOfMonth: number | null;
  /** Days of data behind the achieved figure. Zero means nothing to average. */
  elapsedDays: number;
  /** Days left to sell, INCLUDING today — today is not over yet. */
  daysRemaining: number;
};

const DAY = 86400000;
const dayNumber = (ymd: string, start: Date) =>
  Math.floor((new Date(`${ymd}T00:00:00.000Z`).getTime() - start.getTime()) / DAY) + 1;

/**
 * Where a month sits relative to today, and how much of it is spent.
 *
 * @param month     "YYYY-MM" or any date inside the month.
 * @param now       Injectable for tests.
 * @param throughYmd Last day the achieved figure covers. Defaults to yesterday.
 */
export function monthWindow(month: string, now = new Date(), throughYmd?: string): MonthWindow {
  const { start, end } = monthBounds(month.length === 7 ? `${month}-01T00:00:00.000Z` : month);
  const daysInMonth = Math.round((end.getTime() - start.getTime()) / DAY);
  const todayUtc = new Date(`${dhakaTodayYmd(now)}T00:00:00.000Z`);

  if (todayUtc < start)
    return { phase: "future", daysInMonth, dayOfMonth: null, elapsedDays: 0, daysRemaining: daysInMonth };
  if (todayUtc >= end)
    return { phase: "past", daysInMonth, dayOfMonth: null, elapsedDays: daysInMonth, daysRemaining: 0 };

  const dayOfMonth = dayNumber(dhakaTodayYmd(now), start);
  const through = throughYmd || dhakaYesterdayYmd(now);
  // Clamped both ways: `through` can precede the month (on the 1st, yesterday
  // is last month) or, if a caller passes a later date, run past its end.
  const elapsedDays = Math.max(0, Math.min(daysInMonth, dayNumber(through, start)));
  return { phase: "current", daysInMonth, dayOfMonth, elapsedDays, daysRemaining: daysInMonth - dayOfMonth + 1 };
}

/**
 * How a month is expected to end.
 *
 * `Too early`, `Missed` and `No target` are not in the four states the brief
 * named, and they are here deliberately: a forecast built on zero days of data
 * is not a forecast, a finished month cannot be "at risk", and a row with no
 * target should not be reported as failing one. Claiming otherwise would be
 * the kind of confident-but-wrong number this system is meant to stop
 * producing.
 */
export type RiskStatus = "Achieved" | "On track" | "At risk" | "Likely miss" | "Missed" | "Too early" | "No target";

export type Pacing = {
  target: number;
  achieved: number;
  /** Never negative: over-achievement is a surplus, not a negative remainder. */
  remaining: number;
  percent: number;
  window: MonthWindow;
  /** Units per day needed from today on. null when the month is over. */
  requiredPerDay: number | null;
  /** Units per day achieved so far. null when no day of data has landed. */
  currentPerDay: number | null;
  /** Month-end estimate at the current rate. null when not projectable. */
  projected: number | null;
  projectedPercent: number | null;
  /** projected − target. Negative is a shortfall. */
  gap: number | null;
  status: RiskStatus;
};

/**
 * A projected finish at or above target is on track; below the same 80% line
 * the rest of the app uses for "near target" it is at risk; under that it is a
 * likely miss. The 80 is `ACHIEVEMENT_ON_TRACK_PERCENT` rather than a fresh
 * number, so a distributor who retunes that line retunes this with it.
 */
export const FORECAST_AT_RISK_PERCENT = ACHIEVEMENT_ON_TRACK_PERCENT;

export function pacing(target: number, achieved: number, month: string, now = new Date(), throughYmd?: string): Pacing {
  const window = monthWindow(month, now, throughYmd);
  const safeTarget = Number.isFinite(target) && target > 0 ? target : 0;
  const safeAchieved = Number.isFinite(achieved) ? Math.max(0, achieved) : 0;
  const remaining = Math.max(0, safeTarget - safeAchieved);
  const percent = safeTarget ? Math.round((safeAchieved / safeTarget) * 100) : 0;

  const requiredPerDay = window.daysRemaining > 0 ? remaining / window.daysRemaining : null;
  const currentPerDay = window.elapsedDays > 0 ? safeAchieved / window.elapsedDays : null;
  // elapsedDays + daysRemaining === daysInMonth, so this projects the whole
  // month exactly once — no day counted twice and none dropped.
  const projected = currentPerDay === null ? null : safeAchieved + currentPerDay * window.daysRemaining;
  const projectedPercent = projected === null || !safeTarget ? null : Math.round((projected / safeTarget) * 100);
  const gap = projected === null || !safeTarget ? null : projected - safeTarget;

  let status: RiskStatus;
  if (!safeTarget) status = "No target";
  else if (safeAchieved >= safeTarget) status = "Achieved";
  else if (window.phase === "past") status = "Missed";
  else if (projectedPercent === null) status = "Too early";
  else if (projectedPercent >= 100) status = "On track";
  else if (projectedPercent >= FORECAST_AT_RISK_PERCENT) status = "At risk";
  else status = "Likely miss";

  return {
    target: safeTarget,
    achieved: safeAchieved,
    remaining,
    percent,
    window,
    requiredPerDay,
    currentPerDay,
    projected,
    projectedPercent,
    gap,
    status,
  };
}

/**
 * Does the view the user is looking at cover the whole calendar month?
 *
 * Several detail pages accept `from`/`to` as well as `month`, so the figures
 * on screen may describe an eight-day window rather than a month. Pacing is a
 * monthly idea — "22 days left", "need 44/day to finish the month" — and
 * printing it over a custom range would be a confidently wrong number, which
 * is the failure mode this whole system is meant to avoid.
 *
 * A range that happens to span the entire month is still a month, so it
 * passes.
 */
export function coversWholeMonth(month: string, from?: string | null, to?: string | null) {
  if (!from && !to) return true;
  const { start, end } = monthBounds(month.length === 7 ? `${month}-01T00:00:00.000Z` : month);
  const firstYmd = start.toISOString().slice(0, 10);
  const lastYmd = new Date(end.getTime() - DAY).toISOString().slice(0, 10);
  if (from && from > firstYmd) return false;
  if (to && to < lastYmd) return false;
  return true;
}

/**
 * `pacing()` for a page that may be showing a narrowed date range. Returns
 * null — meaning "show nothing" — rather than a monthly figure that does not
 * describe what is on screen.
 */
export function pacingForView(
  target: number,
  achieved: number,
  month: string,
  opts: { from?: string | null; to?: string | null; now?: Date; throughYmd?: string } = {},
): Pacing | null {
  if (!coversWholeMonth(month, opts.from, opts.to)) return null;
  return pacing(target, achieved, month, opts.now ?? new Date(), opts.throughYmd);
}

/** Styling hook, mirroring the bands the rest of the kit already uses. */
export function riskTone(status: RiskStatus): "good" | "mid" | "low" | "neutral" {
  if (status === "Achieved" || status === "On track") return "good";
  if (status === "At risk") return "mid";
  if (status === "Likely miss" || status === "Missed") return "low";
  return "neutral";
}

/**
 * Whole units, rounded UP: "44 per day" when 43.75 is needed, because 43 is
 * not enough. Counts and taka both round the same way — you cannot activate
 * 0.75 of a SIM, and under-collecting taka misses the target just as surely.
 */
export function perDayLabel(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return Math.ceil(value).toLocaleString();
}

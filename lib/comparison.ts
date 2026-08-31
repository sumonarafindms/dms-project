/**
 * Period-over-period comparison: this day against the one before, this week
 * against last, this month against last.
 *
 * Prisma-free like `achievement.ts` and `pacing.ts`, so client components can
 * use it without pulling the Prisma runtime into the browser bundle.
 *
 * ## Two things this file exists to get right
 *
 * **Dividing by a previous value of zero.** An RSO who did nothing yesterday
 * and 40 today has not improved by "Infinity%". Percent change is `null` for
 * that case and the direction is `new`, so no screen can print `Infinity`,
 * `NaN` or a meaningless enormous number. This is the single most common way
 * a comparison feature embarrasses itself.
 *
 * **"Today" is the wrong anchor in this system.** GA, C2C, C2S and OB are
 * uploaded for the PREVIOUS day — that is why the daily report defaults to
 * yesterday and why `latestDailySnapshot` looks for the newest date that has
 * data rather than assuming today. Comparing an empty today against a full
 * yesterday would show a catastrophic drop every single morning. So every
 * window here takes an explicit anchor date, and the caller passes the last
 * day that actually has data. The labels then name the real dates, so nothing
 * on screen claims to be "today" when it is not.
 */

/**
 * Which day a week starts on, as `Date.getUTCDay()` (0 = Sunday, 6 = Saturday).
 *
 * **Saturday**, confirmed by the distributor in v133. Their week runs Saturday
 * to Friday, so Saturday is day one of every week-on-week comparison.
 *
 * This is a business convention, not a fact about calendars, and it is the
 * single number the whole week comparison turns on. Get it wrong and nothing
 * breaks — every week window silently compares the wrong five or six days
 * against each other, which is worse than an error, because the numbers still
 * look plausible.
 *
 * v130 shipped this as `0` (Sunday) on the reasoning that Bangladesh's weekend
 * is Friday and Saturday. That reasoning was flagged for confirmation rather
 * than assumed, and the answer was that this distributor starts on Saturday.
 * Confirm before changing it again.
 */
export const WEEK_STARTS_ON = 6;

const DAY = 86400000;
const utc = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const shift = (value: string, days: number) => ymd(new Date(utc(value).getTime() + days * DAY));

/* ------------------------------------------------------------------ *
 * The comparison itself
 * ------------------------------------------------------------------ */

export type ChangeDirection = "up" | "down" | "flat" | "new" | "none";

export type Comparison = {
  current: number;
  previous: number;
  /** current − previous. Negative is a fall. */
  difference: number;
  /** Rounded percent change, or null when there is no sound way to compute it. */
  percentChange: number | null;
  direction: ChangeDirection;
};

const finite = (n: number) => (Number.isFinite(n) ? n : 0);

export function compare(current: number, previous: number): Comparison {
  const c = finite(current),
    p = finite(previous);
  const difference = c - p;

  // Order matters. The zero-previous cases are resolved BEFORE any division,
  // which is what keeps Infinity and NaN off the screen.
  if (p === 0 && c === 0) return { current: c, previous: p, difference: 0, percentChange: null, direction: "none" };
  if (p === 0) return { current: c, previous: p, difference, percentChange: null, direction: "new" };

  const percentChange = Math.round((difference / p) * 100);
  const direction: ChangeDirection = difference > 0 ? "up" : difference < 0 ? "down" : "flat";
  return { current: c, previous: p, difference, percentChange, direction };
}

/**
 * The change as a short label.
 *
 * `New` rather than a percentage when there was nothing to grow from, and an
 * em dash when both periods are empty — never a number that cannot mean
 * anything.
 */
export function changeLabel(c: Comparison) {
  if (c.direction === "none") return "—";
  if (c.direction === "new") return "New";
  if (c.percentChange === null) return "—";
  const sign = c.percentChange > 0 ? "+" : "";
  return `${sign}${c.percentChange}%`;
}

/** Styling hook. `new` is deliberately positive; `none` is neutral, not bad. */
export function changeTone(c: Comparison): "good" | "low" | "neutral" {
  if (c.direction === "up" || c.direction === "new") return "good";
  if (c.direction === "down") return "low";
  return "neutral";
}

/* ------------------------------------------------------------------ *
 * Windows
 * ------------------------------------------------------------------ */

export type ComparisonKind = "day" | "week" | "month";

/** A half-open-safe inclusive date window, plus how to name it to a person. */
export type DateWindow = { from: string; to: string; label: string };

export type ComparisonWindows = { kind: ComparisonKind; current: DateWindow; previous: DateWindow };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "29 Aug" — no year, because both windows are always close together. */
const dayLabel = (value: string) => {
  const d = utc(value);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

/** "23–29 Aug", or "30 Jul–5 Aug" when the week straddles two months. */
const rangeLabel = (from: string, to: string) => {
  const a = utc(from),
    b = utc(to);
  if (a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear())
    return `${a.getUTCDate()}–${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`;
  return `${dayLabel(from)}–${dayLabel(to)}`;
};

/** The day the anchor's week began, under WEEK_STARTS_ON. */
export function weekStart(anchor: string) {
  const back = (utc(anchor).getUTCDay() - WEEK_STARTS_ON + 7) % 7;
  return shift(anchor, -back);
}

/** The anchor day against the day before it. */
export function dayWindows(anchor: string): ComparisonWindows {
  const previous = shift(anchor, -1);
  return {
    kind: "day",
    current: { from: anchor, to: anchor, label: dayLabel(anchor) },
    previous: { from: previous, to: previous, label: dayLabel(previous) },
  };
}

/**
 * The anchor's week against the one before.
 *
 * The current window stops at the ANCHOR, not at the week's end: a week in
 * progress has fewer days than a completed one, and pretending otherwise
 * would make every Monday look like a collapse. The previous window is the
 * matching number of days from the same point in the previous week, so the
 * two always cover the same span.
 */
export function weekWindows(anchor: string): ComparisonWindows {
  const start = weekStart(anchor);
  const daysIn = Math.round((utc(anchor).getTime() - utc(start).getTime()) / DAY) + 1;
  const prevStart = shift(start, -7);
  const prevEnd = shift(prevStart, daysIn - 1);
  return {
    kind: "week",
    current: { from: start, to: anchor, label: rangeLabel(start, anchor) },
    previous: { from: prevStart, to: prevEnd, label: rangeLabel(prevStart, prevEnd) },
  };
}

/**
 * The anchor's month against the one before, compared like for like.
 *
 * Month-to-date against the SAME number of days of the previous month — the
 * 1st to the 12th against the 1st to the 12th. Comparing twelve days against a
 * whole month would report a 60% collapse every month, which is the classic
 * version of this bug. Where the previous month is shorter (31 March against
 * February) the window is clamped to its last day.
 */
export function monthWindows(anchor: string): ComparisonWindows {
  const a = utc(anchor);
  const y = a.getUTCFullYear(),
    m = a.getUTCMonth(),
    day = a.getUTCDate();
  const start = ymd(new Date(Date.UTC(y, m, 1)));

  const prevMonthStart = new Date(Date.UTC(y, m - 1, 1));
  const prevMonthDays = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const prevEndDay = Math.min(day, prevMonthDays);
  const prevStart = ymd(prevMonthStart);
  const prevEnd = ymd(new Date(Date.UTC(prevMonthStart.getUTCFullYear(), prevMonthStart.getUTCMonth(), prevEndDay)));

  const monthName = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return {
    kind: "month",
    current: { from: start, to: anchor, label: `${monthName(a)} to ${dayLabel(anchor)}` },
    previous: { from: prevStart, to: prevEnd, label: `${monthName(prevMonthStart)} to ${dayLabel(prevEnd)}` },
  };
}

export function windowsFor(kind: ComparisonKind, anchor: string): ComparisonWindows {
  if (kind === "day") return dayWindows(anchor);
  if (kind === "week") return weekWindows(anchor);
  return monthWindows(anchor);
}

/** The three kinds, in the order the period switch shows them. */
export const COMPARISON_KINDS: readonly ComparisonKind[] = ["day", "week", "month"];

export const COMPARISON_KIND_LABEL: Record<ComparisonKind, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
};

/**
 * Read a comparison kind out of untrusted input — a query string, a route
 * parameter, a JSON body.
 *
 * Anything unrecognised becomes `day`, which is the safe answer: the daily
 * comparison is the cheapest of the three and the one the pages default to.
 * This exists so that the check lives in one place; it was written out inline
 * on three pages before v134, and an API route repeating it by hand is exactly
 * how a fourth spelling of the same rule appears.
 */
export function parseComparisonKind(value: unknown): ComparisonKind {
  return value === "week" || value === "month" ? value : "day";
}

/** Exclusive end, for the half-open `{ gte, lt }` ranges every query here uses. */
export const endExclusive = (window: DateWindow) => utc(shift(window.to, 1));
export const startOf = (window: DateWindow) => utc(window.from);

/**
 * What day a daily figure is actually from, and how to say so on screen.
 *
 * Prisma-free like `achievement.ts`, `pacing.ts`, `comparison.ts` and
 * `readiness.ts`: this file owns the wording and the arithmetic, the queries
 * live in `intelligence.ts`. Client components import it directly.
 *
 * ## The bug this exists to fix
 *
 * Four role homes showed a tile reading **"Latest GA"** with a bare number.
 * Two things were wrong with it at once, and neither produced an error.
 *
 * **It was not the latest day.** `latestDailySnapshot` asked for the newest
 * activation date *belonging to the person looking* — so an RSO who had sold
 * nothing for three weeks was shown the count from the last day they did sell,
 * labelled "Latest GA". It could not show a zero: there was no such row to find
 * the date from. The number was always somebody's good day.
 *
 * **It carried no date.** Even when the anchor was right, GA and C2C resolve
 * independently and the feeds do not always arrive together (`comparison.ts`
 * says so, and its comparison cards print both dates for exactly this reason).
 * Two tiles sitting side by side could be a week apart with nothing on screen
 * admitting it.
 *
 * ## The rule
 *
 * A daily figure is anchored on the newest day **the feed** has, not the newest
 * day this scope appears on, and that day is printed next to the number. Zero
 * then means zero — "you sold nothing on the 14th" — which is a true statement
 * the old tile was structurally unable to make.
 *
 * ## "Behind" is measured against yesterday, not today
 *
 * GA, C2C, C2S and OB are uploaded for the PREVIOUS day, so today never has
 * data and a screen that called that "behind" would cry wolf every morning
 * before the upload. `readiness-data.ts` uses `dhakaYesterdayYmd()` as its
 * cut-off for the same reason; the callers here pass the same value so the two
 * screens cannot disagree about whether a day is late.
 */

import { fmtMoney, fmtNumber } from "./format";

/** How a feed's newest day relates to the newest day data is due. */
export type FeedFreshness =
  | "current" // as new as it can be
  | "behind" // real data, but older than it should be
  | "none"; // the feed has never been imported

export type FeedDay = {
  /** The business day this figure covers, `YYYY-MM-DD`, or null when the feed is empty. */
  date: string | null;
  /** The figure for the scope on that day. Zero is an answer, not a gap. */
  value: number;
  freshness: FeedFreshness;
  /** Whole days between `date` and the last due day. 0 unless `behind`. */
  daysBehind: number;
};

/** Whole days from one `YYYY-MM-DD` to another. Negative when `to` is earlier. */
export function daysBetweenYmd(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86400000);
}

/**
 * Build the whole verdict from the day, the figure and the cut-off.
 *
 * A date *newer* than `lastDue` is "current", not "ahead of itself": a file can
 * legitimately be uploaded the same day it covers, and flagging that would be
 * noise.
 */
export function feedDay(date: string | null, value: number, lastDue: string): FeedDay {
  if (!date) return { date: null, value: 0, freshness: "none", daysBehind: 0 };
  const behind = daysBetweenYmd(date, lastDue);
  if (behind <= 0) return { date, value, freshness: "current", daysBehind: 0 };
  return { date, value, freshness: "behind", daysBehind: behind };
}

export type DailyFeedKey = "ga" | "c2c";
export type DailySnapshot = Record<DailyFeedKey, FeedDay>;

/** What each feed is called on screen. One spelling, used everywhere. */
const FEED_NAME: Record<DailyFeedKey, string> = { ga: "GA", c2c: "C2C" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * `2026-09-14` → `14 Sep`.
 *
 * Built from the string's own parts rather than through `Date` and
 * `Intl.DateTimeFormat`. A business day here is a date, not an instant — the
 * importer stores it as UTC midnight of the date printed in the file — so
 * handing it to a formatter with a time zone invites exactly the off-by-one
 * this project has already fixed twice. There is no clock in this function.
 */
export function shortDay(ymd: string): string {
  const [, month, day] = ymd.split("-");
  const index = Number(month) - 1;
  if (!MONTHS[index] || !day) return ymd;
  return `${Number(day)} ${MONTHS[index]}`;
}

/**
 * The tile label: the feed's name and the day it is from, never "Latest".
 *
 * "Latest" is the word that caused the problem — it asserts currency the figure
 * cannot back up. A date asserts only itself.
 */
export function feedDayLabel(feed: string, day: FeedDay): string {
  if (!day.date) return `${feed} · no data`;
  return `${feed} · ${shortDay(day.date)}`;
}

/** Amber once a feed is late, so a stale figure looks stale at a glance. */
export function feedDayTone(day: FeedDay): "brand" | "amber" | undefined {
  return day.freshness === "current" ? "brand" : "amber";
}

/**
 * One line naming every feed that is not current, or null when all of them are.
 *
 * Returned rather than rendered so the same sentence can be asserted in a test
 * and shown on four screens without four copies of the wording.
 */
export function stalenessNote(feeds: { label: string; day: FeedDay }[]): string | null {
  const parts: string[] = [];
  for (const f of feeds) {
    if (f.day.freshness === "behind")
      parts.push(`${f.label} is ${f.day.daysBehind} day${f.day.daysBehind === 1 ? "" : "s"} behind`);
    if (f.day.freshness === "none") parts.push(`${f.label} has never been imported`);
  }
  if (!parts.length) return null;
  return `${parts.join(", ")}. The daily figures above are from the dates shown beside them, not from today.`;
}

/**
 * The daily-feed tiles for a role home, ready for `SummaryStrip`.
 *
 * Built here rather than on each page so the four homes cannot drift into four
 * different ways of saying the same thing — which is exactly how "Latest GA"
 * ended up on three screens and nowhere to change it.
 */
export function dailyFeedItems(snapshot: DailySnapshot, feeds: DailyFeedKey[] = ["ga", "c2c"]) {
  return feeds.map((key) => ({
    label: feedDayLabel(FEED_NAME[key], snapshot[key]),
    value: key === "c2c" ? fmtMoney(snapshot[key].value) : fmtNumber(snapshot[key].value),
    tone: feedDayTone(snapshot[key]),
  }));
}

/** The warning line for those same tiles, or null when both feeds are current. */
export function dailyFeedNote(snapshot: DailySnapshot, feeds: DailyFeedKey[] = ["ga", "c2c"]) {
  return stalenessNote(feeds.map((key) => ({ label: FEED_NAME[key], day: snapshot[key] })));
}

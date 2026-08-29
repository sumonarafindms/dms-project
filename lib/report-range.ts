/**
 * Report date ranges.
 *
 * Every page in the Reporting Center is driven by a from/to pair, and the IT
 * role's stated workflow is "check yesterday first thing in the morning", so
 * yesterday is the default range rather than today — today's feeds usually
 * have not landed yet.
 *
 * The demo sums a per-day array to total a range. That is a stand-in for real
 * data; here every total comes from one aggregate query with
 * `date >= start AND date < endExclusive`, so a 90-day range costs the same
 * number of round trips as a one-day range.
 *
 * All bounds are UTC midnight, matching lib/month.ts and the importers.
 * `endExclusive` is the day AFTER `to`, so the last day is fully included —
 * a half-open range is the only shape that gets that right without
 * end-of-day arithmetic.
 */

import { dhakaTodayYmd, dhakaYesterdayYmd } from "./business-time";

export type ReportRange = { from: string; to: string };

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function parseYmdUtc(value: string): Date | null {
  if (!YMD.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(date.getTime()) ? null : date;
}

export const toYmd = (d: Date) => d.toISOString().slice(0, 10);
export const addDaysYmd = (value: string, days: number) =>
  toYmd(new Date(parseYmdUtc(value)!.getTime() + days * 86400000));

/** The default range: yesterday only. */
export function defaultRange(): ReportRange {
  const y = dhakaYesterdayYmd();
  return { from: y, to: y };
}

/**
 * Normalises whatever arrived in the query string into a usable range.
 * Anything unparseable falls back to the default rather than throwing — a bad
 * URL should show yesterday's report, not an error page.
 */
export function resolveRange(from?: string | null, to?: string | null): ReportRange {
  const fallback = defaultRange();
  const f = from && YMD.test(from) ? from : fallback.from;
  const t = to && YMD.test(to) ? to : fallback.to;
  // A reversed range is a user slip, not an error: swap it.
  return f <= t ? { from: f, to: t } : { from: t, to: f };
}

/** Half-open UTC bounds for Prisma: `{ gte: start, lt: endExclusive }`. */
export function rangeBounds(range: ReportRange) {
  const start = parseYmdUtc(range.from)!;
  const endExclusive = new Date(parseYmdUtc(range.to)!.getTime() + 86400000);
  return { start, endExclusive };
}

export function rangeDayCount(range: ReportRange) {
  return Math.round((parseYmdUtc(range.to)!.getTime() - parseYmdUtc(range.from)!.getTime()) / 86400000) + 1;
}

/** "2026-08-27" for a single day, "2026-08-01 to 2026-08-27" for a span. */
export function rangeLabel(range: ReportRange) {
  return range.from === range.to ? range.from : `${range.from} to ${range.to}`;
}

export function rangePresets(): { label: string; range: ReportRange }[] {
  const today = dhakaTodayYmd();
  const yesterday = dhakaYesterdayYmd();
  return [
    { label: "Yesterday", range: { from: yesterday, to: yesterday } },
    { label: "Today", range: { from: today, to: today } },
    { label: "Last 7 Days", range: { from: addDaysYmd(yesterday, -6), to: yesterday } },
    { label: "This Month", range: { from: `${today.slice(0, 7)}-01`, to: yesterday } },
  ];
}

/** Query string for links that must carry the current range. */
export function rangeQuery(range: ReportRange, extra: Record<string, string> = {}) {
  return new URLSearchParams({ from: range.from, to: range.to, ...extra }).toString();
}

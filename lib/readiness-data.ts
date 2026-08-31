import { prisma } from "./prisma";
import { rangeBounds } from "./report-range";
import type { ReportRange } from "./report-range";
import { dhakaYesterdayYmd } from "./business-time";
import { classifyDay, daysInRange, summariseFeed, READINESS_FEEDS } from "./readiness";
import type { DayReadiness, FeedKey, FeedReadinessRange } from "./readiness";

/**
 * The queries behind the Data Readiness Center.
 *
 * ## Cost
 *
 * Eight `groupBy` queries, and eight is the number whatever the range: one per
 * feed over `ImportBatch`, one per fact table over its own date column. Every
 * one of them groups on an indexed column — `ImportBatch` has
 * `@@index([type, businessDate, status])` and each fact table has an index on
 * its date — so the database returns one row per day, not one row per record.
 *
 * The tempting shape is a loop over the days in the range, which is 4 × 90
 * queries for a quarter. Nothing here loops over days at the database.
 *
 * ## The last due day
 *
 * GA, C2C, C2S and OB are uploaded for the PREVIOUS day. So today is never
 * expected to have data, and a grid that painted today red would be wrong every
 * morning. `dhakaYesterdayYmd()` is the cut-off, matching `defaultRange()`.
 */

const FACT_QUERY: Record<FeedKey, (start: Date, endExclusive: Date) => Promise<{ date: string; rows: number }[]>> = {
  GA: async (gte, lt) => {
    const groups = await prisma.gaActivation.groupBy({
      by: ["activationDate"],
      where: { activationDate: { gte, lt } },
      _count: { _all: true },
    });
    return groups.map((g) => ({ date: g.activationDate.toISOString().slice(0, 10), rows: g._count._all }));
  },
  C2C: async (gte, lt) => {
    const groups = await prisma.c2cRecord.groupBy({
      by: ["date"],
      where: { date: { gte, lt } },
      _count: { _all: true },
    });
    return groups.map((g) => ({ date: g.date.toISOString().slice(0, 10), rows: g._count._all }));
  },
  C2S: async (gte, lt) => {
    const groups = await prisma.c2sRecord.groupBy({
      by: ["date"],
      where: { date: { gte, lt } },
      _count: { _all: true },
    });
    return groups.map((g) => ({ date: g.date.toISOString().slice(0, 10), rows: g._count._all }));
  },
  OB: async (gte, lt) => {
    const groups = await prisma.obRecord.groupBy({
      by: ["date"],
      where: { date: { gte, lt } },
      _count: { _all: true },
    });
    return groups.map((g) => ({ date: g.date.toISOString().slice(0, 10), rows: g._count._all }));
  },
};

/** Business dates that have a batch, split by whether the import failed. */
async function batchDays(feed: FeedKey, gte: Date, lt: Date) {
  const groups = await prisma.importBatch.groupBy({
    by: ["businessDate", "status"],
    where: { type: feed, businessDate: { gte, lt } },
  });
  const present = new Set<string>();
  const failed = new Set<string>();
  for (const g of groups) {
    if (!g.businessDate) continue;
    const day = g.businessDate.toISOString().slice(0, 10);
    // A day is "failed" only if NOTHING succeeded for it — a failed attempt
    // followed by a good re-upload is a fixed day, not a broken one.
    if (g.status === "FAILED") failed.add(day);
    else present.add(day);
  }
  for (const day of present) failed.delete(day);
  return { present, failed };
}

export type ReadinessReport = {
  range: ReportRange;
  lastDue: string;
  feeds: FeedReadinessRange[];
};

export async function readinessReport(range: ReportRange, now = new Date()): Promise<ReadinessReport> {
  const { start, endExclusive } = rangeBounds(range);
  const lastDue = dhakaYesterdayYmd(now);
  const dates = daysInRange(range.from, range.to);

  const [batches, facts] = await Promise.all([
    Promise.all(READINESS_FEEDS.map((feed) => batchDays(feed, start, endExclusive))),
    Promise.all(READINESS_FEEDS.map((feed) => FACT_QUERY[feed](start, endExclusive))),
  ]);

  const feeds = READINESS_FEEDS.map((feed, i) => {
    const rowsByDay = new Map(facts[i].map((f) => [f.date, f.rows]));
    const { present, failed } = batches[i];
    const days: DayReadiness[] = dates.map((date) => {
      const rows = rowsByDay.get(date) ?? 0;
      const batch = present.has(date);
      return { date, rows, batch, state: classifyDay(date, { rows, batch, failed: failed.has(date) }, lastDue) };
    });
    return summariseFeed(feed, days);
  });

  return { range, lastDue, feeds };
}

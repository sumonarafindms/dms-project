/**
 * Paging for Reporting Center tables.
 *
 * The retailer directory has paged at sixty since v137 (`lib/retailer-list.ts`);
 * the Reporting Center never adopted it and rendered every row of every report.
 * Measured with only 260 retailers seeded, `/it/reports/performance/retailer`
 * answered with 1,018,255 bytes. The reports and the directory read the same
 * retailers out of the same database, so there is no reason for one of them to
 * page and the other not to.
 *
 * This is deliberately not `retailerListPage()`. That function also searches
 * and sorts, and it is typed to `RetailerOpportunity`; reports arrive already
 * ordered by their own rules and carry a dozen different row types. All that is
 * shared is the arithmetic, so that is all this file holds.
 */

/**
 * Sixty, the same as the retailer directory.
 *
 * More than fills a screen at every width the audit covers, and keeps a report
 * page to tens of kilobytes rather than one megabyte.
 */
export const REPORT_PAGE_SIZE = 60;

export type PagedRows<T> = {
  rows: T[];
  page: number;
  pageCount: number;
  /** Rows in the whole report, never the number on this page. */
  total: number;
  pageSize: number;
};

/**
 * Read a page number out of untrusted input.
 *
 * Anything unparseable is page 1 — a hand-typed `?page=abc` should show the
 * first page, not an error — and a page past the end is clamped rather than
 * rendered empty, because a blank table reads as "this report has no rows".
 */
export function parseReportPage(value: unknown): number {
  const n = Number(typeof value === "string" || typeof value === "number" ? value : NaN);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export function pageOf<T>(all: T[], page: unknown, pageSize = REPORT_PAGE_SIZE): PagedRows<T> {
  const size = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(all.length / size));
  const current = Math.min(parseReportPage(page), pageCount);
  const from = (current - 1) * size;
  return { rows: all.slice(from, from + size), page: current, pageCount, total: all.length, pageSize: size };
}

/**
 * "1–60 of 2,431 retailers" — always the true total.
 *
 * The total is what makes paging honest: a reader can see that the sixty rows
 * in front of them are sixty of two thousand, and the Export button beside it
 * gives all of them.
 */
export function reportPageLabel<T>(p: PagedRows<T>, noun = "row") {
  if (!p.total) return `No ${noun}s`;
  const first = (p.page - 1) * p.pageSize + 1;
  const last = Math.min(p.page * p.pageSize, p.total);
  return `${first.toLocaleString("en-US")}–${last.toLocaleString("en-US")} of ${p.total.toLocaleString("en-US")} ${noun}${
    p.total === 1 ? "" : "s"
  }`;
}

/**
 * The href for one page of a report, preserving everything else in the URL.
 *
 * The page number lives in the URL for the same reason the date range does: a
 * report someone is looking at should be a link they can send. `page=1` is
 * omitted so the first page has the same URL it had before paging existed.
 */
export function reportPageHref(basePath: string, params: Record<string, string | undefined>, page: number): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  if (page > 1) q.set("page", String(page));
  return `${basePath}?${q.toString()}`;
}

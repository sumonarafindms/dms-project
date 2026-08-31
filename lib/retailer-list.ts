import type { RetailerOpportunity } from "./retailer-opportunities";
import { matchesRetailerQuery } from "./retailer-search";
import { applySort, byNumberAsc, byNumberDesc, byText, sortOptions, type SortSpec } from "./sort";

/**
 * Searching, ordering and paging a retailer list — on the server.
 *
 * ## Why this moved off the client
 *
 * The distributor has about 2,500 active retailers, and the roster changes only
 * when one is added, removed or edited — so the list is close to static while
 * the activity against it changes daily. Every retailer page fetched all 2,500
 * rows, serialised them into the page payload, sent them to the browser, and
 * then rendered **at most 300**:
 *
 *   - roughly half a megabyte on the wire to draw a twelfth of it, on every
 *     load, for every one of the seven pages that use this list;
 *   - and everything past the 300th row was simply unreachable. The sub-line
 *     said "showing the first 300", which is the same silent truncation as the
 *     row caps found in the v132 audit: correct-looking output that is not the
 *     whole answer.
 *
 * Filtering and ordering now happen where the rows already are, and the page
 * ships one page of them. Nothing is unreachable, because there are pages.
 *
 * ## What did NOT move
 *
 * The aggregate queries. `retailerOpportunities()` still computes GA, C2C, C2S
 * and OB for the whole scope in six grouped queries, and it must: the summary
 * above the list counts flagged retailers across the entire set, and a count
 * derived from one page would be a different, wrong number. The cost being cut
 * here is the payload and the browser's work, not the database's.
 *
 * ## Prisma-free
 *
 * Deliberately, like `achievement.ts`, `pacing.ts` and `bp-rollup.ts` — the
 * client component needs `SORT_OPTIONS` for its dropdown, and importing a value
 * from a Prisma-touching module into client code is how ~50KB of Prisma's
 * browser stub ended up in the bundle in v134.
 */

const name = (r: RetailerOpportunity) => r.retailerName || r.retailerCode;

/**
 * Orders for a retailer list. The attention view leads with priority; the plain
 * directory leads with the highest sellers.
 *
 * These live here rather than in the view because the SERVER now sorts. A
 * comparator cannot cross the Server-to-Client boundary, so the client receives
 * only `SORT_OPTIONS` — the `{ value, label }` pairs its dropdown needs.
 */
const COMMON: SortSpec<RetailerOpportunity>[] = [
  { value: "ga-desc", label: "GA — high to low", compare: byNumberDesc((r) => r.ga, name) },
  { value: "ga-asc", label: "GA — low to high", compare: byNumberAsc((r) => r.ga, name) },
  { value: "c2s-desc", label: "C2S sales — high to low", compare: byNumberDesc((r) => r.c2s, name) },
  { value: "c2s-asc", label: "C2S sales — low to high", compare: byNumberAsc((r) => r.c2s, name) },
  { value: "trx-desc", label: "C2S transactions — most first", compare: byNumberDesc((r) => r.c2sTransactions, name) },
  { value: "name-asc", label: "Retailer name — A to Z", compare: (a, b) => byText(name(a), name(b)) },
  { value: "code-asc", label: "Retailer code — A to Z", compare: (a, b) => byText(a.retailerCode, b.retailerCode) },
  {
    value: "rso-asc",
    label: "RSO — A to Z",
    compare: (a, b) => byText(a.employeeName, b.employeeName) || byText(name(a), name(b)),
  },
  {
    value: "route-asc",
    label: "Route — A to Z",
    compare: (a, b) => byText(a.route || "", b.route || "") || byText(name(a), name(b)),
  },
];

const PRIORITY: SortSpec<RetailerOpportunity> = {
  value: "priority-desc",
  label: "Priority — highest first",
  compare: byNumberDesc((r) => r.priority, name),
};

export const DIRECTORY_SORTS = COMMON;
export const ATTENTION_SORTS: SortSpec<RetailerOpportunity>[] = [PRIORITY, ...COMMON];

export const sortsFor = (attentionOnly: boolean) => (attentionOnly ? ATTENTION_SORTS : DIRECTORY_SORTS);

/** `{ value, label }` only — this is what may cross to a client component. */
export const sortOptionsFor = (attentionOnly: boolean) => sortOptions(sortsFor(attentionOnly));

export const defaultSortFor = (attentionOnly: boolean) => sortsFor(attentionOnly)[0].value;

/**
 * Cards per page.
 *
 * Sixty rather than the old 300-card cap. Each card carries four figures, a
 * status pair and up to two reason chips, so 300 of them is a long layout pass
 * on a phone for rows nobody scrolled to. Sixty fills more than a screen at
 * every width the audit covers and keeps the payload to a few tens of
 * kilobytes.
 */
export const PAGE_SIZE = 60;

export type RetailerListPage = {
  rows: RetailerOpportunity[];
  /** Rows matching the search, across every page. */
  total: number;
  /** Rows in scope before the search — what the summary above the list counts. */
  scopeTotal: number;
  page: number;
  pageCount: number;
  pageSize: number;
  sort: string;
  q: string;
};

/**
 * Read a page number out of untrusted input.
 *
 * Anything unparseable is page 1. A hand-typed `?page=abc` should show the
 * first page, not an error, and a page beyond the end is clamped rather than
 * rendered empty — an empty list with no explanation reads as "no retailers".
 */
export function parsePage(value: unknown): number {
  const n = Number(typeof value === "string" || typeof value === "number" ? value : NaN);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export function retailerListPage(
  all: RetailerOpportunity[],
  {
    q = "",
    sort,
    page,
    attentionOnly = false,
    pageSize = PAGE_SIZE,
  }: { q?: string; sort?: string; page?: unknown; attentionOnly?: boolean; pageSize?: number },
): RetailerListPage {
  const sorts = sortsFor(attentionOnly);
  const scope = attentionOnly ? all.filter((r) => r.reasons.length > 0) : all;
  // Lowercased here, because that is matchesRetailerQuery's contract — it
  // lowercases the haystack and not the needle, so an uppercase query used to
  // match nothing. The client normalised it before calling; now the server
  // does, and there is one place that knows.
  const query = q.trim().toLowerCase();
  const matched = query ? scope.filter((r) => matchesRetailerQuery(r, query)) : scope;
  const ordered = applySort(matched, sorts, sort);

  const pageCount = Math.max(1, Math.ceil(ordered.length / pageSize));
  // Clamped, not rejected: narrowing the search while on page 7 must land on
  // the last page of the new result, never on a blank one.
  const current = Math.min(parsePage(page), pageCount);
  const from = (current - 1) * pageSize;

  return {
    rows: ordered.slice(from, from + pageSize),
    total: ordered.length,
    scopeTotal: scope.length,
    page: current,
    pageCount,
    pageSize,
    sort: sorts.some((s) => s.value === sort) ? sort! : sorts[0].value,
    q: query,
  };
}

/** "1–60 of 2,431 retailers" — always the true total, never a capped one. */
export function pageLabel(p: RetailerListPage, noun = "retailer") {
  if (!p.total) return `No ${noun}s`;
  const first = (p.page - 1) * p.pageSize + 1;
  const last = Math.min(p.page * p.pageSize, p.total);
  return `${first.toLocaleString()}–${last.toLocaleString()} of ${p.total.toLocaleString()} ${noun}${
    p.total === 1 ? "" : "s"
  }`;
}

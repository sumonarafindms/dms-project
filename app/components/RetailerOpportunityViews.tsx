"use client";

/**
 * Shared retailer search and attention views.
 *
 * One component behind nine pages: the retailer list and the attention
 * worklist for admin, RSO, supervisor, manager and accounts. `attentionOnly`
 * is the only difference between the two — it drops retailers with no open
 * reason and shows the priority.
 *
 * Scope is decided by the caller (which employeeIds it passed to
 * retailerOpportunities), never here. This component only ever sees rows the
 * server already decided the signed-in user may see, so filtering them in the
 * browser cannot widen anyone's access.
 *
 * A client component on purpose: search and sort are filtering over rows that
 * are already here, so they run locally and instantly. Only the date range
 * navigates, because only the date range changes which rows exist.
 */

import { useMemo } from "react";
import Link from "next/link";
import { ListControls, useListControls } from "./ListControls";
import { Icon } from "./icons";
import { Badge, Card, EmptyState, Row, SectionHead } from "./Kit";
import type { RetailerOpportunity } from "../../lib/retailer-opportunities";
import { matchesRetailerQuery } from "../../lib/retailer-search";
import { activeSort, applySort, byNumberAsc, byNumberDesc, byText, sortOptions, type SortSpec } from "../../lib/sort";

const fmt = (n: number) => new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(n);

const name = (r: RetailerOpportunity) => r.retailerName || r.retailerCode;

/**
 * Cards rendered at once. The retailer base runs to a few thousand rows, and
 * every card carries a ring, four figures and up to two reason chips — past
 * this many the browser spends longer laying the page out than the server does
 * producing it. The count above the list always reports the true total, and
 * the search narrows the set rather than paging through it.
 */
const MAX_CARDS = 300;

/**
 * Orders for a retailer list. The attention view leads with priority; the
 * plain directory leads with the highest sellers, which is what the first
 * entry of each list below encodes.
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

const DIRECTORY_SORTS = COMMON;
const ATTENTION_SORTS: SortSpec<RetailerOpportunity>[] = [PRIORITY, ...COMMON];

export function RetailerSearchView({
  rows,
  month,
  base,
  from,
  to,
  attentionOnly = false,
}: {
  rows: RetailerOpportunity[];
  month: string;
  base: string;
  from?: string;
  to?: string;
  attentionOnly?: boolean;
}) {
  const SORTS = attentionOnly ? ATTENTION_SORTS : DIRECTORY_SORTS;
  const { query, setQuery, deferredQuery, sort, setSort } = useListControls(SORTS[0].value);

  const ordered = useMemo(() => {
    const filtered = rows.filter((r) => {
      if (attentionOnly && !r.reasons.length) return false;
      return matchesRetailerQuery(r, deferredQuery);
    });
    return applySort(filtered, SORTS, sort);
  }, [rows, attentionOnly, deferredQuery, sort, SORTS]);

  const shown = ordered.slice(0, MAX_CARDS);
  const range = `month=${month}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`;

  return (
    <>
      <ListControls
        query={query}
        onQuery={setQuery}
        placeholder="Retailer code, name, RSO, supervisor or route"
        sort={sortOptions(SORTS)}
        sortValue={sort}
        onSort={setSort}
        month={month}
        from={from}
        to={to}
        resultCount={ordered.length}
        resultNoun="retailer"
      />
      <SectionHead
        title={attentionOnly ? "Needs attention" : "Retailers"}
        sub={`${ordered.length} ${ordered.length === 1 ? "result" : "results"}${
          ordered.length > shown.length ? ` · showing the first ${shown.length}` : ""
        } · sorted by ${activeSort(SORTS, sort).label}`}
      />
      {shown.length ? (
        <div className="kit-card-grid">
          {shown.map((r) => (
            <Link key={r.id} href={`${base}/${r.id}?${range}`} className="kit-card kit-card-p is-clickable kit-outlet">
              <div className="kit-entity-top">
                <span className="kit-avatar" aria-hidden="true">
                  {(r.retailerName || r.retailerCode).slice(0, 2).toUpperCase()}
                </span>
                <div className="kit-entity-main">
                  <p className="kit-eyebrow">{r.retailerCode}</p>
                  <strong>{r.retailerName || r.retailerCode}</strong>
                  <span>
                    {r.employeeName} · {r.supervisor}
                  </span>
                </div>
                {attentionOnly ? <Badge tone={r.priority >= 3 ? "failed" : "pending"}>P{r.priority}</Badge> : null}
              </div>

              <p className="kit-outlet-route">
                {r.route || "No route"}
                {r.category ? ` · ${r.category}` : ""}
              </p>

              <div className="kit-outlet-metrics">
                <div>
                  <span>GA</span>
                  <strong>{r.ga}</strong>
                </div>
                <div>
                  <span>C2S</span>
                  <strong>৳{fmt(r.c2s)}</strong>
                </div>
                <div>
                  <span>SSO</span>
                  {/* SSO only applies to a SIM seller; "Pending" on a retailer
                      that can never complete it would read as a failure. */}
                  <strong className={!r.simSeller ? "is-muted" : r.ssoComplete ? "is-ok" : "is-warn"}>
                    {!r.simSeller ? "N/A" : r.ssoComplete ? "Done" : "Pending"}
                  </strong>
                </div>
                <div>
                  <span>LSO</span>
                  <strong className={r.lsoComplete ? "is-ok" : "is-warn"}>{r.lsoComplete ? "Done" : "Pending"}</strong>
                </div>
              </div>

              {r.reasons.length > 0 && (
                <div className="kit-outlet-reasons">
                  {r.reasons.slice(0, 2).map((x) => (
                    <span key={x}>{x}</span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            positive={attentionOnly && !deferredQuery}
            title={
              attentionOnly && !deferredQuery
                ? "Nothing needs attention"
                : deferredQuery
                  ? `No retailer matches “${query.trim()}”`
                  : "No retailers in this period"
            }
            hint={
              deferredQuery
                ? "Clear the search to see the whole list again."
                : attentionOnly
                  ? "Every retailer in scope has completed SSO and LSO for this period."
                  : "Try another date range."
            }
            icon={<Icon name={attentionOnly && !deferredQuery ? "check" : "search"} />}
          />
        </Card>
      )}
    </>
  );
}

/**
 * The four attention counts. Each one is a distinct gap, not a severity band:
 * a retailer can appear in more than one, so these never sum to the row count.
 */
export function AttentionSummary({ rows }: { rows: RetailerOpportunity[] }) {
  const sso = rows.filter((r) => r.simSeller && !r.ssoComplete).length,
    lso = rows.filter((r) => !r.lsoComplete).length,
    noC2s = rows.filter((r) => r.c2s === 0).length,
    unassigned = rows.filter((r) => !r.employeeId).length;
  const items = [
    { label: "SSO Pending", value: sso, sub: "SIM seller gap", icon: "sim" },
    { label: "LSO Pending", value: lso, sub: "Retail sales gap", icon: "chart" },
    { label: "No C2S", value: noC2s, sub: "Zero sales outlets", icon: "wallet" },
    { label: "Unassigned", value: unassigned, sub: "Ownership missing", icon: "users" },
  ];
  return (
    <div className="kit-card-grid is-quad kit-mb-20">
      {items.map((x) => (
        <Card padded key={x.label}>
          <Row icon={<Icon name={x.icon} />} title={x.label} sub={x.sub} value={x.value.toLocaleString()} />
        </Card>
      ))}
    </div>
  );
}

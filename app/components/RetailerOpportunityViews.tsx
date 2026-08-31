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
 * ## Why the search is now a soft navigation
 *
 * It used to filter rows already in the browser, which is the right answer when
 * the rows are there. They no longer are: with ~2,500 retailers, shipping every
 * row to render at most 300 of them cost roughly half a megabyte per page load
 * and left everything past the 300th unreachable. The server now filters,
 * orders and pages (lib/retailer-list.ts) and sends one page.
 *
 * So search moves to `ServerSearchBar` — the pattern this codebase already uses
 * wherever the server has to narrow the set. It is still instant: a debounced
 * `router.replace` inside a transition re-renders the server tree in place, the
 * input never unmounts, and focus and caret survive. It is NOT the form submit
 * that caused the reload reported in v131; a test forbids that shape.
 *
 * The date range still navigates for its own reason: it selects a different
 * dataset entirely.
 */

import Link from "next/link";
import { DateRangeForm } from "./ListControls";
import { ServerSearchBar, ServerSelect } from "./ServerSearchBar";
import { Icon } from "./icons";
import { Badge, Card, EmptyState, Pager, Row, SectionHead } from "./Kit";
import type { RetailerOpportunity } from "../../lib/retailer-opportunities";
import type { RetailerListPage } from "../../lib/retailer-list";
import { pageLabel } from "../../lib/retailer-list";

const fmt = (n: number) => new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(n);

/*
 * The sort orders and the 300-card cap that used to live here moved to
 * lib/retailer-list.ts in v137. The server sorts now, and a comparator cannot
 * cross the Server-to-Client boundary — this component receives only the
 * `{ value, label }` options its dropdown needs.
 */

export function RetailerSearchView({
  page,
  sortOptions,
  month,
  base,
  from,
  to,
  attentionOnly = false,
}: {
  /** One page of rows, already filtered, ordered and counted by the server. */
  page: RetailerListPage;
  sortOptions: { value: string; label: string }[];
  month: string;
  base: string;
  from?: string;
  to?: string;
  attentionOnly?: boolean;
}) {
  const range = `month=${month}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`;
  const sortLabel = sortOptions.find((o) => o.value === page.sort)?.label ?? sortOptions[0]?.label;

  /**
   * Links for the pager, preserving everything else in the URL.
   *
   * Built from the values the server already resolved rather than from
   * `useSearchParams`, so page 2 of a search cannot lose the search — the two
   * would disagree for one render after a soft navigation.
   */
  const pageHref = (n: number) => {
    const params = new URLSearchParams({ month });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (page.q) params.set("q", page.q);
    if (page.sort) params.set("sort", page.sort);
    if (n > 1) params.set("page", String(n));
    return `?${params.toString()}`;
  };

  return (
    <>
      <ServerSearchBar
        placeholder="Retailer code, name, RSO, supervisor or route"
        resultCount={page.total}
        resultNoun="retailer"
      >
        <ServerSelect paramName="sort" label="Sort" options={sortOptions} allLabel={null} />
      </ServerSearchBar>
      <DateRangeForm month={month} from={from} to={to} />
      <SectionHead
        title={attentionOnly ? "Needs attention" : "Retailers"}
        sub={`${pageLabel(page)}${sortLabel ? ` · sorted by ${sortLabel}` : ""}`}
      />
      {page.rows.length ? (
        <div className="kit-card-grid">
          {page.rows.map((r) => (
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
            positive={attentionOnly && !page.q}
            title={
              attentionOnly && !page.q
                ? "Nothing needs attention"
                : page.q
                  ? `No retailer matches “${page.q}”`
                  : "No retailers in this period"
            }
            hint={
              page.q
                ? "Clear the search to see the whole list again."
                : attentionOnly
                  ? "Every retailer in scope has completed SSO and LSO for this period."
                  : "Try another date range."
            }
            icon={<Icon name={attentionOnly && !page.q ? "check" : "search"} />}
          />
        </Card>
      )}
      <Pager page={page.page} pageCount={page.pageCount} label={pageLabel(page)} hrefFor={pageHref} />
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

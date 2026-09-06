/**
 * The attention centre, shared by the manager, supervisor and RSO.
 *
 * Priority and reasons come from lib/retailer-opportunities unchanged; nothing
 * is computed here.
 *
 * ## Why the whole page moved in here
 *
 * The three routes were the same page three times: identical summary strip,
 * identical date form, identical list, differing only in a title, a base link
 * and which employees were in scope. So all three carried the same fault —
 * every flagged retailer rendered at once, with nothing to search or order by.
 *
 * That is the shape `/retailers` had before v137, and it matters more here: an
 * attention list is read on a phone, in the field, by the person who has to
 * decide where to go next. Two hundred rows is not a worklist.
 *
 * Paging, search and ordering come from `lib/retailer-list.ts` — the same
 * module `/admin/attention` and every retailer list already use, so the app has
 * one definition of "page 2" and one set of sort orders rather than a second
 * implementation that drifts from the first.
 *
 * The ROW presentation is deliberately unchanged: these are the role demos'
 * rows, not the admin card grid.
 */

import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, Pager, Row, SectionHead, SummaryStrip } from "./Kit";
import { DateRangeForm } from "./ListControls";
import { ServerSearchBar, ServerSelect } from "./ServerSearchBar";
import { Icon } from "./icons";
import { pageLabel, retailerListPage, sortOptionsFor } from "../../lib/retailer-list";
import type { RetailerOpportunity } from "../../lib/retailer-opportunities";

/** P3 and above is what the attention pages count as high priority. */
function priorityTone(priority: number) {
  return priority >= 3 ? "behind" : priority === 2 ? "near" : "neutral";
}

export function RoleAttentionList({
  rows,
  base,
  query = "",
}: {
  rows: RetailerOpportunity[];
  base: string;
  query?: string;
}) {
  /*
   * No `limit` prop. It existed for a "top N" preview that no page ever
   * rendered, and once /rso, /supervisor and /manager moved to paged lists
   * (v144) nothing could want one — the caller passes the page it means to
   * show. A capping option nobody passes is a way to hide rows by accident.
   */
  if (!rows.length)
    return (
      <EmptyState
        positive
        title="No attention items"
        hint="Current retailer execution rules are complete for this scope."
        icon={<Icon name="check" />}
      />
    );

  return (
    <div className="kit-rows">
      {rows.map((r) => (
        <Row
          key={r.id}
          href={`${base}/${r.id}${query}`}
          avatar={r.retailerName || r.retailerCode}
          title={r.retailerName || r.retailerCode}
          sub={`${r.retailerCode} · ${r.employeeName} · ${r.route}`}
          // Only the first two reasons, as before — a retailer can trip four
          // rules at once and the row would then be taller than it is wide.
          detail={r.reasons.slice(0, 2).join(" · ")}
          value={r.ga}
          valueSub={`GA · ${r.c2sTransactions} trx`}
          after={
            <div className="kit-row-actions">
              <Badge tone={priorityTone(r.priority)}>P{r.priority}</Badge>
            </div>
          }
        />
      ))}
    </div>
  );
}

/**
 * One attention centre. The role supplies its wording, its scope and where a
 * row links to; everything else is the same for all three.
 */
export function RoleAttentionView({
  all,
  base,
  month,
  from,
  to,
  q,
  sort,
  page,
  title,
  subtitle,
  sectionSub,
}: {
  /** Every retailer in this role's scope — flagged and clear. */
  all: RetailerOpportunity[];
  /** Where a row links: the role's own retailer detail route. */
  base: string;
  month: string;
  from?: string;
  to?: string;
  q?: string;
  sort?: string;
  page?: string;
  title: string;
  subtitle: string;
  sectionSub: string;
}) {
  /*
   * The summary counts the whole scope; the list shows one page of it.
   *
   * Those are different questions and they must not be answered from the same
   * array. "Flagged: 214" above a list of 60 is correct and useful; a summary
   * computed from the page would say 60 and be a lie that looks like a fact.
   * `retailerListPage` keeps the true totals for exactly this reason.
   */
  const high = all.filter((x) => x.priority >= 3 && x.reasons.length).length,
    sso = all.filter((x) => x.simSeller && !x.ssoComplete).length,
    lso = all.filter((x) => !x.lsoComplete).length;

  // attentionOnly: the flagged rows, ordered by priority unless the reader asks
  // otherwise. The old fixed order (priority, then lowest C2S) becomes the
  // dropdown's default rather than the only possibility.
  const list = retailerListPage(all, { q, sort, page, attentionOnly: true });
  const query = `month=${month}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`;

  // Built from what the server resolved rather than from useSearchParams: page
  // 2 of a search must not lose the search.
  const pageHref = (n: number) => {
    const params = new URLSearchParams({ month });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (list.q) params.set("q", list.q);
    if (list.sort) params.set("sort", list.sort);
    if (n > 1) params.set("page", String(n));
    return `?${params.toString()}`;
  };

  return (
    <main className="page">
      <PageHeader title={title} subtitle={subtitle} />
      <SummaryStrip
        items={[
          { label: "High Priority", value: high.toLocaleString(), tone: "amber" },
          { label: "SSO Pending", value: sso.toLocaleString() },
          { label: "LSO Pending", value: lso.toLocaleString() },
          { label: "Flagged", value: list.scopeTotal.toLocaleString() },
        ]}
      />

      <ServerSearchBar
        placeholder="Retailer code, name, RSO, supervisor or route"
        resultCount={list.total}
        resultNoun="retailer"
      >
        <ServerSelect paramName="sort" label="Sort" options={sortOptionsFor(true)} allLabel={null} />
      </ServerSearchBar>
      <DateRangeForm month={month} from={from} to={to} />

      <SectionHead title="Retailers needing action" sub={sectionSub} />
      <Card padded>
        <RoleAttentionList rows={list.rows} base={base} query={`?${query}`} />
      </Card>
      <Pager page={list.page} pageCount={list.pageCount} label={pageLabel(list)} hrefFor={pageHref} />

      {list.q && list.total === 0 ? (
        <p className="kit-hint is-xs kit-mt-8">
          Nothing matches “{list.q}” among the flagged retailers. <Link href={`?${query}`}>Clear the search</Link> to
          see them all.
        </p>
      ) : null}
    </main>
  );
}

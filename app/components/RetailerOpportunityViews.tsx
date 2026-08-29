/**
 * Shared retailer search and attention views — migrated to the role-UI kit.
 *
 * One component behind twelve pages: the retailer list and the attention
 * worklist for admin, RSO, supervisor, manager and accounts. `attentionOnly`
 * is the only difference between the two — it drops retailers with no open
 * reason and shows the priority.
 *
 * Scope is decided by the caller (which employeeIds it passed to
 * retailerOpportunities), never here.
 */

import Link from "next/link";
import { FilterForm } from "./DrillUI";
import { Icon } from "./icons";
import { Badge, Card, EmptyState, Row, SectionHead } from "./Kit";
import type { RetailerOpportunity } from "../../lib/retailer-opportunities";

const fmt = (n: number) => new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(n);

export function RetailerSearchView({
  rows,
  month,
  q,
  base,
  from,
  to,
  attentionOnly = false,
}: {
  rows: RetailerOpportunity[];
  month: string;
  q: string;
  base: string;
  from?: string;
  to?: string;
  attentionOnly?: boolean;
}) {
  const needle = q.toLowerCase();
  const filtered = rows.filter((r) => {
    if (attentionOnly && !r.reasons.length) return false;
    if (!q) return true;
    return `${r.retailerCode} ${r.retailerName} ${r.employeeName} ${r.supervisor} ${r.route} ${r.category}`
      .toLowerCase()
      .includes(needle);
  });
  const range = `month=${month}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`;

  return (
    <>
      <FilterForm
        q={q}
        month={month}
        from={from}
        to={to}
        dateRange
        placeholder="Retailer code, name, RSO, supervisor or route"
      />
      <SectionHead
        title={attentionOnly ? "Needs attention" : "Retailers"}
        sub={`${filtered.length} ${filtered.length === 1 ? "result" : "results"}`}
      />
      {filtered.length ? (
        <div className="kit-card-grid">
          {filtered.map((r) => (
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
            positive={attentionOnly}
            title={attentionOnly ? "Nothing needs attention" : "No retailers match these filters"}
            hint={
              attentionOnly
                ? "Every retailer in scope has completed SSO and LSO for this period."
                : "Try another search term or date range."
            }
            icon={<Icon name={attentionOnly ? "check" : "search"} />}
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
    <div className="kit-card-grid is-quad" style={{ marginBottom: "1.25rem" }}>
      {items.map((x) => (
        <Card padded key={x.label}>
          <Row icon={<Icon name={x.icon} />} title={x.label} sub={x.sub} value={x.value.toLocaleString()} />
        </Card>
      ))}
    </div>
  );
}

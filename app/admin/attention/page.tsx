/**
 * Attention Center — migrated to the role-UI kit.
 *
 * Retailers with unfinished SSO/LSO execution, highest priority first and
 * lowest C2S as the tiebreak, so the largest gaps surface before the
 * marginal ones.
 */

import { requireUser } from "../../../lib/auth";
import { normalizeMonth } from "../../../lib/drilldown";
import { retailerOpportunities } from "../../../lib/retailer-opportunities";
import { retailerListPage, sortOptionsFor } from "../../../lib/retailer-list";
import { AttentionSummary, RetailerSearchView } from "../../components/RetailerOpportunityViews";
import { PageHeader, SummaryStrip } from "../../components/Kit";
import { Icon } from "../../components/icons";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; month?: string; from?: string; to?: string; sort?: string; page?: string }>;
}) {
  await requireUser(["ADMIN", "IT"]);
  const s = await searchParams,
    month = normalizeMonth(s.from?.slice(0, 7) || s.month),
    all = await retailerOpportunities(month, undefined, s.from, s.to);
  // The priority ordering moved into retailerListPage's sort specs, where it
  // is one of the choices in the dropdown rather than a fixed pre-sort the
  // user could not change.
  const flagged = all.filter((x) => x.reasons.length).length,
    high = all.filter((x) => x.priority >= 3 && x.reasons.length).length;

  const listPage = retailerListPage(all, {
    q: s.q,
    sort: s.sort,
    page: s.page,
    attentionOnly: true,
  });

  return (
    <main className="page">
      <PageHeader
        title="Attention Center"
        subtitle="Retailers with unfinished SSO/LSO execution, highest-impact gaps first."
      />

      <SummaryStrip
        items={[
          { label: "Retailers in scope", value: all.length.toLocaleString() },
          { label: "Needs action", value: flagged.toLocaleString(), tone: "amber" },
          { label: "High priority", value: high.toLocaleString() },
          { label: "Clear", value: (all.length - flagged).toLocaleString(), tone: "teal" },
        ]}
      />

      <div className="kit-note is-warn" role="note">
        <Icon name="info" />
        <span>
          SSO and LSO completion is calculated month by month, even when the selected range spans more than one month.
        </span>
      </div>

      <AttentionSummary rows={all} />

      <RetailerSearchView
        page={listPage}
        sortOptions={sortOptionsFor(true)}
        month={month}
        from={s.from}
        to={s.to}
        base="/admin/retailers"
        attentionOnly
      />
    </main>
  );
}

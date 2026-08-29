/**
 * Retailer Opportunity (accounts) — migrated to the role-UI kit.
 *
 * The accounts view of the same worklist admin sees: outlets where SSO or LSO
 * is still open, highest priority first. Read-only — it creates no records,
 * and every figure is derived from the live transaction data.
 */

import { requirePagePermission } from "../../../lib/auth";
import { normalizeMonth } from "../../../lib/drilldown";
import { retailerOpportunities } from "../../../lib/retailer-opportunities";
import { AttentionSummary, RetailerSearchView } from "../../components/RetailerOpportunityViews";
import { PageHeader, SummaryStrip } from "../../components/Kit";
import { Icon } from "../../components/icons";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; month?: string; from?: string; to?: string; sort?: string }>;
}) {
  await requirePagePermission(["ACCOUNTS"], "attention");
  const s = await searchParams,
    month = normalizeMonth(s.from?.slice(0, 7) || s.month),
    all = await retailerOpportunities(month, undefined, s.from, s.to),
    rows = [...all].sort((a, b) => b.priority - a.priority || a.c2s - b.c2s);
  // `reasons.length`, not `priority > 0` — priority is a ranking weight, and a
  // retailer can carry one without having an open reason to act on.
  const flagged = all.filter((x) => x.reasons.length).length,
    high = all.filter((x) => x.priority >= 3 && x.reasons.length).length;

  return (
    <main className="page">
      <PageHeader
        title="Retailer Opportunity"
        subtitle="Outlets where SSO or LSO execution is still open, highest-impact gaps first."
      />

      <SummaryStrip
        items={[
          { label: "Retailers in scope", value: all.length.toLocaleString() },
          { label: "Needs review", value: flagged.toLocaleString(), tone: "amber" },
          { label: "High priority", value: high.toLocaleString() },
          { label: "Clear", value: (all.length - flagged).toLocaleString(), tone: "teal" },
        ]}
      />

      <div className="kit-note is-warn" role="note">
        <Icon name="info" />
        <span>
          Read-only insight — this page creates no records. SSO and LSO completion is calculated month by month, even
          when the selected range spans more than one month.
        </span>
      </div>

      <AttentionSummary rows={all} />

      <RetailerSearchView rows={rows} month={month} from={s.from} to={s.to} base="/accounts/retailers" attentionOnly />
    </main>
  );
}

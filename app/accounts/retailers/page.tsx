/**
 * Retailer search (accounts) — migrated to the role-UI kit.
 *
 * Same shared view as every other role's retailer list; accounts sees the
 * whole base because its job is validating imports, not working a territory.
 */

import { requirePagePermission } from "../../../lib/auth";
import { normalizeMonth } from "../../../lib/drilldown";
import { retailerOpportunities } from "../../../lib/retailer-opportunities";
import { retailerListPage, sortOptionsFor } from "../../../lib/retailer-list";
import { RetailerSearchView } from "../../components/RetailerOpportunityViews";
import { PageHeader, SummaryStrip } from "../../components/Kit";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; month?: string; from?: string; to?: string; sort?: string; page?: string }>;
}) {
  await requirePagePermission(["ACCOUNTS"], "retailers");
  const s = await searchParams,
    month = normalizeMonth(s.from?.slice(0, 7) || s.month),
    rows = await retailerOpportunities(month, undefined, s.from, s.to);
  const sim = rows.filter((x) => x.simSeller).length,
    flagged = rows.filter((x) => x.reasons.length).length;

  const listPage = retailerListPage(rows, {
    q: s.q,
    sort: s.sort,
    page: s.page,
  });

  return (
    <main className="page">
      <PageHeader
        title="Retailer Search"
        subtitle="Find any active retailer and check ownership, GA, C2C, C2S, SSO and LSO."
      />

      <SummaryStrip
        items={[
          { label: "Active Retailers", value: rows.length.toLocaleString() },
          { label: "SIM Sellers", value: sim.toLocaleString() },
          { label: "Flagged", value: flagged.toLocaleString(), tone: "amber" },
          { label: "Clear", value: (rows.length - flagged).toLocaleString(), tone: "teal" },
        ]}
      />

      <RetailerSearchView
        page={listPage}
        sortOptions={sortOptionsFor(false)}
        month={month}
        from={s.from}
        to={s.to}
        base="/accounts/retailers"
      />
    </main>
  );
}

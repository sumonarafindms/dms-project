import { requireUser } from "../../../../lib/auth";
import { normalizeMonth } from "../../../../lib/drilldown";
import { retailerOpportunities } from "../../../../lib/retailer-opportunities";
import { retailerListPage, sortOptionsFor } from "../../../../lib/retailer-list";
import { Card, PageHeader, SectionHead, SummaryStrip } from "../../../components/Kit";
import { RetailerSearchView } from "../../../components/RetailerOpportunityViews";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; month?: string; from?: string; to?: string; sort?: string; page?: string }>;
}) {
  await requireUser(["ADMIN", "IT"]);
  const s = await searchParams,
    month = normalizeMonth(s.from?.slice(0, 7) || s.month),
    rows = await retailerOpportunities(month, undefined, s.from, s.to);
  // The strip describes the WHOLE period, never the search: narrowing to one
  // retailer must not make "Retailers: 2,431" read as 1. Only the list below
  // is filtered and paged.
  const filtered = rows;
  const listPage = retailerListPage(filtered, {
    q: s.q,
    sort: s.sort,
    page: s.page,
  });

  return (
    <main className="page">
      <PageHeader
        title="Retailer Performance"
        subtitle="The full retailer base, sales execution and opportunity status."
      />
      <SummaryStrip
        items={[
          { label: "Retailers", value: filtered.length.toLocaleString() },
          {
            label: "Needs Attention",
            value: filtered.filter((x) => x.priority > 0).length.toLocaleString(),
            tone: "amber",
          },
          {
            label: "SSO Ready",
            value: filtered.filter((x) => x.ssoComplete).length.toLocaleString(),
            tone: "teal",
          },
          {
            label: "LSO Ready",
            value: filtered.filter((x) => x.lsoComplete).length.toLocaleString(),
            tone: "teal",
          },
        ]}
      />
      <SectionHead title="Retailer directory" sub="Open any retailer for full sales and activity detail." />
      <Card padded>
        <RetailerSearchView
          page={listPage}
          sortOptions={sortOptionsFor(false)}
          month={month}
          from={s.from}
          to={s.to}
          base="/admin/retailers"
        />
      </Card>
    </main>
  );
}

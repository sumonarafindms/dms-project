import { requireUser } from "../../../../lib/auth";
import { normalizeMonth } from "../../../../lib/drilldown";
import { retailerOpportunities } from "../../../../lib/retailer-opportunities";
import { Card, PageHeader, SectionHead, SummaryStrip } from "../../../components/Kit";
import { FilterForm } from "../../../components/DrillUI";
import { RetailerSearchView } from "../../../components/RetailerOpportunityViews";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; month?: string; from?: string; to?: string }>;
}) {
  await requireUser(["ADMIN", "IT"]);
  const s = await searchParams,
    month = normalizeMonth(s.from?.slice(0, 7) || s.month),
    rows = await retailerOpportunities(month, undefined, s.from, s.to),
    q = (s.q || "").toLowerCase(),
    filtered = rows.filter((x: any) => !q || JSON.stringify(x).toLowerCase().includes(q));
  return (
    <main className="page">
      <PageHeader
        title="Retailer Performance"
        subtitle="The full retailer base, sales execution and opportunity status."
      />
      <FilterForm
        dateRange
        q={s.q || ""}
        month={month}
        from={s.from}
        to={s.to}
        placeholder="Retailer code, name, RSO or route"
      />
      <SummaryStrip
        items={[
          { label: "Retailers", value: filtered.length.toLocaleString() },
          {
            label: "Needs Attention",
            value: filtered.filter((x: any) => x.priority > 0).length.toLocaleString(),
            tone: "amber",
          },
          {
            label: "SSO Ready",
            value: filtered.filter((x: any) => x.ssoComplete).length.toLocaleString(),
            tone: "teal",
          },
          {
            label: "LSO Ready",
            value: filtered.filter((x: any) => x.lsoComplete).length.toLocaleString(),
            tone: "teal",
          },
        ]}
      />
      <SectionHead title="Retailer directory" sub="Open any retailer for full sales and activity detail." />
      <Card padded>
        <RetailerSearchView rows={filtered} month={month} q="" from={s.from} to={s.to} base="/admin/retailers" />
      </Card>
    </main>
  );
}

import { requirePagePermission } from "../../../lib/auth";
import { normalizeMonth } from "../../../lib/drilldown";
import { retailerOpportunities } from "../../../lib/retailer-opportunities";
import { RetailerSearchView } from "../../components/RetailerOpportunityViews";
import { Card, PageHeader, SectionHead, SummaryStrip } from "../../components/Kit";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; month?: string; from?: string; to?: string; sort?: string }>;
}) {
  const u = await requirePagePermission(["RSO"], "retailers"),
    s = await searchParams,
    month = normalizeMonth(s.from?.slice(0, 7) || s.month);
  const rows = u.employeeId ? await retailerOpportunities(month, [u.employeeId], s.from, s.to) : [],
    sim = rows.filter((x) => x.simSeller).length,
    flagged = rows.filter((x) => x.priority > 0).length;
  return (
    <main className="page">
      <PageHeader title="My Retailers" subtitle="GA, C2S, SSO and LSO status across your own outlet base." />
      <SummaryStrip
        items={[
          { label: "Assigned", value: rows.length.toLocaleString() },
          { label: "SIM Sellers", value: sim.toLocaleString() },
          { label: "Need Focus", value: flagged.toLocaleString(), tone: flagged ? "amber" : "teal" },
          { label: "On Track", value: (rows.length - flagged).toLocaleString(), tone: "teal" },
        ]}
      />
      <SectionHead title="Search & review" sub="Open any retailer for full sales and activity detail." />
      <Card padded>
        <RetailerSearchView rows={rows} month={month} from={s.from} to={s.to} base="/rso/retailers" />
      </Card>
    </main>
  );
}

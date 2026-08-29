import { requirePagePermission } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { normalizeMonth } from "../../../lib/drilldown";
import { retailerOpportunities } from "../../../lib/retailer-opportunities";
import { RetailerSearchView } from "../../components/RetailerOpportunityViews";
import { Card, PageHeader, SectionHead, SummaryStrip } from "../../components/Kit";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; month?: string; from?: string; to?: string; sort?: string }>;
}) {
  const u = await requirePagePermission(["SUPERVISOR"], "retailers"),
    s = await searchParams,
    month = normalizeMonth(s.from?.slice(0, 7) || s.month);
  const ids = u.supervisorId
    ? (
        await prisma.employee.findMany({ where: { supervisorId: u.supervisorId, active: true }, select: { id: true } })
      ).map((x) => x.id)
    : [];
  const rows = await retailerOpportunities(month, ids, s.from, s.to),
    sim = rows.filter((x) => x.simSeller).length,
    flagged = rows.filter((x) => x.priority > 0).length;
  return (
    <main className="page">
      <PageHeader title="My Retailers" subtitle="Every active retailer under your RSO team." />
      <SummaryStrip
        items={[
          { label: "Retailers", value: rows.length.toLocaleString() },
          { label: "SIM Sellers", value: sim.toLocaleString() },
          { label: "Flagged", value: flagged.toLocaleString(), tone: flagged ? "amber" : "teal" },
          { label: "On Track", value: (rows.length - flagged).toLocaleString(), tone: "teal" },
        ]}
      />
      <SectionHead title="Search & review" sub="GA, C2S, SSO and LSO status for the selected dates." />
      <Card padded>
        <RetailerSearchView rows={rows} month={month} from={s.from} to={s.to} base="/supervisor/retailers" />
      </Card>
    </main>
  );
}

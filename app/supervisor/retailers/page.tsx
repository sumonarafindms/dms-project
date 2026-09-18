import { requirePagePermission } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { normalizeMonth } from "../../../lib/drilldown";
import { retailerOpportunities } from "../../../lib/retailer-opportunities";
import { retailerListPage, sortOptionsFor } from "../../../lib/retailer-list";
import { RetailerSearchView } from "../../components/RetailerOpportunityViews";
import { Card, PageHeader, PageNotice, SectionHead, SummaryStrip } from "../../components/Kit";
import { fmtNumber } from "../../../lib/format";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; month?: string; from?: string; to?: string; sort?: string; page?: string }>;
}) {
  const u = await requirePagePermission(["SUPERVISOR"], "retailers"),
    s = await searchParams,
    month = normalizeMonth(s.from?.slice(0, 7) || s.month);
  // Same reasoning as /rso/retailers in v175: a strip of zeros is not an answer
  // to "where are my team's retailers". This page was missed in that pass.
  if (!u.supervisorId)
    return (
      <PageNotice
        title="Account not mapped"
        subtitle="Ask Admin to link this login to a supervisor record."
        hint="Until then there is no team under you, so this page has no outlets to list."
      />
    );
  const ids = (
    await prisma.employee.findMany({ where: { supervisorId: u.supervisorId, active: true }, select: { id: true } })
  ).map((x) => x.id);
  const rows = await retailerOpportunities(month, ids, s.from, s.to),
    sim = rows.filter((x) => x.simSeller).length,
    flagged = rows.filter((x) => x.priority > 0).length;
  const listPage = retailerListPage(rows, {
    q: s.q,
    sort: s.sort,
    page: s.page,
  });

  return (
    <main className="page">
      <PageHeader title="My Retailers" subtitle={`${month} · Every active retailer under your RSO team.`} />
      <SummaryStrip
        items={[
          { label: "Retailers", value: fmtNumber(rows.length) },
          { label: "SIM Sellers", value: fmtNumber(sim) },
          { label: "Flagged", value: fmtNumber(flagged), tone: flagged ? "amber" : "brand" },
          { label: "On Track", value: fmtNumber(rows.length - flagged), tone: "brand" },
        ]}
      />
      <SectionHead title="Search & review" sub="GA, C2S, SSO and LSO status for the selected dates." />
      <Card padded>
        <RetailerSearchView
          page={listPage}
          sortOptions={sortOptionsFor(false)}
          month={month}
          from={s.from}
          to={s.to}
          base="/supervisor/retailers"
        />
      </Card>
    </main>
  );
}

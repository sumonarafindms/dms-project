import { requirePagePermission } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { employeePerformance, pct } from "../../../lib/performance";
import { FilterForm } from "../../components/DrillUI";
import { normalizeMonth } from "../../../lib/drilldown";
import { Card, EmptyState, EntityCard, PageHeader, SectionHead, SummaryStrip } from "../../components/Kit";
import { Icon } from "../../components/icons";
import { ACHIEVEMENT_ON_TRACK_PERCENT } from "../../../lib/achievement";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; month?: string; from?: string; to?: string }>;
}) {
  const u = await requirePagePermission(["SUPERVISOR"], "employees"),
    s = await searchParams,
    q = (s.q || "").toLowerCase(),
    month = normalizeMonth(s.from?.slice(0, 7) || s.month);
  const e = await prisma.employee.findMany({
    where: { supervisorId: u.supervisorId || "", active: true },
    select: { id: true },
  });
  const all = await employeePerformance(
      `${month}-01`,
      e.map((x) => x.id),
      s.from,
      s.to,
    ),
    rows = all
      .filter((r) => !q || `${r.name} ${r.employeeCode || ""} ${r.rsoMsisdn}`.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          pct(b.totalRechargeAchieved, b.totalRechargeTarget) - pct(a.totalRechargeAchieved, a.totalRechargeTarget),
      );
  const strong = all.filter(
    (r) => pct(r.totalRechargeAchieved, r.totalRechargeTarget) >= ACHIEVEMENT_ON_TRACK_PERCENT,
  ).length;
  return (
    <main className="page">
      <PageHeader
        title="My RSOs"
        subtitle="Compare your assigned RSOs and open any member for retailer-level follow-up."
      />
      <SummaryStrip
        items={[
          { label: "Active RSOs", value: all.length.toLocaleString() },
          { label: "On Track", value: strong.toLocaleString(), tone: "teal" },
          { label: "Below Target", value: (all.length - strong).toLocaleString(), tone: "amber" },
          { label: "Showing", value: rows.length.toLocaleString() },
        ]}
      />
      <div className="no-print" style={{ marginBottom: "1rem" }}>
        <FilterForm q={s.q || ""} month={month} from={s.from} to={s.to} dateRange placeholder="Search my team" />
      </div>
      <SectionHead title={`${rows.length} RSOs`} sub="Sorted by total recharge progress." />
      {rows.length ? (
        <div className="kit-card-grid">
          {rows.map((r) => (
            <EntityCard
              key={r.employeeId}
              href={`/supervisor/rsos/${r.employeeId}?month=${month}${s.from ? `&from=${s.from}` : ""}${s.to ? `&to=${s.to}` : ""}`}
              eyebrow="RSO"
              name={r.name}
              code={`${r.employeeCode || r.rsoMsisdn} · ${r.retailerCount} retailers`}
              percent={pct(r.totalRechargeAchieved, r.totalRechargeTarget)}
              metrics={[
                { label: "GA", achieved: r.gaAchieved, target: r.gaTarget },
                { label: "LSO", achieved: r.lsoAchieved, target: r.lsoTarget },
                { label: "Recharge", achieved: r.totalRechargeAchieved, target: r.totalRechargeTarget, unit: "৳" },
              ]}
            />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            title="No RSO matches this search"
            hint="Clear the search or widen the date range."
            icon={<Icon name="search" />}
          />
        </Card>
      )}
    </main>
  );
}

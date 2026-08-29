import { requirePagePermission } from "../../../lib/auth";
import { employeePerformance, pct } from "../../../lib/performance";
import { prisma } from "../../../lib/prisma";
import { FilterForm } from "../../components/DrillUI";
import { normalizeMonth } from "../../../lib/drilldown";
import { managerScope } from "../../../lib/manager-scope";
import { Card, EmptyState, EntityCard, PageHeader, SectionHead, SummaryStrip } from "../../components/Kit";
import { Icon } from "../../components/icons";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; month?: string; from?: string; to?: string }>;
}) {
  const u = await requirePagePermission(["MANAGER"], "employees"),
    s = await searchParams,
    scope = await managerScope(u.id),
    q = (s.q || "").toLowerCase(),
    month = normalizeMonth(s.from?.slice(0, 7) || s.month);
  const [rows, sups] = await Promise.all([
    employeePerformance(`${month}-01`, scope.employeeIds, s.from, s.to),
    prisma.supervisor.findMany({
      where: { active: true, id: { in: scope.supervisorIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const by = new Map<string, { rso: number; ret: number; a: number; t: number; ga: number; gaT: number }>();
  for (const r of rows) {
    const x = by.get(r.supervisor) || { rso: 0, ret: 0, a: 0, t: 0, ga: 0, gaT: 0 };
    x.rso++;
    x.ret += r.retailerCount;
    x.a += r.totalRechargeAchieved;
    x.t += r.totalRechargeTarget;
    x.ga += r.gaAchieved;
    x.gaT += r.gaTarget;
    by.set(r.supervisor, x);
  }
  const filtered = sups.filter((x) => !q || x.name.toLowerCase().includes(q));
  return (
    <main className="page">
      <PageHeader title="Supervisors" subtitle="Only the supervisors assigned to your Manager account." />
      <SummaryStrip
        items={[
          { label: "Assigned Teams", value: sups.length.toLocaleString() },
          { label: "Active RSOs", value: rows.length.toLocaleString() },
          { label: "Retailers", value: rows.reduce((a, r) => a + r.retailerCount, 0).toLocaleString() },
          { label: "Showing", value: filtered.length.toLocaleString() },
        ]}
      />
      <div className="no-print" style={{ marginBottom: "1rem" }}>
        <FilterForm q={s.q || ""} month={month} from={s.from} to={s.to} dateRange placeholder="Search supervisor" />
      </div>
      <SectionHead title={`${filtered.length} supervisors`} sub="Progress is against total recharge target." />
      {filtered.length ? (
        <div className="kit-card-grid">
          {filtered.map((sup) => {
            const x = by.get(sup.name) || { rso: 0, ret: 0, a: 0, t: 0, ga: 0, gaT: 0 };
            return (
              <EntityCard
                key={sup.id}
                href={`/manager/supervisors/${sup.id}?month=${month}${s.from ? `&from=${s.from}` : ""}${s.to ? `&to=${s.to}` : ""}`}
                eyebrow="Supervisor"
                name={sup.name}
                code={`${x.rso} RSOs · ${x.ret.toLocaleString()} retailers`}
                percent={pct(x.a, x.t)}
                metrics={[
                  { label: "GA", achieved: x.ga, target: x.gaT },
                  { label: "Recharge", achieved: x.a, target: x.t, unit: "৳" },
                ]}
              />
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState
            title="No supervisors match this search"
            hint="Clear the search to see every assigned team."
            icon={<Icon name="search" />}
          />
        </Card>
      )}
    </main>
  );
}

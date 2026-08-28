import { requireUser } from "../../../../lib/auth";
import { employeePerformance, pct } from "../../../../lib/performance";
import { prisma } from "../../../../lib/prisma";
import { normalizeMonth } from "../../../../lib/drilldown";
import { monthBounds } from "../../../../lib/month";
import { parseYmd } from "../../../../lib/date-range";
import { Card, EmptyState, EntityCard, PageHeader, SectionHead, SummaryStrip } from "../../../components/Kit";
import { FilterForm } from "../../../components/DrillUI";
import { Icon } from "../../../components/icons";
import Link from "next/link";
import { ComparisonChart } from "../../../components/AnalyticsCharts";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; month?: string; from?: string; to?: string }>;
}) {
  await requireUser(["ADMIN", "IT"]);
  const s = await searchParams,
    q = (s.q || "").trim().toLowerCase(),
    month = normalizeMonth(s.from?.slice(0, 7) || s.month),
    rows = await employeePerformance(`${month}-01`, undefined, s.from, s.to),
    { start, end } = monthBounds(`${month}-01`),
    rs = parseYmd(s.from) || start,
    to = parseYmd(s.to),
    re = to ? new Date(to.getTime() + 86400000) : end;
  const bp = await prisma.bpAssignment.findMany({
    where: { startDate: { lt: re }, OR: [{ endDate: null }, { endDate: { gte: rs } }] },
    include: { employee: { select: { supervisorId: true } } },
  });
  const map = new Map<
    string,
    {
      id: string;
      name: string;
      rsos: number;
      bps: Set<string>;
      target: number;
      achieved: number;
      gaT: number;
      gaA: number;
      retailers: number;
    }
  >();
  const sups = await prisma.supervisor.findMany({ where: { active: true }, select: { id: true, name: true } });
  for (const x of sups)
    map.set(x.id, {
      id: x.id,
      name: x.name,
      rsos: 0,
      bps: new Set(),
      target: 0,
      achieved: 0,
      gaT: 0,
      gaA: 0,
      retailers: 0,
    });
  for (const r of rows) {
    const sup = sups.find((x) => x.name === r.supervisor);
    if (!sup) continue;
    const x = map.get(sup.id)!;
    x.rsos++;
    x.retailers += r.retailerCount;
    x.target += r.totalRechargeTarget;
    x.achieved += r.totalRechargeAchieved;
    x.gaT += r.gaTarget;
    x.gaA += r.gaAchieved;
  }
  for (const b of bp) {
    if (b.employee.supervisorId && map.has(b.employee.supervisorId)) {
      const x = map.get(b.employee.supervisorId)!;
      x.bps.add(b.retailerId); /* BP target is tracked separately from RSO GA; do not add it to employee GA target. */
    }
  }
  const data = [...map.values()]
    .filter((x) => !q || x.name.toLowerCase().includes(q))
    .sort((a, b) => pct(b.achieved, b.target) - pct(a.achieved, a.target));
  const totalT = data.reduce((a, x) => a + x.target, 0),
    totalA = data.reduce((a, x) => a + x.achieved, 0);
  return (
    <main className="page">
      <PageHeader title="Supervisor Performance" subtitle="Team-level target, achievement, RSO and BP overview." />
      <FilterForm dateRange q={s.q || ""} month={month} from={s.from} to={s.to} placeholder="Search supervisor" />
      <SummaryStrip
        items={[
          { label: "Supervisors", value: data.length.toLocaleString() },
          { label: "Total Target", value: `৳${Math.round(totalT).toLocaleString()}` },
          { label: "Achieved", value: `৳${Math.round(totalA).toLocaleString()}`, tone: "teal" },
          { label: "Remaining", value: `৳${Math.max(0, Math.round(totalT - totalA)).toLocaleString()}`, tone: "amber" },
        ]}
      />
      <SectionHead
        title="Team execution comparison"
        sub="Recharge and GA achievement across active supervisor teams."
      />
      <Card padded style={{ marginBottom: "1.25rem" }}>
        <ComparisonChart
          data={data.map((x) => ({
            label: x.name,
            value: pct(x.achieved, x.target),
            secondary: pct(x.gaA, x.gaT),
            meta: `${x.rsos} RSOs · ${x.retailers} retailers`,
          }))}
        />
      </Card>
      <SectionHead title={`${data.length} supervisors`} sub="Ranked by recharge achievement." />
      {data.length ? (
        <div className="kit-card-grid">
          {data.map((x) => (
            <EntityCard
              key={x.id}
              href={`/admin/performance/supervisors/${x.id}?month=${month}${s.from ? `&from=${s.from}` : ""}${s.to ? `&to=${s.to}` : ""}`}
              eyebrow="Supervisor"
              name={x.name}
              code={`${x.rsos} RSOs · ${x.bps.size} BPs · ${x.retailers.toLocaleString()} retailers`}
              percent={pct(x.achieved, x.target)}
              metrics={[
                { label: "GA", achieved: x.gaA, target: x.gaT },
                { label: "Recharge", achieved: x.achieved, target: x.target, unit: "৳" },
              ]}
            />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            title="No supervisor performance found"
            hint="Try another period or search term."
            icon={<Icon name="search" />}
          />
        </Card>
      )}
    </main>
  );
}

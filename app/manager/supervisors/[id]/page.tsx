import Link from "next/link";
import { requirePagePermission } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { employeePerformance, pct } from "../../../../lib/performance";
import { normalizeMonth } from "../../../../lib/drilldown";
import { FilterForm } from "../../../components/DrillUI";
import { notFound } from "next/navigation";
import { managerScope } from "../../../../lib/manager-scope";
import { Card, EmptyState, EntityCard, KpiCard, PageHeader, SectionHead, SummaryStrip } from "../../../components/Kit";
import { Icon } from "../../../components/icons";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string; q?: string; from?: string; to?: string }>;
}) {
  const u = await requirePagePermission(["MANAGER"], "employees"),
    { id } = await params,
    s = await searchParams,
    scope = await managerScope(u.id);
  if (!scope.supervisorIds.includes(id)) notFound();
  const month = normalizeMonth(s.from?.slice(0, 7) || s.month),
    q = (s.q || "").toLowerCase(),
    sup = await prisma.supervisor.findUnique({
      where: { id },
      select: { id: true, name: true, employees: { where: { active: true }, select: { id: true } } },
    });
  if (!sup) notFound();
  const all = await employeePerformance(
      `${month}-01`,
      sup.employees.map((e) => e.id),
      s.from,
      s.to,
    ),
    rows = all.filter((r) => !q || `${r.name} ${r.rsoMsisdn} ${r.employeeCode || ""}`.toLowerCase().includes(q));
  const sum = (k: keyof (typeof all)[number]) => all.reduce((a, r) => a + Number(r[k] || 0), 0),
    retailers = sum("retailerCount");
  return (
    <main className="page">
      <Link href="/manager/supervisors" className="kit-detail-back">
        <Icon name="arrow" /> Supervisors
      </Link>
      <PageHeader
        title={sup.name}
        subtitle={`${all.length} RSOs · ${retailers.toLocaleString()} retailers in this assigned team`}
      />
      <SummaryStrip
        items={[
          { label: "RSOs", value: all.length.toLocaleString() },
          { label: "Retailers", value: retailers.toLocaleString() },
          {
            label: "Recharge Progress",
            value: `${pct(sum("totalRechargeAchieved"), sum("totalRechargeTarget"))}%`,
            tone: "teal",
          },
          { label: "Showing", value: rows.length.toLocaleString() },
        ]}
      />
      <SectionHead title="Team execution" sub="Every metric is the sum of this team's RSO targets." />
      <div className="kit-kpi-grid" style={{ marginBottom: "1.25rem" }}>
        <KpiCard label="GA" achieved={sum("gaAchieved")} target={sum("gaTarget")} />
        <KpiCard label="LSO" achieved={sum("lsoAchieved")} target={sum("lsoTarget")} />
        <KpiCard label="C2C" achieved={sum("c2cAchieved")} target={sum("c2cTarget")} unit="৳" />
        <KpiCard
          label="Total Recharge"
          achieved={sum("totalRechargeAchieved")}
          target={sum("totalRechargeTarget")}
          unit="৳"
        />
      </div>
      <div className="no-print" style={{ marginBottom: "1rem" }}>
        <FilterForm
          q={s.q || ""}
          month={month}
          from={s.from}
          to={s.to}
          dateRange
          placeholder="Search RSO in this team"
        />
      </div>
      <SectionHead title={`${rows.length} RSOs`} sub="Open an RSO for retailer-level drill-down." />
      {rows.length ? (
        <div className="kit-card-grid">
          {rows
            .sort(
              (a, b) =>
                pct(b.totalRechargeAchieved, b.totalRechargeTarget) -
                pct(a.totalRechargeAchieved, a.totalRechargeTarget),
            )
            .map((r) => (
              <EntityCard
                key={r.employeeId}
                href={`/manager/rsos/${r.employeeId}?month=${month}${s.from ? `&from=${s.from}` : ""}${s.to ? `&to=${s.to}` : ""}`}
                eyebrow="RSO"
                name={r.name}
                code={`${r.employeeCode || r.rsoMsisdn} · ${r.retailerCount} retailers`}
                percent={pct(r.totalRechargeAchieved, r.totalRechargeTarget)}
                metrics={[
                  { label: "GA", achieved: r.gaAchieved, target: r.gaTarget },
                  { label: "LSO", achieved: r.lsoAchieved, target: r.lsoTarget },
                ]}
              />
            ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            title="No RSO matches this search"
            hint="Clear the search to see the whole team."
            icon={<Icon name="search" />}
          />
        </Card>
      )}
    </main>
  );
}

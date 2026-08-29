import { requireUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { employeePerformance, pct } from "../../../../../lib/performance";
import { normalizeMonth } from "../../../../../lib/drilldown";
import { monthBounds } from "../../../../../lib/month";
import { parseYmd, monthStartsInRange } from "../../../../../lib/date-range";
import { withStandardGa } from "../../../../../lib/business-rules";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, EmptyState, KpiCard, PageHeader, Row, SectionHead, SummaryStrip } from "../../../../components/Kit";
import { Icon } from "../../../../components/icons";
import { FilterForm } from "../../../../components/DrillUI";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string; from?: string; to?: string }>;
}) {
  await requireUser(["ADMIN", "IT"]);
  const { id } = await params,
    s = await searchParams,
    month = normalizeMonth(s.from?.slice(0, 7) || s.month),
    { start, end } = monthBounds(`${month}-01`);
  const rs = parseYmd(s.from) || start,
    to = parseYmd(s.to),
    re = to ? new Date(to.getTime() + 86400000) : end;
  const sup = await prisma.supervisor.findUnique({
    where: { id },
    select: { id: true, name: true, employees: { where: { active: true }, select: { id: true } } },
  });
  if (!sup) notFound();
  const ids = sup.employees.map((x) => x.id),
    rows = await employeePerformance(`${month}-01`, ids, s.from, s.to);
  const bps = await prisma.bpAssignment.findMany({
    where: { employeeId: { in: ids }, startDate: { lt: re }, OR: [{ endDate: null }, { endDate: { gte: rs } }] },
    include: {
      retailer: { select: { retailerCode: true, retailerName: true } },
      employee: { select: { id: true, name: true } },
      monthlyTargets: true,
    },
  });
  const bpStats = await Promise.all(
    bps.map(async (b) => {
      const es = b.startDate > rs ? b.startDate : rs,
        ae = b.endDate ? new Date(b.endDate.getTime() + 86400000) : re,
        ee = ae < re ? ae : re;
      const targetMap = new Map(b.monthlyTargets.map((x) => [x.month.toISOString().slice(0, 7), x.gaTarget]));
      const target =
        es < ee
          ? monthStartsInRange(es, ee).reduce(
              (n, m) => n + (targetMap.get(m.toISOString().slice(0, 7)) ?? b.gaTarget),
              0,
            )
          : 0;
      const achieved =
        es < ee
          ? await prisma.gaActivation.count({
              where: withStandardGa({ retailerId: b.retailerId, activationDate: { gte: es, lt: ee } }),
            })
          : 0;
      return { ...b, target, achieved };
    }),
  );
  const rechargeTarget = rows.reduce((a, x) => a + x.totalRechargeTarget, 0),
    rechargeAchieved = rows.reduce((a, x) => a + x.totalRechargeAchieved, 0),
    rsoGaT = rows.reduce((a, x) => a + x.gaTarget, 0),
    rsoGaA = rows.reduce((a, x) => a + x.gaAchieved, 0),
    bpGaT = bpStats.reduce((a, x) => a + x.target, 0),
    bpGaA = bpStats.reduce((a, x) => a + x.achieved, 0);
  return (
    <main className="page">
      <Link href="/admin/performance/supervisors" className="kit-detail-back">
        <Icon name="arrow" /> Supervisor Performance
      </Link>
      <PageHeader title={sup.name} subtitle={`${rows.length} RSOs · ${bpStats.length} BP assignments`} />
      <div className="no-print" style={{ marginBottom: "1rem" }}>
        <FilterForm month={month} from={s.from} to={s.to} dateRange showMonth placeholder="" />
      </div>
      <SummaryStrip
        items={[
          { label: "Recharge", value: `${pct(rechargeAchieved, rechargeTarget)}%`, tone: "teal" },
          { label: "RSO GA", value: `${rsoGaA} / ${rsoGaT}` },
          // BP GA is a separate target from RSO GA and is never added to it.
          { label: "BP GA", value: `${bpGaA} / ${bpGaT}` },
          { label: "BPs", value: bpStats.length.toLocaleString() },
        ]}
      />
      <SectionHead title="Team execution" sub="Every metric is the sum of this team's RSO targets." />
      <div className="kit-kpi-grid" style={{ marginBottom: "1.25rem" }}>
        <KpiCard label="RSO GA" achieved={rsoGaA} target={rsoGaT} />
        <KpiCard label="BP GA" achieved={bpGaA} target={bpGaT} />
        <KpiCard label="Recharge" achieved={rechargeAchieved} target={rechargeTarget} unit="৳" />
      </div>
      <SectionHead title="Assigned RSOs" />
      <Card padded style={{ marginBottom: "1.25rem" }}>
        {rows.length ? (
          <div className="kit-rows">
            {rows.map((r) => (
              <Row
                key={r.employeeId}
                icon={<Icon name="users" />}
                title={r.name}
                sub={`${r.employeeCode || r.rsoMsisdn} · ${r.retailerCount} retailers · GA ${r.gaAchieved}/${r.gaTarget}`}
                value={`${pct(r.totalRechargeAchieved, r.totalRechargeTarget)}%`}
                valueSub="recharge"
              />
            ))}
          </div>
        ) : (
          <EmptyState title="No RSOs in this team" icon={<Icon name="users" />} />
        )}
      </Card>
      <SectionHead title="Assigned BPs" sub="Effective within the selected dates." />
      <Card padded>
        {bpStats.length ? (
          <div className="kit-rows">
            {bpStats.map((b) => (
              <Row
                key={b.id}
                icon={<Icon name="sim" />}
                title={b.retailer.retailerName || b.retailer.retailerCode}
                sub={`${b.retailer.retailerCode} · RSO ${b.employee.name}`}
                value={`${b.achieved}/${b.target}`}
                valueSub="BP GA"
              />
            ))}
          </div>
        ) : (
          <EmptyState title="No BP assignments in this period" icon={<Icon name="sim" />} />
        )}
      </Card>
    </main>
  );
}

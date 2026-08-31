import { requireUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { employeePerformance } from "../../../../../lib/performance";
import { targetPercent as pct } from "../../../../../lib/achievement";
import { normalizeMonth } from "../../../../../lib/drilldown";
import { monthBounds } from "../../../../../lib/month";
import { parseYmd, monthStartsInRange } from "../../../../../lib/date-range";
import { standardGaByAssignment } from "../../../../../lib/bp-activations";
import { teamTotals } from "../../../../../lib/bp-rollup";
import { assignmentGaTarget, assignmentWindow } from "../../../../../lib/bp-period";
import { notFound } from "next/navigation";
import { EntityGrid } from "../../../../components/EntityGrid";
import Link from "next/link";
import { Card, EmptyState, KpiCard, PageHeader, Row, SectionHead, SummaryStrip } from "../../../../components/Kit";
import { Icon } from "../../../../components/icons";
import { pacingForView } from "../../../../../lib/pacing";

// A plain description, not comparators: functions cannot cross the
// Server-to-Client boundary.
const SORT_FIELDS = [
  { key: "recharge", label: "Recharge %" },
  { key: "ga", label: "GA %" },
  { key: "retailers", label: "Retailers", bothWays: false },
];

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
  // One grouped query for the whole team's BPs, not one count each: a
  // supervisor with 40 BP assignments was issuing 41 database round trips to
  // render this page.
  const gaByAssignment = await standardGaByAssignment(bps, rs, re);
  const bpStats = bps.map((b) => {
    const { effectiveStart: es, effectiveEnd: ee } = assignmentWindow(b, rs, re);
    const target = es < ee ? assignmentGaTarget(b, monthStartsInRange(es, ee)) : 0;
    return { ...b, target, achieved: gaByAssignment.get(b.id) ?? 0 };
  });
  const range = `month=${month}${s.from ? `&from=${s.from}` : ""}${s.to ? `&to=${s.to}` : ""}`;
  // Recharge is the TEAM's, so it includes the BPs' C2C. GA is shown split, so
  // the RSO figures below stay exactly as the rows come and the BP figures get
  // their own card.
  const team = teamTotals(rows);
  const rechargeTarget = team.totalRechargeTarget,
    rechargeAchieved = team.totalRechargeAchieved,
    rsoGaT = rows.reduce((a, x) => a + x.gaTarget, 0),
    rsoGaA = rows.reduce((a, x) => a + x.gaAchieved, 0),
    bpGaT = bpStats.reduce((a, x) => a + x.target, 0),
    bpGaA = bpStats.reduce((a, x) => a + x.achieved, 0);
  // pacingForView, not pacing: this page accepts from/to, so the figures may
  // describe a narrowed window rather than the month. It returns null there
  // and the pacing line is simply not shown.
  const now = new Date();
  const paceFor = (target: number, achieved: number) =>
    pacingForView(target, achieved, month, { from: s.from, to: s.to, now }) ?? undefined;
  return (
    <main className="page">
      <Link href="/admin/performance/supervisors" className="kit-detail-back">
        <Icon name="arrow" /> Supervisor Performance
      </Link>
      <PageHeader title={sup.name} subtitle={`${rows.length} RSOs · ${bpStats.length} BP assignments`} />
      <SummaryStrip
        items={[
          { label: "Recharge", value: `${pct(rechargeAchieved, rechargeTarget)}%`, tone: "teal" },
          { label: "RSO GA", value: `${rsoGaA} / ${rsoGaT}` },
          // BP GA is a separate target from RSO GA and is never added to it.
          // Before v136 this was only half true: `rows` still had the BP SIMs
          // inside "RSO GA", so a BP was counted here twice. It is not now.
          { label: "BP GA", value: `${bpGaA} / ${bpGaT}` },
          { label: "BPs", value: bpStats.length.toLocaleString() },
        ]}
      />
      <SectionHead title="Team execution" sub="Every metric is the sum of this team's RSO targets." />
      <div className="kit-kpi-grid kit-mb-20">
        <KpiCard label="RSO GA" achieved={rsoGaA} target={rsoGaT} pace={paceFor(rsoGaT, rsoGaA)} />
        <KpiCard label="BP GA" achieved={bpGaA} target={bpGaT} pace={paceFor(bpGaT, bpGaA)} />
        <KpiCard
          label="Recharge"
          achieved={rechargeAchieved}
          target={rechargeTarget}
          unit="৳"
          pace={paceFor(rechargeTarget, rechargeAchieved)}
        />
      </div>
      <EntityGrid
        rows={rows.map((r) => ({
          id: r.employeeId,
          href: `/admin/rsos/${r.employeeId}?${range}`,
          eyebrow: "RSO",
          name: r.name,
          code: `${r.employeeCode || r.rsoMsisdn} · ${r.retailerCount.toLocaleString()} retailers`,
          percent: pct(r.totalRechargeAchieved, r.totalRechargeTarget),
          metrics: [
            { label: "GA", achieved: r.gaAchieved, target: r.gaTarget },
            { label: "Recharge", achieved: r.totalRechargeAchieved, target: r.totalRechargeTarget, unit: "৳" },
          ],
          search: `${r.name} ${r.employeeCode || ""} ${r.rsoMsisdn}`.toLowerCase(),
          sortKeys: {
            recharge: pct(r.totalRechargeAchieved, r.totalRechargeTarget),
            ga: pct(r.gaAchieved, r.gaTarget),
            retailers: r.retailerCount,
          },
        }))}
        sortFields={SORT_FIELDS}
        placeholder="Search this team"
        noun="RSO"
        month={month}
        from={s.from}
        to={s.to}
        emptyTitle="No RSOs in this team"
      />
      <SectionHead title="Assigned BPs" sub="Effective within the selected dates." />
      <Card padded>
        {bpStats.length ? (
          <div className="kit-rows">
            {bpStats.map((b) => (
              <Row
                key={b.id}
                href={`/admin/performance/bps/${b.id}?${range}`}
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

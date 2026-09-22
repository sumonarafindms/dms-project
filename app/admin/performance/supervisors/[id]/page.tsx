import { bpDisplayName } from "../../../../../lib/bp-name";
import { requireUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { employeePerformance } from "../../../../../lib/performance";
import { againstTarget, NO_TARGET_MARK, targetPercent as pct } from "../../../../../lib/achievement";
import { normalizeMonth } from "../../../../../lib/drilldown";
import { monthBounds } from "../../../../../lib/month";
import { parseYmd, monthStartsInRange } from "../../../../../lib/date-range";
import { standardGaByAssignment } from "../../../../../lib/bp-activations";
import { teamTotals } from "../../../../../lib/bp-rollup";
import { targetFor } from "../../../../../lib/supervisor-target";
import { supervisorTargets } from "../../../../../lib/supervisor-target-query";
import { assignmentGaTarget, assignmentWindow } from "../../../../../lib/bp-period";
import { notFound } from "next/navigation";
import { EntityGrid } from "../../../../components/EntityGrid";
import { AppLink as Link } from "../../../../components/AppLink";
import { Card, EmptyState, KpiCard, PageHeader, Row, SectionHead, SummaryStrip } from "../../../../components/Kit";
import { addTiers, noTiers, type GaTiers } from "../../../../../lib/ga-category";
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
      retailer: { select: { retailerCode: true, retailerName: true, bpName: true } },
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
    return { ...b, target, achieved: gaByAssignment.get(b.id) ?? noTiers() };
  });
  const range = `month=${month}${s.from ? `&from=${s.from}` : ""}${s.to ? `&to=${s.to}` : ""}`;
  // Recharge is the TEAM's, so it includes the BPs' C2C. GA is shown split, so
  // the RSO figures below stay exactly as the rows come and the BP figures get
  // their own card.
  const team = teamTotals(rows);
  /*
   * The supervisor's own target, which since v181 is what "Recharge" and the
   * new "Supervisor GA" card are measured against. The RSO GA and BP GA cards
   * below keep their own targets deliberately: those two answer a different
   * question — what the team is MADE of — and the composition is the reason
   * this page exists.
   */
  const ownTarget = targetFor(await supervisorTargets(rs, re, [id]), id);
  const rechargeTarget = ownTarget.totalRechargeTarget,
    rechargeAchieved = team.totalRechargeAchieved,
    rsoGaT = rows.reduce((a, x) => a + x.gaTarget, 0),
    rsoTiers = rows.reduce<GaTiers>(
      (a, x) => addTiers(a, { total: x.gaAchieved, ga170: x.ga170, ga300: x.ga300 }),
      noTiers(),
    ),
    rsoGaA = rsoTiers.total,
    bpGaT = bpStats.reduce((a, x) => a + x.target, 0),
    bpTiers = bpStats.reduce<GaTiers>((a, x) => addTiers(a, x.achieved), noTiers()),
    bpGaA = bpTiers.total;
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
          {
            label: "Recharge",
            value: rechargeTarget > 0 ? `${pct(rechargeAchieved, rechargeTarget)}%` : NO_TARGET_MARK,
            tone: "brand",
          },
          { label: "RSO GA", value: againstTarget(rsoGaA, rsoGaT) },
          // BP GA is a separate target from RSO GA and is never added to it.
          // Before v136 this was only half true: `rows` still had the BP SIMs
          // inside "RSO GA", so a BP was counted here twice. It is not now.
          { label: "BP GA", value: againstTarget(bpGaA, bpGaT) },
          { label: "BPs", value: bpStats.length.toLocaleString("en-US") },
        ]}
      />
      <SectionHead
        title="Team execution"
        sub={
          ownTarget.set
            ? "Supervisor GA and Recharge are this supervisor's own targets. RSO GA and BP GA show what the team is made of, each against its own target."
            : "No target has been set for this supervisor this month. RSO GA and BP GA below show what the team is made of, each against its own target."
        }
      />
      <div className="kit-kpi-grid kit-mb-20">
        {/* The supervisor's own GA target against everything the team sold —
            RSOs and BPs together, a shared outlet counted once. */}
        <KpiCard
          label="Supervisor GA"
          achieved={team.gaAchieved}
          target={ownTarget.gaTarget}
          pace={paceFor(ownTarget.gaTarget, team.gaAchieved)}
          tiers={{ total: team.gaAchieved, ga170: team.ga170, ga300: team.ga300 }}
        />
        <KpiCard label="RSO GA" achieved={rsoGaA} target={rsoGaT} pace={paceFor(rsoGaT, rsoGaA)} tiers={rsoTiers} />
        <KpiCard label="BP GA" achieved={bpGaA} target={bpGaT} pace={paceFor(bpGaT, bpGaA)} tiers={bpTiers} />
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
          code: `${r.employeeCode || r.rsoMsisdn} · ${r.retailerCount.toLocaleString("en-US")} retailers`,
          percent: r.totalRechargeTarget > 0 ? pct(r.totalRechargeAchieved, r.totalRechargeTarget) : null,
          metrics: [
            { label: "GA", achieved: r.gaAchieved, target: r.gaTarget },
            { label: "SSO", achieved: r.ssoAchieved, target: r.ssoTarget },
            { label: "LSO", achieved: r.lsoAchieved, target: r.lsoTarget },
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
                title={bpDisplayName(b.retailer)}
                sub={`${b.retailer.retailerCode} · RSO ${b.employee.name}`}
                // `achieved` is a GaTiers object, not a number — v177 changed
                // it when the 170/300 split arrived, and this line kept
                // interpolating the object, so every row read "[object
                // Object]/25". The total is the figure this row is about.
                value={againstTarget(b.achieved.total, b.target, (n) => n.toLocaleString("en-US"))}
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

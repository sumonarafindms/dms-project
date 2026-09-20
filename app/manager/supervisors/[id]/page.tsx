import { AppLink as Link } from "../../../components/AppLink";
import { requirePagePermission } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { employeePerformance } from "../../../../lib/performance";
import { teamTotals } from "../../../../lib/bp-rollup";
import { targetPercent as pct } from "../../../../lib/achievement";
import { normalizeMonth } from "../../../../lib/drilldown";
import { notFound } from "next/navigation";
import { managerScope } from "../../../../lib/manager-scope";
import { KpiCard, PageHeader, SectionHead, SummaryStrip } from "../../../components/Kit";
import { EntityGrid } from "../../../components/EntityGrid";
import { Icon } from "../../../components/icons";
import { pacingForView } from "../../../../lib/pacing";
import { targetFor, targetWindow, withSupervisorTarget } from "../../../../lib/supervisor-target";
import { supervisorTargets } from "../../../../lib/supervisor-target-query";

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
  const u = await requirePagePermission(["MANAGER"], "employees"),
    { id } = await params,
    s = await searchParams,
    scope = await managerScope(u.id);
  if (!scope.supervisorIds.includes(id)) notFound();
  const month = normalizeMonth(s.from?.slice(0, 7) || s.month),
    sup = await prisma.supervisor.findUnique({
      where: { id },
      select: { id: true, name: true, employees: { where: { active: true }, select: { id: true } } },
    });
  if (!sup) notFound();
  const win = targetWindow(`${month}-01`, s.from, s.to);
  const [all, supTargets] = await Promise.all([
    employeePerformance(
      `${month}-01`,
      sup.employees.map((e) => e.id),
      s.from,
      s.to,
    ),
    supervisorTargets(win.start, win.endExclusive, [id]),
  ]);
  const rows = all;
  const ownTarget = targetFor(supTargets, id);
  // teamTotals for the ACHIEVED side: this is a supervisor's team, so their
  // RSOs' Business Partners count, and a shared outlet counts once. The target
  // side is the supervisor's own since v181 — see lib/supervisor-target.ts.
  const team = withSupervisorTarget(teamTotals(all), ownTarget),
    retailers = team.retailerCount;
  // pacingForView, not pacing: this page accepts from/to, so the figures may
  // describe an eight-day window. A monthly "22 days left" over that would be
  // a confidently wrong number, so it returns null and the line is hidden.
  const now = new Date();
  const paceFor = (targetKey: keyof typeof team, achievedKey: keyof typeof team) =>
    pacingForView(team[targetKey], team[achievedKey], month, { from: s.from, to: s.to, now }) ?? undefined;
  return (
    <main className="page">
      <Link href="/manager/supervisors" className="kit-detail-back">
        <Icon name="arrow" /> Supervisors
      </Link>
      <PageHeader
        title={sup.name}
        subtitle={`${all.length} RSOs · ${retailers.toLocaleString("en-US")} retailers in this assigned team`}
      />
      <SummaryStrip
        items={[
          { label: "RSOs", value: all.length.toLocaleString("en-US") },
          { label: "Retailers", value: retailers.toLocaleString("en-US") },
          {
            label: "Recharge Progress",
            value: `${pct(team.totalRechargeAchieved, team.totalRechargeTarget)}%`,
            tone: "brand",
          },
          { label: "Showing", value: rows.length.toLocaleString("en-US") },
        ]}
      />
      <SectionHead
        title="Team execution"
        sub={
          ownTarget.set
            ? "Achievement is everything this team sold. The target is this supervisor's own, set on the Target page."
            : "No target has been set for this supervisor this month, so the cards show what the team sold and name the gap."
        }
      />
      <div className="kit-kpi-grid kit-mb-20">
        <KpiCard
          label="GA"
          achieved={team.gaAchieved}
          target={team.gaTarget}
          pace={paceFor("gaTarget", "gaAchieved")}
        />
        <KpiCard
          label="LSO"
          achieved={team.lsoAchieved}
          target={team.lsoTarget}
          pace={paceFor("lsoTarget", "lsoAchieved")}
        />
        <KpiCard
          label="C2C"
          achieved={team.c2cAchieved}
          target={team.c2cTarget}
          unit="৳"
          pace={paceFor("c2cTarget", "c2cAchieved")}
        />
        <KpiCard
          label="Total Recharge"
          achieved={team.totalRechargeAchieved}
          target={team.totalRechargeTarget}
          unit="৳"
          pace={paceFor("totalRechargeTarget", "totalRechargeAchieved")}
        />
      </div>
      <EntityGrid
        rows={rows.map((r) => ({
          id: r.employeeId,
          href: `/manager/rsos/${r.employeeId}?month=${month}${s.from ? `&from=${s.from}` : ""}${s.to ? `&to=${s.to}` : ""}`,
          eyebrow: "RSO",
          name: r.name,
          code: `${r.employeeCode || r.rsoMsisdn} · ${r.retailerCount.toLocaleString("en-US")} retailers`,
          percent: r.totalRechargeTarget > 0 ? pct(r.totalRechargeAchieved, r.totalRechargeTarget) : null,
          metrics: [
            { label: "GA", achieved: r.gaAchieved, target: r.gaTarget },
            { label: "SSO", achieved: r.ssoAchieved, target: r.ssoTarget },
            { label: "LSO", achieved: r.lsoAchieved, target: r.lsoTarget },
          ],
          search: `${r.name} ${r.employeeCode || ""} ${r.rsoMsisdn}`.toLowerCase(),
          sortKeys: {
            recharge: pct(r.totalRechargeAchieved, r.totalRechargeTarget),
            ga: pct(r.gaAchieved, r.gaTarget),
            retailers: r.retailerCount,
          },
        }))}
        sortFields={SORT_FIELDS}
        placeholder="Search RSO in this team"
        noun="RSO"
        month={month}
        from={s.from}
        to={s.to}
        emptyTitle="No RSOs in this team"
      />
    </main>
  );
}

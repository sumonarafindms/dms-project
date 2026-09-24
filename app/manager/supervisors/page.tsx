import { requirePagePermission } from "../../../lib/auth";
import { employeePerformance } from "../../../lib/performance";
import { groupSizes, groupTotals } from "../../../lib/bp-rollup";
import { noTiers, type GaTiers } from "../../../lib/ga-category";
import { targetPercent as pct } from "../../../lib/achievement";
import { prisma } from "../../../lib/prisma";
import { normalizeMonth } from "../../../lib/drilldown";
import { managerScope } from "../../../lib/manager-scope";
import { targetFor, targetWindow, withSupervisorTarget } from "../../../lib/supervisor-target";
import { supervisorTargets } from "../../../lib/supervisor-target-query";
import { PageHeader, SummaryStrip } from "../../components/Kit";
import { EntityGrid } from "../../components/EntityGrid";

// A plain description, not comparators: functions cannot cross the
// Server-to-Client boundary.
const SORT_FIELDS = [
  { key: "recharge", label: "Recharge %" },
  { key: "ga", label: "GA %" },
  { key: "rsos", label: "RSOs", bothWays: false },
  { key: "retailers", label: "Retailers", bothWays: false },
];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; from?: string; to?: string }>;
}) {
  const u = await requirePagePermission(["MANAGER"], "employees"),
    s = await searchParams,
    scope = await managerScope(u.id),
    month = normalizeMonth(s.from?.slice(0, 7) || s.month);
  const win = targetWindow(`${month}-01`, s.from, s.to);
  const [rows, sups, supTargets] = await Promise.all([
    employeePerformance(`${month}-01`, scope.employeeIds, s.from, s.to),
    prisma.supervisor.findMany({
      where: { active: true, id: { in: scope.supervisorIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    supervisorTargets(win.start, win.endExclusive, scope.supervisorIds),
  ]);
  // Keyed by supervisor id, not name: two supervisors sharing a name used to
  // share one row's totals here.
  const by = new Map<
    string,
    { rso: number; ret: number; a: number; t: number; ga: number; gaT: number; tiers: GaTiers }
  >();
  /*
   * groupTotals, not a reduce over withBp(): a supervisor's team can hold one
   * Business Partner through two RSOs, and `withBp()` gives each of them the
   * whole outlet on purpose. Adding those into a bucket counted it twice.
   * lib/bp-rollup.ts is the one place allowed to do this arithmetic.
   */
  const totals = groupTotals(rows, (r) => r.supervisorId);
  const sizes = groupSizes(rows, (r) => r.supervisorId);
  for (const [supervisorId, raw] of totals) {
    if (supervisorId === null) continue; // a manager's RSOs all sit under their supervisors
    // Achievement from the territory; target from the supervisor's own row.
    // v181: a supervisor is no longer measured against their RSOs' targets
    // added up. See lib/supervisor-target.ts.
    const t = withSupervisorTarget(raw, targetFor(supTargets, supervisorId));
    by.set(supervisorId, {
      rso: sizes.get(supervisorId) ?? 0,
      ret: t.retailerCount,
      a: t.totalRechargeAchieved,
      t: t.totalRechargeTarget,
      ga: t.gaAchieved,
      gaT: t.gaTarget,
      tiers: { total: t.gaAchieved, ga170: t.ga170, ga300: t.ga300 },
    });
  }
  const teams = sups.map((sup) => ({
    id: sup.id,
    name: sup.name,
    ...(by.get(sup.id) || { rso: 0, ret: 0, a: 0, t: 0, ga: 0, gaT: 0, tiers: noTiers() }),
  }));
  return (
    <main className="page">
      <PageHeader title="Supervisors" subtitle="Only the supervisors assigned to your Manager account." />
      <SummaryStrip
        items={[
          { label: "Assigned Teams", value: sups.length.toLocaleString("en-US") },
          { label: "Active RSOs", value: rows.length.toLocaleString("en-US") },
          { label: "Retailers", value: rows.reduce((a, r) => a + r.retailerCount, 0).toLocaleString("en-US") },
          { label: "Showing", value: teams.length.toLocaleString("en-US") },
        ]}
      />
      <EntityGrid
        rows={teams.map((x) => ({
          id: x.id,
          href: `/manager/supervisors/${x.id}?month=${month}${s.from ? `&from=${s.from}` : ""}${s.to ? `&to=${s.to}` : ""}`,
          eyebrow: "Supervisor",
          name: x.name,
          code: `${x.rso} RSOs · ${x.ret.toLocaleString("en-US")} retailers`,
          percent: x.t > 0 ? pct(x.a, x.t) : null,
          metrics: [
            { label: "GA", achieved: x.ga, target: x.gaT, tiers: x.tiers },
            { label: "Recharge", achieved: x.a, target: x.t, unit: "৳" },
          ],
          search: x.name.toLowerCase(),
          sortKeys: { recharge: pct(x.a, x.t), ga: pct(x.ga, x.gaT), rsos: x.rso, retailers: x.ret },
        }))}
        sortFields={SORT_FIELDS}
        placeholder="Search supervisor"
        noun="supervisor"
        month={month}
        from={s.from}
        to={s.to}
        emptyTitle="No supervisors assigned"
        emptyHint="Your Manager account has no supervisor teams yet."
      />
    </main>
  );
}

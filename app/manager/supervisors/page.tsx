import { requirePagePermission } from "../../../lib/auth";
import { employeePerformance, pct } from "../../../lib/performance";
import { prisma } from "../../../lib/prisma";
import { normalizeMonth } from "../../../lib/drilldown";
import { managerScope } from "../../../lib/manager-scope";
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
  const [rows, sups] = await Promise.all([
    employeePerformance(`${month}-01`, scope.employeeIds, s.from, s.to),
    prisma.supervisor.findMany({
      where: { active: true, id: { in: scope.supervisorIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  // Keyed by supervisor id, not name: two supervisors sharing a name used to
  // share one row's totals here.
  const by = new Map<string, { rso: number; ret: number; a: number; t: number; ga: number; gaT: number }>();
  for (const r of rows) {
    if (!r.supervisorId) continue;
    const x = by.get(r.supervisorId) || { rso: 0, ret: 0, a: 0, t: 0, ga: 0, gaT: 0 };
    x.rso++;
    x.ret += r.retailerCount;
    x.a += r.totalRechargeAchieved;
    x.t += r.totalRechargeTarget;
    x.ga += r.gaAchieved;
    x.gaT += r.gaTarget;
    by.set(r.supervisorId, x);
  }
  const teams = sups.map((sup) => ({
    id: sup.id,
    name: sup.name,
    ...(by.get(sup.id) || { rso: 0, ret: 0, a: 0, t: 0, ga: 0, gaT: 0 }),
  }));
  return (
    <main className="page">
      <PageHeader title="Supervisors" subtitle="Only the supervisors assigned to your Manager account." />
      <SummaryStrip
        items={[
          { label: "Assigned Teams", value: sups.length.toLocaleString() },
          { label: "Active RSOs", value: rows.length.toLocaleString() },
          { label: "Retailers", value: rows.reduce((a, r) => a + r.retailerCount, 0).toLocaleString() },
          { label: "Showing", value: teams.length.toLocaleString() },
        ]}
      />
      <EntityGrid
        rows={teams.map((x) => ({
          id: x.id,
          href: `/manager/supervisors/${x.id}?month=${month}${s.from ? `&from=${s.from}` : ""}${s.to ? `&to=${s.to}` : ""}`,
          eyebrow: "Supervisor",
          name: x.name,
          code: `${x.rso} RSOs · ${x.ret.toLocaleString()} retailers`,
          percent: pct(x.a, x.t),
          metrics: [
            { label: "GA", achieved: x.ga, target: x.gaT },
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

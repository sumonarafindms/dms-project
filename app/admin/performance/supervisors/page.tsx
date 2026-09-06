import { requireUser } from "../../../../lib/auth";
import { employeePerformance } from "../../../../lib/performance";
import { groupSizes, groupTotals } from "../../../../lib/bp-rollup";
import { targetPercent as pct } from "../../../../lib/achievement";
import { prisma } from "../../../../lib/prisma";
import { normalizeMonth } from "../../../../lib/drilldown";
import { monthBounds } from "../../../../lib/month";
import { parseYmd } from "../../../../lib/date-range";
import { Card, PageHeader, SectionHead, SummaryStrip } from "../../../components/Kit";
import { ComparisonChart } from "../../../components/AnalyticsCharts";
import { EntityGrid } from "../../../components/EntityGrid";

type SupervisorRow = {
  id: string;
  name: string;
  rsos: number;
  bps: Set<string>;
  target: number;
  achieved: number;
  gaT: number;
  gaA: number;
  retailers: number;
};

// A plain description, not comparators: functions cannot be passed from a
// Server Component to a Client Component.
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
  await requireUser(["ADMIN", "IT"]);
  const s = await searchParams,
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
  const map = new Map<string, SupervisorRow>();
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
  /*
   * groupTotals, not a reduce over withBp().
   *
   * Group on the supervisor's id. Matching on the name merged two supervisors
   * who happen to share one, and silently dropped every RSO whose supervisor
   * is inactive or unset.
   *
   * The arithmetic then belongs to lib/bp-rollup.ts. This loop used to add
   * `withBp(r)` into the bucket one metric at a time, which was right until a
   * Business Partner could be held by two RSOs — `withBp()` gives each holder
   * the whole outlet on purpose, so a bucket containing both added its GA and
   * its target twice. On real data one shared outlet turned 3,744 GA against a
   * 415 target into 3,765 against 440, on the screen whose job is that number.
   */
  const totals = groupTotals(rows, (r) => r.supervisorId);
  const sizes = groupSizes(rows, (r) => r.supervisorId);
  for (const [supervisorId, t] of totals) {
    const x = map.get(supervisorId);
    if (!x) continue;
    x.rsos = sizes.get(supervisorId) ?? 0;
    x.retailers = t.retailerCount;
    x.target = t.totalRechargeTarget;
    x.achieved = t.totalRechargeAchieved;
    x.gaT = t.gaTarget;
    x.gaA = t.gaAchieved;
  }
  for (const b of bp) {
    if (b.employee.supervisorId && map.has(b.employee.supervisorId)) {
      const x = map.get(b.employee.supervisorId)!;
      // Only the BP COUNT is collected here. The BP's GA and target already
      // arrived through withBp() above; adding them again would double count.
      x.bps.add(b.retailerId);
    }
  }
  const data = [...map.values()];
  const totalT = data.reduce((a, x) => a + x.target, 0),
    totalA = data.reduce((a, x) => a + x.achieved, 0);
  return (
    <main className="page">
      <PageHeader title="Supervisor Performance" subtitle="Team-level target, achievement, RSO and BP overview." />
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
      <Card className="kit-mb-20" padded>
        <ComparisonChart
          data={data.map((x) => ({
            label: x.name,
            value: pct(x.achieved, x.target),
            secondary: pct(x.gaA, x.gaT),
            meta: `${x.rsos} RSOs · ${x.retailers} retailers`,
          }))}
        />
      </Card>
      <EntityGrid
        rows={data.map((x) => ({
          id: x.id,
          href: `/admin/performance/supervisors/${x.id}?month=${month}${s.from ? `&from=${s.from}` : ""}${s.to ? `&to=${s.to}` : ""}`,
          eyebrow: "Supervisor",
          name: x.name,
          code: `${x.rsos} RSOs · ${x.bps.size} BPs · ${x.retailers.toLocaleString()} retailers`,
          percent: pct(x.achieved, x.target),
          metrics: [
            { label: "GA", achieved: x.gaA, target: x.gaT },
            { label: "Recharge", achieved: x.achieved, target: x.target, unit: "৳" },
          ],
          search: x.name.toLowerCase(),
          sortKeys: {
            recharge: pct(x.achieved, x.target),
            ga: pct(x.gaA, x.gaT),
            rsos: x.rsos,
            retailers: x.retailers,
          },
        }))}
        sortFields={SORT_FIELDS}
        placeholder="Search supervisor"
        noun="supervisor"
        month={month}
        from={s.from}
        to={s.to}
        emptyTitle="No supervisor performance found"
        emptyHint="Try another period."
      />
    </main>
  );
}

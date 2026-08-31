import { requirePagePermission } from "../../../lib/auth";
import { employeePerformance } from "../../../lib/performance";
import { normalizeMonth } from "../../../lib/drilldown";
import { managerScope } from "../../../lib/manager-scope";
import { PageHeader, SummaryStrip } from "../../components/Kit";
import { EntityGrid } from "../../components/EntityGrid";
import { ACHIEVEMENT_ON_TRACK_PERCENT, targetPercent as pct } from "../../../lib/achievement";

// A plain description, not comparators: functions cannot cross the
// Server-to-Client boundary.
const SORT_FIELDS = [
  { key: "recharge", label: "Recharge %" },
  { key: "ga", label: "GA %" },
  { key: "sso", label: "SSO %" },
  { key: "lso", label: "LSO %" },
  { key: "retailers", label: "Retailers", bothWays: false },
];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; from?: string; to?: string }>;
}) {
  const u = await requirePagePermission(["MANAGER"], "performance"),
    s = await searchParams,
    scope = await managerScope(u.id),
    month = normalizeMonth(s.from?.slice(0, 7) || s.month);
  const all = await employeePerformance(`${month}-01`, scope.employeeIds, s.from, s.to);
  const rows = all;
  const onTrack = all.filter(
    (r) => pct(r.totalRechargeAchieved, r.totalRechargeTarget) >= ACHIEVEMENT_ON_TRACK_PERCENT,
  ).length;
  return (
    <main className="page">
      <PageHeader title="RSO Performance" subtitle="Assigned RSOs compared by target execution." />
      <SummaryStrip
        items={[
          { label: "Active RSOs", value: all.length.toLocaleString() },
          { label: "On Track", value: onTrack.toLocaleString(), tone: "teal" },
          { label: "Below Target", value: (all.length - onTrack).toLocaleString(), tone: "amber" },
          { label: "Showing", value: rows.length.toLocaleString() },
        ]}
      />
      <EntityGrid
        rows={rows.map((r) => ({
          id: r.employeeId,
          href: `/manager/rsos/${r.employeeId}?month=${month}${s.from ? `&from=${s.from}` : ""}${s.to ? `&to=${s.to}` : ""}`,
          eyebrow: "RSO",
          name: r.name,
          code: `${r.employeeCode || r.rsoMsisdn} · ${r.supervisor}`,
          percent: pct(r.totalRechargeAchieved, r.totalRechargeTarget),
          metrics: [
            { label: "GA", achieved: r.gaAchieved, target: r.gaTarget },
            { label: "LSO", achieved: r.lsoAchieved, target: r.lsoTarget },
            { label: "Recharge", achieved: r.totalRechargeAchieved, target: r.totalRechargeTarget, unit: "৳" },
          ],
          search: `${r.name} ${r.employeeCode || ""} ${r.rsoMsisdn} ${r.supervisor}`.toLowerCase(),
          sortKeys: {
            recharge: pct(r.totalRechargeAchieved, r.totalRechargeTarget),
            ga: pct(r.gaAchieved, r.gaTarget),
            sso: pct(r.ssoAchieved, r.ssoTarget),
            lso: pct(r.lsoAchieved, r.lsoTarget),
            retailers: r.retailerCount,
          },
        }))}
        sortFields={SORT_FIELDS}
        placeholder="RSO, code, mobile or supervisor"
        noun="RSO"
        month={month}
        from={s.from}
        to={s.to}
        emptyTitle="No RSOs in this period"
        emptyHint="Widen the date range."
      />
    </main>
  );
}

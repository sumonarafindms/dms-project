import { requireUser } from "../../../../lib/auth";
import { employeePerformance } from "../../../../lib/performance";
import { teamTotals } from "../../../../lib/bp-rollup";
import { targetPercent as pct } from "../../../../lib/achievement";
import { normalizeMonth } from "../../../../lib/drilldown";
import { PageHeader, SummaryStrip } from "../../../components/Kit";
import { EntityGrid } from "../../../components/EntityGrid";

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
  await requireUser(["ADMIN", "IT"]);
  const s = await searchParams,
    month = normalizeMonth(s.from?.slice(0, 7) || s.month),
    rows = await employeePerformance(`${month}-01`, undefined, s.from, s.to);
  // The strip is a COMPANY total, so Business Partners count; the grid below is
  // per-RSO and stays as the rows come. See lib/bp-rollup.ts.
  const company = teamTotals(rows);
  const t = company.totalRechargeTarget,
    a = company.totalRechargeAchieved;
  return (
    <main className="page">
      <PageHeader
        title="RSO Performance"
        subtitle="Every RSO, assigned retailers and execution across the selected dates."
      />
      <SummaryStrip
        items={[
          { label: "RSOs", value: rows.length.toLocaleString() },
          { label: "Retailers", value: company.retailerCount.toLocaleString() },
          { label: "Achieved", value: `৳${Math.round(a).toLocaleString()}`, tone: "teal" },
          { label: "Remaining", value: `৳${Math.max(0, Math.round(t - a)).toLocaleString()}`, tone: "amber" },
        ]}
      />
      <EntityGrid
        rows={rows.map((r) => ({
          id: r.employeeId,
          href: `/admin/rsos/${r.employeeId}?month=${month}${s.from ? `&from=${s.from}` : ""}${s.to ? `&to=${s.to}` : ""}`,
          eyebrow: "RSO",
          name: r.name,
          code: `${r.employeeCode || r.rsoMsisdn} · ${r.supervisor} · ${r.retailerCount} retailers`,
          percent: pct(r.totalRechargeAchieved, r.totalRechargeTarget),
          metrics: [
            { label: "GA", achieved: r.gaAchieved, target: r.gaTarget },
            { label: "SSO", achieved: r.ssoAchieved, target: r.ssoTarget },
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
        emptyTitle="No RSO performance found"
        emptyHint="Try another period."
      />
    </main>
  );
}

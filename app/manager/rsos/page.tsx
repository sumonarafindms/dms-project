import { requirePagePermission } from "../../../lib/auth";
import { employeePerformance, pct } from "../../../lib/performance";
import { FilterForm } from "../../components/DrillUI";
import { normalizeMonth } from "../../../lib/drilldown";
import { managerScope } from "../../../lib/manager-scope";
import { Card, EmptyState, EntityCard, PageHeader, SectionHead, SummaryStrip } from "../../components/Kit";
import { Icon } from "../../components/icons";
import { ACHIEVEMENT_ON_TRACK_PERCENT } from "../../../lib/achievement";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; month?: string; from?: string; to?: string }>;
}) {
  const u = await requirePagePermission(["MANAGER"], "performance"),
    s = await searchParams,
    scope = await managerScope(u.id),
    q = (s.q || "").toLowerCase(),
    month = normalizeMonth(s.from?.slice(0, 7) || s.month);
  const all = await employeePerformance(`${month}-01`, scope.employeeIds, s.from, s.to);
  const rows = all
    .filter((r) => !q || `${r.name} ${r.employeeCode || ""} ${r.rsoMsisdn} ${r.supervisor}`.toLowerCase().includes(q))
    .sort(
      (a, b) =>
        pct(b.totalRechargeAchieved, b.totalRechargeTarget) - pct(a.totalRechargeAchieved, a.totalRechargeTarget),
    );
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
      <div className="no-print" style={{ marginBottom: "1rem" }}>
        <FilterForm
          q={s.q || ""}
          month={month}
          from={s.from}
          to={s.to}
          dateRange
          placeholder="RSO, code, mobile or supervisor"
        />
      </div>
      <SectionHead title={`${rows.length} RSOs`} sub="Highest target progress appears first." />
      {rows.length ? (
        <div className="kit-card-grid">
          {rows.map((r) => (
            <EntityCard
              key={r.employeeId}
              href={`/manager/rsos/${r.employeeId}?month=${month}${s.from ? `&from=${s.from}` : ""}${s.to ? `&to=${s.to}` : ""}`}
              eyebrow="RSO"
              name={r.name}
              code={`${r.employeeCode || r.rsoMsisdn} · ${r.supervisor}`}
              percent={pct(r.totalRechargeAchieved, r.totalRechargeTarget)}
              metrics={[
                { label: "GA", achieved: r.gaAchieved, target: r.gaTarget },
                { label: "LSO", achieved: r.lsoAchieved, target: r.lsoTarget },
                { label: "Recharge", achieved: r.totalRechargeAchieved, target: r.totalRechargeTarget, unit: "৳" },
              ]}
            />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            title="No RSOs match this filter"
            hint="Clear the search or widen the date range."
            icon={<Icon name="search" />}
          />
        </Card>
      )}
    </main>
  );
}

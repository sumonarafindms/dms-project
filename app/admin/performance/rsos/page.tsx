import { requireUser } from "../../../../lib/auth";
import { employeePerformance, pct } from "../../../../lib/performance";
import { normalizeMonth } from "../../../../lib/drilldown";
import { Card, EmptyState, EntityCard, PageHeader, SectionHead, SummaryStrip } from "../../../components/Kit";
import { FilterForm } from "../../../components/DrillUI";
import { Icon } from "../../../components/icons";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; month?: string; from?: string; to?: string }>;
}) {
  await requireUser(["ADMIN", "IT"]);
  const s = await searchParams,
    q = (s.q || "").toLowerCase(),
    month = normalizeMonth(s.from?.slice(0, 7) || s.month),
    all = await employeePerformance(`${month}-01`, undefined, s.from, s.to),
    rows = all
      .filter((r) => !q || `${r.name} ${r.employeeCode || ""} ${r.rsoMsisdn} ${r.supervisor}`.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          pct(b.totalRechargeAchieved, b.totalRechargeTarget) - pct(a.totalRechargeAchieved, a.totalRechargeTarget),
      );
  const t = rows.reduce((a, x) => a + x.totalRechargeTarget, 0),
    a = rows.reduce((n, x) => n + x.totalRechargeAchieved, 0);
  return (
    <main className="page">
      <PageHeader
        title="RSO Performance"
        subtitle="Every RSO, assigned retailers and execution across the selected dates."
      />
      <FilterForm
        dateRange
        q={s.q || ""}
        month={month}
        from={s.from}
        to={s.to}
        placeholder="RSO, code, mobile or supervisor"
      />
      <SummaryStrip
        items={[
          { label: "RSOs", value: rows.length.toLocaleString() },
          { label: "Retailers", value: rows.reduce((n, x) => n + x.retailerCount, 0).toLocaleString() },
          { label: "Achieved", value: `৳${Math.round(a).toLocaleString()}`, tone: "teal" },
          { label: "Remaining", value: `৳${Math.max(0, Math.round(t - a)).toLocaleString()}`, tone: "amber" },
        ]}
      />
      <SectionHead title={`${rows.length} RSOs`} sub="Ranked by recharge achievement." />
      {rows.length ? (
        <div className="kit-card-grid">
          {rows.map((r) => (
            <EntityCard
              key={r.employeeId}
              href={`/admin/rsos/${r.employeeId}?month=${month}${s.from ? `&from=${s.from}` : ""}${s.to ? `&to=${s.to}` : ""}`}
              eyebrow="RSO"
              name={r.name}
              code={`${r.employeeCode || r.rsoMsisdn} · ${r.supervisor} · ${r.retailerCount} retailers`}
              percent={pct(r.totalRechargeAchieved, r.totalRechargeTarget)}
              metrics={[
                { label: "GA", achieved: r.gaAchieved, target: r.gaTarget },
                { label: "SSO", achieved: r.ssoAchieved, target: r.ssoTarget },
                { label: "LSO", achieved: r.lsoAchieved, target: r.lsoTarget },
              ]}
            />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            title="No RSO performance found"
            hint="Try another period or search term."
            icon={<Icon name="search" />}
          />
        </Card>
      )}
    </main>
  );
}

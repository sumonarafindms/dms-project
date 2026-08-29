import { requireUser } from "../../../../lib/auth";
import { listBpAssignments } from "../../../../lib/bp-activations";
import { normalizeMonth } from "../../../../lib/drilldown";
import { Card, EmptyState, EntityCard, PageHeader, SectionHead, SummaryStrip } from "../../../components/Kit";
import { FilterForm } from "../../../components/DrillUI";
import { Icon } from "../../../components/icons";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; month?: string; from?: string; to?: string }>;
}) {
  const u = await requireUser(["ADMIN", "IT"]),
    s = await searchParams,
    month = normalizeMonth(s.from?.slice(0, 7) || s.month),
    data = await listBpAssignments(u, month, s.q, s.from, s.to);
  const rows = data.assignments,
    totalT = rows.reduce((a, x) => a + x.gaTarget, 0),
    totalA = rows.reduce((a, x) => a + x.monthGa, 0);
  return (
    <main className="page">
      <PageHeader title="BP Performance" subtitle="BP assignments, RSO ownership and SIM activation performance." />
      <FilterForm dateRange q={s.q || ""} month={month} from={s.from} to={s.to} placeholder="BP code, BP name or RSO" />
      <SummaryStrip
        items={[
          { label: "BP Assignments", value: rows.length.toLocaleString() },
          { label: "GA Target", value: totalT.toLocaleString() },
          { label: "GA Achieved", value: totalA.toLocaleString(), tone: "teal" },
          { label: "GA Remaining", value: Math.max(0, totalT - totalA).toLocaleString(), tone: "amber" },
        ]}
      />
      <SectionHead title={`${rows.length} BP assignments`} sub="Each BP against its own GA target." />
      {rows.length ? (
        <div className="kit-card-grid">
          {rows.map((b) => (
            <EntityCard
              key={b.id}
              href={`/admin/performance/bps/${b.id}?month=${month}${s.from ? `&from=${s.from}` : ""}${s.to ? `&to=${s.to}` : ""}`}
              eyebrow="BP"
              name={b.retailer.retailerName || b.retailer.retailerCode}
              code={`${b.retailer.retailerCode} · RSO ${b.employee.name}`}
              percent={b.gaTarget ? Math.round((b.monthGa / b.gaTarget) * 100) : 0}
              metrics={[{ label: "SIM Sales", achieved: b.monthGa, target: b.gaTarget }]}
            />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            title="No BP performance found"
            hint="Try another period, or assign a BP from Admin → BP Management."
            icon={<Icon name="search" />}
          />
        </Card>
      )}
    </main>
  );
}

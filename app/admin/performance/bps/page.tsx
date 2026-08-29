import { requireUser } from "../../../../lib/auth";
import { listBpAssignments } from "../../../../lib/bp-activations";
import { normalizeMonth } from "../../../../lib/drilldown";
import { PageHeader, SummaryStrip } from "../../../components/Kit";
import { EntityGrid } from "../../../components/EntityGrid";
// A plain description, not comparators: functions cannot cross the
// Server-to-Client boundary.
const SORT_FIELDS = [
  { key: "pct", label: "GA target %" },
  { key: "ga", label: "SIM sales" },
  { key: "target", label: "GA target", bothWays: false },
];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; from?: string; to?: string }>;
}) {
  const u = await requireUser(["ADMIN", "IT"]),
    s = await searchParams,
    month = normalizeMonth(s.from?.slice(0, 7) || s.month),
    // No `q`: the browser filters the list now.
    data = await listBpAssignments(u, month, undefined, s.from, s.to);
  const rows = data.assignments,
    totalT = rows.reduce((a, x) => a + x.gaTarget, 0),
    totalA = rows.reduce((a, x) => a + x.monthGa, 0);
  return (
    <main className="page">
      <PageHeader title="BP Performance" subtitle="BP assignments, RSO ownership and SIM activation performance." />
      <SummaryStrip
        items={[
          { label: "BP Assignments", value: rows.length.toLocaleString() },
          { label: "GA Target", value: totalT.toLocaleString() },
          { label: "GA Achieved", value: totalA.toLocaleString(), tone: "teal" },
          { label: "GA Remaining", value: Math.max(0, totalT - totalA).toLocaleString(), tone: "amber" },
        ]}
      />
      <EntityGrid
        rows={rows.map((b) => ({
          id: b.id,
          href: `/admin/performance/bps/${b.id}?month=${month}${s.from ? `&from=${s.from}` : ""}${s.to ? `&to=${s.to}` : ""}`,
          eyebrow: "BP",
          name: b.retailer.retailerName || b.retailer.retailerCode,
          code: `${b.retailer.retailerCode} · RSO ${b.employee.name}`,
          percent: b.gaTarget ? Math.round((b.monthGa / b.gaTarget) * 100) : 0,
          metrics: [{ label: "SIM Sales", achieved: b.monthGa, target: b.gaTarget }],
          search: `${b.retailer.retailerCode} ${b.retailer.retailerName || ""} ${b.employee.name}`.toLowerCase(),
          sortKeys: {
            pct: b.gaTarget ? Math.round((b.monthGa / b.gaTarget) * 100) : 0,
            ga: b.monthGa,
            target: b.gaTarget,
          },
        }))}
        sortFields={SORT_FIELDS}
        placeholder="BP code, BP name or RSO"
        noun="BP assignment"
        month={month}
        from={s.from}
        to={s.to}
        emptyTitle="No BP performance found"
        emptyHint="Try another period, or assign a BP from Admin → BP Management."
      />
    </main>
  );
}

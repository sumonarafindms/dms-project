import { bpDisplayName } from "../../../../lib/bp-name";
import { requireUser } from "../../../../lib/auth";
import { listBpAssignments } from "../../../../lib/bp-activations";
import { normalizeMonth } from "../../../../lib/drilldown";
import { GA_CATEGORY_LABEL, addTiers, noTiers, type GaTiers } from "../../../../lib/ga-category";
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
    data = await listBpAssignments(u, month, s.from, s.to);
  const rows = data.assignments;
  /*
   * The strip counts OUTLETS; the grid below lists ASSIGNMENTS.
   *
   * A retailer can be a Business Partner under several RSOs at once, so it
   * appears once per holder in this list — correctly, because each of those is
   * a real assignment with its own RSO and its own target. But each holder's
   * row carries that outlet's WHOLE GA, so `rows.reduce(...)` counted the same
   * SIMs once per holder: on real data, five assignments over four outlets
   * reported 68 GA against a 140 target where the truth was 47 against 115.
   *
   * Keyed by retailer, so a shared outlet contributes once. Where two holders
   * were given different targets by hand, the largest stands — the same rule
   * lib/bp-ledger.ts applies, and it never quietly lowers the goal.
   */
  const byOutlet = new Map<string, { target: number; achieved: GaTiers }>();
  for (const x of rows) {
    const prev = byOutlet.get(x.retailerId);
    byOutlet.set(x.retailerId, {
      target: Math.max(prev?.target ?? 0, x.gaTarget),
      // The whole tier triple is carried, so the summary strip's split is
      // de-duplicated by outlet exactly as its total already was.
      achieved: (prev?.achieved.total ?? 0) >= x.monthGa.total ? (prev?.achieved ?? noTiers()) : x.monthGa,
    });
  }
  const totalT = [...byOutlet.values()].reduce((a, x) => a + x.target, 0),
    totalTiers = [...byOutlet.values()].reduce<GaTiers>((a, x) => addTiers(a, x.achieved), noTiers()),
    totalA = totalTiers.total;
  return (
    <main className="page">
      <PageHeader title="BP Performance" subtitle="BP assignments, RSO ownership and SIM activation performance." />
      <SummaryStrip
        items={[
          {
            label: byOutlet.size === rows.length ? "BP Assignments" : "BPs",
            // Named for what it counts. When one outlet is held by several
            // RSOs the two numbers differ, and "12 assignments" beside a GA
            // total covering 9 outlets is the kind of mismatch nobody can
            // reconcile from the screen.
            value: byOutlet.size.toLocaleString("en-US"),
          },
          { label: "GA Target", value: totalT.toLocaleString("en-US") },
          { label: "GA Achieved", value: totalA.toLocaleString("en-US"), tone: "brand" },
          { label: GA_CATEGORY_LABEL.GA_170, value: totalTiers.ga170.toLocaleString("en-US") },
          { label: GA_CATEGORY_LABEL.GA_300, value: totalTiers.ga300.toLocaleString("en-US") },
          { label: "GA Remaining", value: Math.max(0, totalT - totalA).toLocaleString("en-US"), tone: "amber" },
        ]}
      />
      <EntityGrid
        rows={rows.map((b) => ({
          id: b.id,
          href: `/admin/performance/bps/${b.id}?month=${month}${s.from ? `&from=${s.from}` : ""}${s.to ? `&to=${s.to}` : ""}`,
          eyebrow: "BP",
          name: bpDisplayName(b.retailer),
          code: `${b.retailer.retailerCode} · RSO ${b.employee.name}`,
          percent: b.gaTarget ? Math.round((b.monthGa.total / b.gaTarget) * 100) : 0,
          metrics: [{ label: "SIM Sales", achieved: b.monthGa.total, target: b.gaTarget, tiers: b.monthGa }],
          search:
            `${b.retailer.retailerCode} ${b.retailer.retailerName || ""} ${b.retailer.bpName || ""} ${b.employee.name}`.toLowerCase(),
          sortKeys: {
            pct: b.gaTarget ? Math.round((b.monthGa.total / b.gaTarget) * 100) : 0,
            ga: b.monthGa.total,
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

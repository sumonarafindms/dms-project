/**
 * Entity performance — one route serving supervisor, RSO, BP and retailer.
 *
 * The demo has four separate shortcuts but they are one report ranked over
 * four different populations, so `kind` is a route parameter rather than four
 * near-identical files (Rule 9).
 *
 * Retailers have no targets in this schema, so the retailer view ranks by GA
 * volume and shows SSO/LSO status instead of an achievement percentage. It
 * does not display a target column that would have to be invented.
 *
 * The rank is carried on the row rather than derived while rendering — see
 * `PerformanceRow.rank` in lib/report-builders.ts for what that replaced.
 */

import { notFound } from "next/navigation";
import { requireUser } from "../../../../../lib/auth";
import { resolveRange } from "../../../../../lib/report-range";
import {
  PERFORMANCE_KINDS,
  buildPerformance,
  isPerformanceKind,
  reportExportHref,
  searchReport,
} from "../../../../../lib/report-builders";
import type { PerformanceRow } from "../../../../../lib/report-builders";
import { reportPageHref } from "../../../../../lib/report-paging";
import { targetPercent } from "../../../../../lib/achievement";
import { Badge } from "../../../../components/Kit";
import { GroupedReportView, money } from "../../GroupedReportView";
import type { Column } from "../../../../components/ReportTable";

export const dynamic = "force-dynamic";

export default async function Performance({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{ from?: string; to?: string; page?: string; q?: string }>;
}) {
  await requireUser(["ADMIN", "IT"]);
  const { kind: raw } = await params;
  if (!isPerformanceKind(raw)) notFound();
  const kind = raw;
  const sp = await searchParams;
  const range = resolveRange(sp.from, sp.to);
  const built = await buildPerformance(range, kind);
  const { rows, matched, unfiltered } = searchReport(built, sp.q);

  const hasTargets = kind !== "retailer";
  const columns: Column<PerformanceRow>[] = [
    { key: "rank", label: "#", render: (r) => r.rank },
    { key: "name", label: PERFORMANCE_KINDS[kind].replace(" Performance", "") },
    { key: "code", label: "Code" },
    { key: "sub", label: kind === "supervisor" ? "Coverage" : kind === "bp" ? "RSO" : "Supervisor / RSO" },
    { key: "achieved", label: "GA", align: "right", render: (r) => r.achieved.toLocaleString("en-US") },
    ...(hasTargets
      ? ([
          {
            key: "target",
            label: "Target",
            align: "right",
            // v200: a target nobody set is "—", not 0 (the v175 rule).
            render: (r: PerformanceRow) => (r.target ? r.target.toLocaleString("en-US") : "—"),
          },
          {
            key: "pct",
            label: "Achievement %",
            align: "right",
            render: (r: PerformanceRow) => (r.target ? `${targetPercent(r.achieved, r.target)}%` : "—"),
          },
        ] as Column<PerformanceRow>[])
      : ([
          { key: "c2c", label: "C2C", align: "right", render: (r: PerformanceRow) => money(r.c2c ?? 0) },
          { key: "c2s", label: "C2S", align: "right", render: (r: PerformanceRow) => money(r.c2s ?? 0) },
          {
            key: "extra",
            label: "Execution",
            render: (r: PerformanceRow) => (
              <span className="kit-inline-group">
                <Badge tone={r.ssoComplete ? "complete" : "pending"}>SSO</Badge>
                <Badge tone={r.lsoComplete ? "complete" : "pending"}>LSO</Badge>
              </span>
            ),
          },
        ] as Column<PerformanceRow>[])),
  ];

  /*
   * For a PERSON grouping the strip is the company, not the sum of the rows.
   *
   * An RSO row is that RSO's own credit with the BP share held aside, so
   * adding them drops it; a supervisor row counts a shared outlet once per
   * team, so adding the teams counts it twice. `companyTotals` does neither.
   * For `retailer` the rows ARE the things themselves, so the sum is the
   * right total there; for `bp`, see below.
   */
  const company = built.totals;
  /*
   * v200: for `bp`, one outlet once. Since v142 an outlet can be held by two
   * RSOs at the same time, and there is a row per ASSIGNMENT — each counting
   * the whole outlet — so adding the rows showed an outlet of 40 GA as 80.
   * Rows are summed per BP code, taking each outlet's figure once.
   */
  const perOutlet = (pick: (r: (typeof rows)[number]) => number) => {
    if (kind !== "bp") return rows.reduce((a, r) => a + pick(r), 0);
    const seen = new Map<string, number>();
    for (const r of rows) {
      const k = r.code && r.code !== "—" ? r.code : r.id;
      seen.set(k, Math.max(seen.get(k) ?? 0, pick(r)));
    }
    return [...seen.values()].reduce((a, v) => a + v, 0);
  };
  const totalAchieved = company ? company.ga : perOutlet((r) => r.achieved);
  const totalTarget = company ? company.gaTarget : perOutlet((r) => r.target);
  const behind = hasTargets
    ? rows.filter((r) => r.target > 0 && targetPercent(r.achieved, r.target) < 80).length
    : rows.filter((r) => r.achieved === 0).length;

  // One instant for both renders — see ReportDateBar's nowIso.

  const nowIso = new Date().toISOString();

  return (
    <GroupedReportView
      title={PERFORMANCE_KINDS[kind]}
      subtitle={hasTargets ? "Ranked by achievement" : "Ranked by GA volume"}
      range={range}
      nowIso={nowIso}
      rows={rows}
      columns={columns}
      exportHref={reportExportHref("performance", range, { kind })}
      search={{ matched, total: unfiltered, noun: kind === "retailer" ? "retailer" : kind === "bp" ? "BP" : kind }}
      paging={{
        page: sp.page,
        noun: kind === "retailer" ? "retailer" : kind === "bp" ? "BP" : kind,
        hrefFor: (p) =>
          reportPageHref(`/it/reports/performance/${kind}`, { from: range.from, to: range.to, q: sp.q }, p),
      }}
      summaryItems={[
        { label: "Total GA", value: totalAchieved.toLocaleString("en-US"), tone: "brand" },
        ...(hasTargets
          ? [
              { label: "Total Target", value: totalTarget ? totalTarget.toLocaleString("en-US") : "—" },
              { label: "Achievement", value: totalTarget ? `${targetPercent(totalAchieved, totalTarget)}%` : "—" },
              { label: "Behind Target", value: behind.toLocaleString("en-US"), tone: "amber" as const },
            ]
          : [
              { label: "Retailers", value: rows.length.toLocaleString("en-US") },
              { label: "Zero GA", value: behind.toLocaleString("en-US"), tone: "amber" as const },
            ]),
      ]}
      emptyTitle={`No ${kind} data for this period`}
      emptyHint="Check Data Readiness on the Reporting Center."
    />
  );
}

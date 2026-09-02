/**
 * Target vs Achievement — every metric that actually has a target, side by
 * side, grouped by supervisor or RSO.
 *
 * The metrics shown are exactly the ones MonthlyTarget carries: GA, C2C, SSO,
 * LSO and Total Recharge. C2S has no target column in this schema, so it is
 * absent rather than shown against a zero that would read as "target missed".
 */

import { requireUser } from "../../../../lib/auth";
import { resolveRange } from "../../../../lib/report-range";
import { rollUpToSupervisor, rsoSummary } from "../../../../lib/report-data";
import type { RsoSummaryRow } from "../../../../lib/report-data";
import { targetPercent } from "../../../../lib/achievement";
import { GroupSwitch, GroupedReportView, money } from "../GroupedReportView";
import type { Column } from "../../../components/ReportTable";

export const dynamic = "force-dynamic";

const GROUPS = [
  { key: "supervisor", label: "By Supervisor" },
  { key: "rso", label: "By RSO" },
] as const;

const pctCell = (a: number, t: number) => (t ? `${targetPercent(a, t)}%` : "—");

export default async function TargetReport({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; group?: string }>;
}) {
  await requireUser(["ADMIN", "IT"]);
  const sp = await searchParams;
  const range = resolveRange(sp.from, sp.to);
  const group = GROUPS.find((g) => g.key === sp.group)?.key ?? "supervisor";

  const summary = await rsoSummary(range);
  const rows = group === "supervisor" ? rollUpToSupervisor(summary) : summary;
  const ordered = [...rows].sort(
    (a, b) => targetPercent(b.ga, b.gaTarget) - targetPercent(a.ga, a.gaTarget) || a.name.localeCompare(b.name),
  );

  const columns: Column<RsoSummaryRow>[] = [
    { key: "name", label: group === "supervisor" ? "Supervisor" : "RSO" },
    { key: "ga", label: "GA", align: "right", render: (r) => `${r.ga} / ${r.gaTarget}` },
    { key: "gaPct", label: "GA %", align: "right", render: (r) => pctCell(r.ga, r.gaTarget) },
    { key: "sso", label: "SSO", align: "right", render: (r) => `${r.sso} / ${r.ssoTarget}` },
    { key: "ssoPct", label: "SSO %", align: "right", render: (r) => pctCell(r.sso, r.ssoTarget) },
    { key: "lso", label: "LSO", align: "right", render: (r) => `${r.lso} / ${r.lsoTarget}` },
    { key: "lsoPct", label: "LSO %", align: "right", render: (r) => pctCell(r.lso, r.lsoTarget) },
    { key: "c2c", label: "C2C", align: "right", render: (r) => money(r.c2c) },
    { key: "c2cPct", label: "C2C %", align: "right", render: (r) => pctCell(r.c2c, r.c2cTarget) },
  ];

  const t = ordered.reduce(
    (a, r) => ({
      ga: a.ga + r.ga,
      gaTarget: a.gaTarget + r.gaTarget,
      sso: a.sso + r.sso,
      ssoTarget: a.ssoTarget + r.ssoTarget,
      lso: a.lso + r.lso,
      lsoTarget: a.lsoTarget + r.lsoTarget,
    }),
    { ga: 0, gaTarget: 0, sso: 0, ssoTarget: 0, lso: 0, lsoTarget: 0 },
  );

  return (
    <GroupedReportView
      title="Target vs Achievement"
      subtitle="GA, SSO, LSO and C2C against monthly targets"
      range={range}
      rows={ordered}
      columns={columns}
      exportRows={ordered.map((r) => ({
        Name: r.name,
        GA: r.ga,
        "GA Target": r.gaTarget,
        "GA %": r.gaTarget ? targetPercent(r.ga, r.gaTarget) : "",
        SSO: r.sso,
        "SSO Target": r.ssoTarget,
        LSO: r.lso,
        "LSO Target": r.lsoTarget,
        C2C: Math.round(r.c2c),
        "C2C Target": Math.round(r.c2cTarget),
      }))}
      summaryItems={[
        { label: "GA", value: `${t.ga} / ${t.gaTarget}`, tone: "teal" },
        { label: "GA Achievement", value: pctCell(t.ga, t.gaTarget) },
        { label: "SSO", value: `${t.sso} / ${t.ssoTarget}` },
        { label: "LSO", value: `${t.lso} / ${t.lsoTarget}` },
      ]}
      filename={`target-vs-achievement-${group}`}
      emptyTitle="No targets or achievement for this period"
      emptyHint="Targets are set per RSO per month on the Targets page."
    >
      <GroupSwitch
        basePath="/it/reports/target"
        range={range}
        options={GROUPS}
        active={group}
        defaultKey="supervisor"
      />
    </GroupedReportView>
  );
}

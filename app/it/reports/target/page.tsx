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
import {
  TARGET_GROUPS,
  buildTarget,
  reportExportHref,
  targetGroup,
  searchReport,
} from "../../../../lib/report-builders";
import { reportPageHref } from "../../../../lib/report-paging";
import type { RsoSummaryRow } from "../../../../lib/report-data";
import { targetPercent } from "../../../../lib/achievement";
import { GroupSwitch, GroupedReportView, money } from "../GroupedReportView";
import type { Column } from "../../../components/ReportTable";

export const dynamic = "force-dynamic";

const pctCell = (a: number, t: number) => (t ? `${targetPercent(a, t)}%` : "—");

export default async function TargetReport({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; group?: string; page?: string; q?: string }>;
}) {
  await requireUser(["ADMIN", "IT"]);
  const sp = await searchParams;
  const range = resolveRange(sp.from, sp.to);
  const group = targetGroup(sp.group);
  const { rows, matched, unfiltered } = searchReport(await buildTarget(range, group), sp.q);

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

  const t = rows.reduce(
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

  const groupParam = group === "supervisor" ? undefined : group;

  return (
    <GroupedReportView
      title="Target vs Achievement"
      subtitle="GA, SSO, LSO and C2C against monthly targets"
      range={range}
      rows={rows}
      columns={columns}
      exportHref={reportExportHref("target", range, groupParam ? { group: groupParam } : {})}
      search={{ matched, total: unfiltered, noun: "row" }}
      paging={{
        page: sp.page,
        noun: group === "supervisor" ? "supervisor" : "RSO",
        hrefFor: (p) => reportPageHref("/it/reports/target", { from: range.from, to: range.to, group: groupParam }, p),
      }}
      summaryItems={[
        { label: "GA", value: `${t.ga} / ${t.gaTarget}`, tone: "teal" },
        { label: "GA Achievement", value: pctCell(t.ga, t.gaTarget) },
        { label: "SSO", value: `${t.sso} / ${t.ssoTarget}` },
        { label: "LSO", value: `${t.lso} / ${t.lsoTarget}` },
      ]}
      emptyTitle="No targets or achievement for this period"
      emptyHint="Targets are set per RSO per month on the Targets page."
    >
      <GroupSwitch
        basePath="/it/reports/target"
        range={range}
        options={TARGET_GROUPS}
        active={group}
        defaultKey="supervisor"
      />
    </GroupedReportView>
  );
}

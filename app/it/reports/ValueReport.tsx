/**
 * C2C and C2S are the same report over a different column, so they are one
 * component with a `metric` prop rather than two near-identical files.
 *
 * Only C2C carries a target in this schema — MonthlyTarget has c2cTarget but
 * no c2sTarget. The C2S view therefore shows value and share of total, and
 * simply does not show an achievement column, rather than inventing a target
 * to fill the space.
 */

import { VALUE_GROUPS, buildValue, reportExportHref } from "../../../lib/report-builders";
import type { ValueGroup, ValueRow } from "../../../lib/report-builders";
import { reportPageHref } from "../../../lib/report-paging";
import type { ReportRange } from "../../../lib/report-range";
import { targetPercent } from "../../../lib/achievement";
import { GroupSwitch, GroupedReportView, money } from "./GroupedReportView";
import type { Column } from "../../components/ReportTable";

export { VALUE_GROUPS };
export type { ValueGroup };

export async function ValueReport({
  metric,
  range,
  group,
  page,
}: {
  metric: "c2c" | "c2s";
  range: ReportRange;
  group: ValueGroup;
  page?: string;
}) {
  const label = metric.toUpperCase();
  const hasTarget = metric === "c2c";
  const showTarget = hasTarget && group !== "retailer";
  const { rows, total, totalTarget } = await buildValue(range, metric, group);

  const columns: Column<ValueRow>[] = [
    { key: "name", label: group === "retailer" ? "Retailer" : group === "rso" ? "RSO" : "Supervisor" },
    { key: "code", label: "Code" },
    { key: "sub", label: group === "supervisor" ? "Coverage" : group === "rso" ? "Supervisor" : "Supervisor / RSO" },
    { key: "value", label: `${label} Value`, align: "right", render: (r) => money(r.value) },
    ...(showTarget
      ? ([
          { key: "target", label: "Target", align: "right", render: (r: ValueRow) => money(r.target) },
          {
            key: "pct",
            label: "Achievement %",
            align: "right",
            render: (r: ValueRow) => (r.target ? `${targetPercent(r.value, r.target)}%` : "—"),
          },
        ] as Column<ValueRow>[])
      : []),
    {
      key: "share",
      label: "Share",
      align: "right",
      render: (r) => (total ? `${Math.round((r.value / total) * 1000) / 10}%` : "—"),
    },
  ];

  const groupParam = group === "supervisor" ? undefined : group;

  return (
    <GroupedReportView
      title={`${label} Report`}
      subtitle={hasTarget ? "Value against target" : "Retail sales value"}
      range={range}
      rows={rows}
      columns={columns}
      exportHref={reportExportHref(metric, range, groupParam ? { group: groupParam } : {})}
      paging={{
        page,
        noun: group === "retailer" ? "retailer" : "row",
        hrefFor: (p) =>
          reportPageHref(`/it/reports/${metric}`, { from: range.from, to: range.to, group: groupParam }, p),
      }}
      summaryItems={[
        { label: `Total ${label}`, value: money(total), tone: "teal" },
        ...(showTarget
          ? [
              { label: "Total Target", value: money(totalTarget) },
              { label: "Achievement", value: totalTarget ? `${targetPercent(total, totalTarget)}%` : "—" },
            ]
          : [{ label: "Rows With Value", value: rows.filter((r) => r.value > 0).length.toLocaleString() }]),
        { label: "Rows", value: rows.length.toLocaleString() },
      ]}
      emptyTitle={`No ${label} for this period`}
      emptyHint={`Check Data Readiness — the ${label} feed may not be imported for these dates.`}
    >
      <GroupSwitch
        basePath={`/it/reports/${metric}`}
        range={range}
        options={VALUE_GROUPS}
        active={group}
        defaultKey="supervisor"
      />
    </GroupedReportView>
  );
}

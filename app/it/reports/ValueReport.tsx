/**
 * C2C and C2S are the same report over a different column, so they are one
 * component with a `metric` prop rather than two near-identical files.
 *
 * Only C2C carries a target in this schema — MonthlyTarget has c2cTarget but
 * no c2sTarget. The C2S view therefore shows value and share of total, and
 * simply does not show an achievement column, rather than inventing a target
 * to fill the space.
 */

import { retailerReport, rollUpToSupervisor, rsoSummary } from "../../../lib/report-data";
import type { ReportRange } from "../../../lib/report-range";
import { targetPercent } from "../../../lib/achievement";
import { GroupSwitch, GroupedReportView, money } from "./GroupedReportView";
import type { Column } from "../../components/ReportTable";

export const VALUE_GROUPS = [
  { key: "supervisor", label: "By Supervisor" },
  { key: "rso", label: "By RSO" },
  { key: "retailer", label: "By Retailer" },
] as const;
export type ValueGroup = (typeof VALUE_GROUPS)[number]["key"];

type Row = { id: string; name: string; code: string; sub: string; value: number; target: number };

export async function ValueReport({
  metric,
  range,
  group,
}: {
  metric: "c2c" | "c2s";
  range: ReportRange;
  group: ValueGroup;
}) {
  const label = metric.toUpperCase();
  const hasTarget = metric === "c2c";

  let rows: Row[];
  if (group === "retailer") {
    const retailers = await retailerReport(range);
    rows = retailers.map((r) => ({
      id: r.id,
      name: r.retailerName,
      code: r.retailerCode,
      sub: `${r.supervisor} / ${r.employeeName}`,
      value: metric === "c2c" ? r.c2c : r.c2s,
      target: 0, // no per-retailer targets exist in this schema
    }));
  } else {
    const summary = await rsoSummary(range);
    const source = group === "supervisor" ? rollUpToSupervisor(summary) : summary;
    rows = source.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      sub: group === "supervisor" ? `${r.retailerCount.toLocaleString()} retailers` : r.supervisor,
      value: metric === "c2c" ? r.c2c : r.c2s,
      target: metric === "c2c" ? r.c2cTarget : 0,
    }));
  }

  const ordered = [...rows].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const total = ordered.reduce((a, r) => a + r.value, 0);
  const totalTarget = ordered.reduce((a, r) => a + r.target, 0);

  const columns: Column<Row>[] = [
    { key: "name", label: group === "retailer" ? "Retailer" : group === "rso" ? "RSO" : "Supervisor" },
    { key: "code", label: "Code" },
    { key: "sub", label: group === "supervisor" ? "Coverage" : group === "rso" ? "Supervisor" : "Supervisor / RSO" },
    { key: "value", label: `${label} Value`, align: "right", render: (r) => money(r.value) },
    ...(hasTarget && group !== "retailer"
      ? ([
          { key: "target", label: "Target", align: "right", render: (r: Row) => money(r.target) },
          {
            key: "pct",
            label: "Achievement %",
            align: "right",
            render: (r: Row) => (r.target ? `${targetPercent(r.value, r.target)}%` : "—"),
          },
        ] as Column<Row>[])
      : []),
    {
      key: "share",
      label: "Share",
      align: "right",
      render: (r) => (total ? `${Math.round((r.value / total) * 1000) / 10}%` : "—"),
    },
  ];

  return (
    <GroupedReportView
      title={`${label} Report`}
      subtitle={hasTarget ? "Value against target" : "Retail sales value"}
      range={range}
      rows={ordered}
      columns={columns}
      exportRows={ordered.map((r) => ({
        Name: r.name,
        Code: r.code,
        Context: r.sub,
        [`${label} Value`]: Math.round(r.value),
        ...(hasTarget && group !== "retailer"
          ? { Target: Math.round(r.target), "Achievement %": r.target ? targetPercent(r.value, r.target) : "" }
          : {}),
      }))}
      summaryItems={[
        { label: `Total ${label}`, value: money(total), tone: "teal" },
        ...(hasTarget && group !== "retailer"
          ? [
              { label: "Total Target", value: money(totalTarget) },
              {
                label: "Achievement",
                value: totalTarget ? `${targetPercent(total, totalTarget)}%` : "—",
              },
            ]
          : [{ label: "Rows With Value", value: ordered.filter((r) => r.value > 0).length.toLocaleString() }]),
        { label: "Rows", value: ordered.length.toLocaleString() },
      ]}
      filename={`${metric}-${group}`}
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

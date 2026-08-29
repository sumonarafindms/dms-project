/**
 * Shared body for the reports that show one dataset at a chosen grouping
 * level: C2C, C2S, Target vs Achievement, and the entity-performance reports.
 *
 * The grouping lives in the URL rather than component state, for the same
 * reason the date range does — a grouped view should be a shareable link.
 */

import Link from "next/link";
import { rangeLabel, rangeQuery } from "../../../lib/report-range";
import type { ReportRange } from "../../../lib/report-range";
import { PageHeader, SummaryStrip } from "../../components/Kit";
import { ReportActionBar, ReportDateBar, ReportTable } from "../../components/ReportShell";
import type { Column, ExportRow } from "../../components/ReportShell";
import { Icon } from "../../components/icons";

export const money = (n: number) => `৳${Math.round(n).toLocaleString()}`;

export function GroupSwitch({
  basePath,
  range,
  options,
  active,
  defaultKey,
  param = "group",
}: {
  basePath: string;
  range: ReportRange;
  options: readonly { key: string; label: string }[];
  active: string;
  defaultKey: string;
  param?: string;
}) {
  return (
    <div className="kit-report-presets no-print" style={{ marginBottom: "0.75rem" }}>
      {options.map((o) => (
        <Link
          key={o.key}
          href={`${basePath}?${rangeQuery(range, o.key === defaultKey ? {} : { [param]: o.key })}`}
          className={`kit-preset${active === o.key ? " is-active" : ""}`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

export function GroupedReportView<T extends { id?: string }>({
  title,
  subtitle,
  range,
  rows,
  columns,
  exportRows,
  summaryItems,
  filename,
  emptyTitle,
  emptyHint,
  children,
}: {
  title: string;
  subtitle: string;
  range: ReportRange;
  rows: T[];
  columns: Column<T>[];
  exportRows: ExportRow[];
  summaryItems: { label: string; value: string; tone?: "teal" | "amber" }[];
  filename: string;
  emptyTitle: string;
  emptyHint?: string;
  /** Group switch, rendered between the date bar and the summary. */
  children?: React.ReactNode;
}) {
  return (
    <main className="page">
      <Link href={`/it/reports?${rangeQuery(range)}`} className="kit-detail-back no-print">
        <Icon name="arrow" /> Back to Reports
      </Link>
      <PageHeader
        title={title}
        subtitle={`Report Period: ${rangeLabel(range)} • ${subtitle}`}
        action={<ReportActionBar filename={`${filename}-${range.from}_to_${range.to}`} rows={exportRows} />}
      />
      <ReportDateBar range={range} />
      {children}
      <SummaryStrip items={summaryItems} />
      <ReportTable columns={columns} rows={rows} emptyTitle={emptyTitle} emptyHint={emptyHint} />
    </main>
  );
}

/**
 * Shared body for the four retailer-execution reports.
 *
 * SSO Pending, LSO Pending, Low C2S and Opening Balance ask different
 * questions of the same rows, so they differ only in which rows they keep,
 * how those rows are ordered, and which columns they show. That is a props
 * difference, not four pages — extending one component with a filter and a
 * column list keeps the export, print and empty-state behaviour identical
 * across all four instead of copied four times.
 */

import Link from "next/link";
import { rangeLabel, rangeQuery } from "../../../lib/report-range";
import type { ReportRange } from "../../../lib/report-range";
import type { RetailerReportRow } from "../../../lib/report-data";
import { PageHeader, SummaryStrip } from "../../components/Kit";
import { ReportActionBar, ReportDateBar } from "../../components/ReportShell";
import { ReportTable } from "../../components/ReportTable";
import type { ExportRow } from "../../components/ReportShell";
import type { Column } from "../../components/ReportTable";
import { Icon } from "../../components/icons";

export const money = (n: number) => `৳${Math.round(n).toLocaleString()}`;

export function RetailerReportView({
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
}: {
  title: string;
  subtitle: string;
  range: ReportRange;
  rows: RetailerReportRow[];
  columns: Column<RetailerReportRow>[];
  exportRows: ExportRow[];
  summaryItems: { label: string; value: string; tone?: "teal" | "amber" }[];
  filename: string;
  emptyTitle: string;
  emptyHint?: string;
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
      <SummaryStrip items={summaryItems} />
      <ReportTable columns={columns} rows={rows} emptyTitle={emptyTitle} emptyHint={emptyHint} />
    </main>
  );
}

/** Columns every retailer report opens with. */
export const identityColumns: Column<RetailerReportRow>[] = [
  { key: "retailerName", label: "Retailer" },
  { key: "retailerCode", label: "Code" },
  { key: "supervisor", label: "Supervisor" },
  { key: "employeeName", label: "RSO" },
  { key: "bpName", label: "BP" },
];

export const identityExport = (r: RetailerReportRow) => ({
  Retailer: r.retailerName,
  Code: r.retailerCode,
  Supervisor: r.supervisor,
  RSO: r.employeeName,
  BP: r.bpName,
});

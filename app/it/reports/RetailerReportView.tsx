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

import { AppLink as Link } from "../../components/AppLink";
import { rangeLabel, rangeQuery } from "../../../lib/report-range";
import type { ReportRange } from "../../../lib/report-range";
import type { RetailerReportRow } from "../../../lib/report-data";
import { PageHeader, SummaryStrip } from "../../components/Kit";
import { ReportActionBar, ReportDateBar, ReportSearch } from "../../components/ReportShell";
import { ReportTable } from "../../components/ReportTable";
import type { Column, ReportPaging } from "../../components/ReportTable";
import { Icon } from "../../components/icons";

export const money = (n: number) => `৳${Math.round(n).toLocaleString("en-US")}`;

export function RetailerReportView({
  title,
  subtitle,
  range,
  nowIso,
  rows,
  columns,
  exportHref,
  summaryItems,
  paging,
  search,
  emptyTitle,
  emptyHint,
  children,
}: {
  title: string;
  subtitle: string;
  range: ReportRange;
  /** The server's clock, handed to ReportDateBar — see its note on nowIso. */
  nowIso: string;
  /** Every row in the report. `paging` decides how many are rendered. */
  rows: RetailerReportRow[];
  columns: Column<RetailerReportRow>[];
  /** `/api/reports/export?report=…`, carrying every parameter except `page`. */
  exportHref: string;
  summaryItems: { label: string; value: string; tone?: "brand" | "amber" }[];
  paging?: ReportPaging;
  /** Rows matching the search, and rows in the report. Omit to hide the box. */
  search?: { matched: number; total: number; noun: string };
  emptyTitle: string;
  emptyHint?: string;
  /** View switch, rendered between the date bar and the summary. */
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
        action={<ReportActionBar exportHref={exportHref} rowCount={rows.length} />}
      />
      <ReportDateBar range={range} nowIso={nowIso} />
      {children}
      <SummaryStrip items={summaryItems} />
      {search && <ReportSearch matched={search.matched} total={search.total} noun={search.noun} />}
      <ReportTable columns={columns} rows={rows} emptyTitle={emptyTitle} emptyHint={emptyHint} paging={paging} />
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

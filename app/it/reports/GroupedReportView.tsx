/**
 * Shared body for the reports that show one dataset at a chosen grouping
 * level: C2C, C2S, Target vs Achievement, and the entity-performance reports.
 *
 * The grouping lives in the URL rather than component state, for the same
 * reason the date range does — a grouped view should be a shareable link.
 */

import { AppLink as Link } from "../../components/AppLink";
import { rangeLabel, rangeQuery } from "../../../lib/report-range";
import type { ReportRange } from "../../../lib/report-range";
import { PageHeader, SummaryStrip } from "../../components/Kit";
import { ReportActionBar, ReportDateBar, ReportSearch } from "../../components/ReportShell";
import { ReportTable } from "../../components/ReportTable";
import type { Column, ReportPaging } from "../../components/ReportTable";
import { Icon } from "../../components/icons";

export const money = (n: number) => `৳${Math.round(n).toLocaleString("en-US")}`;

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
    <div className="kit-report-presets no-print kit-mb-12">
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
  rows: T[];
  columns: Column<T>[];
  /** `/api/reports/export?report=…`, carrying every parameter except `page`. */
  exportHref: string;
  summaryItems: { label: string; value: string; tone?: "brand" | "amber" }[];
  paging?: ReportPaging;
  /** Rows matching the search, and rows in the report. Omit to hide the box. */
  search?: { matched: number; total: number; noun: string };
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

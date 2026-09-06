/**
 * Daily Summary report — supervisor-wise overview for the selected period.
 *
 * The aggregation runs on the server, so the browser receives finished rows
 * rather than raw records to add up. The Excel export and the copy summary are
 * both built from those same rows, which is what guarantees the file and the
 * clipboard text match what is on screen for the current period.
 */

import Link from "next/link";
import { requireUser } from "../../../../lib/auth";
import { rangeLabel, resolveRange, rangeQuery, isMonthToDate } from "../../../../lib/report-range";
import { rangeTotals } from "../../../../lib/report-data";
import { buildDaily, reportExportHref } from "../../../../lib/report-builders";
import type { DailyRow as Row } from "../../../../lib/report-builders";
import { reportPageHref } from "../../../../lib/report-paging";
import { PageHeader, SummaryStrip } from "../../../components/Kit";
import { ReportActionBar, ReportDateBar } from "../../../components/ReportShell";
import { ReportTable } from "../../../components/ReportTable";
import type { Column } from "../../../components/ReportTable";
import { Icon } from "../../../components/icons";

export const dynamic = "force-dynamic";

const money = (n: number) => `৳${Math.round(n).toLocaleString()}`;

export default async function DailySummary({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; page?: string }>;
}) {
  await requireUser(["ADMIN", "IT"]);
  const sp = await searchParams;
  const range = resolveRange(sp.from, sp.to);
  const [{ rows }, totals] = await Promise.all([buildDaily(range), rangeTotals(range)]);

  const columns: Column<Row>[] = [
    { key: "name", label: "Supervisor" },
    { key: "rsoCount", label: "RSO", align: "right" },
    { key: "retailerCount", label: "Retailer", align: "right", render: (r) => r.retailerCount.toLocaleString() },
    { key: "standardGa", label: "GA (period)", align: "right", render: (r) => r.standardGa.toLocaleString() },
    ...(isMonthToDate(range)
      ? []
      : [{ key: "mtdGa", label: "GA (MTD)", align: "right" as const, render: (r: Row) => r.mtdGa.toLocaleString() }]),
    { key: "gaTarget", label: "Monthly GA Target", align: "right", render: (r) => r.gaTarget.toLocaleString() },
    {
      key: "achievement",
      // Named for what it divides: month-to-date GA over the monthly target.
      label: "MTD Achievement %",
      align: "right",
      render: (r) => (r.gaTarget ? `${r.achievement}%` : "—"),
    },
    { key: "c2cAmount", label: "C2C", align: "right", render: (r) => money(r.c2cAmount) },
    { key: "c2sAmount", label: "C2S", align: "right", render: (r) => money(r.c2sAmount) },
  ];

  const summary = [
    `DMS Daily Summary`,
    `Period: ${rangeLabel(range)}`,
    ``,
    `Total GA: ${totals.standardGa.toLocaleString()}`,
    `SIM Swap: ${totals.simSwap.toLocaleString()}`,
    ...(totals.unknownGa ? [`Unrecognised product codes: ${totals.unknownGa.toLocaleString()}`] : []),
    `Total C2C: ${money(totals.c2cAmount)}`,
    `Total C2S: ${money(totals.c2sAmount)} (${totals.c2sTransactions.toLocaleString()} trx)`,
    ``,
    `Supervisors: ${rows.length}`,
    `RSOs: ${rows.reduce((a, r) => a + r.rsoCount, 0)}`,
    `Retailers: ${rows.reduce((a, r) => a + r.retailerCount, 0).toLocaleString()}`,
  ].join("\n");

  return (
    <main className="page">
      <Link href={`/it/reports?${rangeQuery(range)}`} className="kit-detail-back no-print">
        <Icon name="arrow" /> Back to Reports
      </Link>
      <PageHeader
        title="Daily Summary"
        subtitle={`Report Period: ${rangeLabel(range)}`}
        action={
          <ReportActionBar exportHref={reportExportHref("daily", range)} rowCount={rows.length} summary={summary} />
        }
      />
      <ReportDateBar range={range} />
      <SummaryStrip
        items={[
          { label: "Total GA", value: totals.standardGa.toLocaleString(), tone: "teal" },
          { label: "SIM Swap", value: totals.simSwap.toLocaleString() },
          { label: "Total C2C", value: money(totals.c2cAmount) },
          { label: `Total C2S · ${totals.c2sTransactions.toLocaleString()} trx`, value: money(totals.c2sAmount) },
        ]}
      />
      <ReportTable
        columns={columns}
        rows={rows}
        paging={{
          page: sp.page,
          noun: "supervisor",
          hrefFor: (p) => reportPageHref("/it/reports/daily", { from: range.from, to: range.to }, p),
        }}
        emptyTitle="No supervisor activity for this period"
        emptyHint="Check Data Readiness on the Reporting Center — a feed may not be imported for these dates."
      />
    </main>
  );
}

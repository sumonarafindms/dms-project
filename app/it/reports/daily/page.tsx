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
import { rangeLabel, resolveRange, rangeQuery, monthToDate, isMonthToDate } from "../../../../lib/report-range";
import { supervisorSummary, rangeTotals } from "../../../../lib/report-data";
import { targetPercent } from "../../../../lib/achievement";
import { PageHeader, SummaryStrip } from "../../../components/Kit";
import { ReportActionBar, ReportDateBar, ReportTable } from "../../../components/ReportShell";
import type { Column, ExportRow } from "../../../components/ReportShell";
import { Icon } from "../../../components/icons";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  name: string;
  rsoCount: number;
  retailerCount: number;
  standardGa: number;
  mtdGa: number;
  gaTarget: number;
  achievement: number;
  c2cAmount: number;
  c2sAmount: number;
};

const money = (n: number) => `৳${Math.round(n).toLocaleString()}`;

export default async function DailySummary({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireUser(["ADMIN", "IT"]);
  const sp = await searchParams;
  const range = resolveRange(sp.from, sp.to);
  const mtd = monthToDate(range);
  const [supervisors, totals, mtdRows] = await Promise.all([
    supervisorSummary(range),
    rangeTotals(range),
    // The GA target is a MONTHLY figure. Comparing one day's activations
    // against it produced an "Achievement %" that read as catastrophic
    // under-performance every morning; month-to-date is the comparison that
    // matches the denominator. Skipped when the range already is the month.
    isMonthToDate(range) ? Promise.resolve(null) : supervisorSummary(mtd),
  ]);
  const mtdGaById = new Map((mtdRows ?? supervisors).map((r) => [r.id, r.standardGa]));

  const rows: Row[] = supervisors.map((s) => ({
    id: s.id,
    name: s.name,
    rsoCount: s.rsoCount,
    retailerCount: s.retailerCount,
    standardGa: s.standardGa,
    mtdGa: mtdGaById.get(s.id) ?? s.standardGa,
    gaTarget: s.gaTarget,
    achievement: targetPercent(mtdGaById.get(s.id) ?? s.standardGa, s.gaTarget),
    c2cAmount: s.c2cAmount,
    c2sAmount: s.c2sAmount,
  }));

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

  // Keys are the human-readable headings, so the sheet needs no separate
  // header row and the columns match the screen exactly.
  const exportRows: ExportRow[] = rows.map((r) => ({
    Supervisor: r.name,
    RSO: r.rsoCount,
    Retailer: r.retailerCount,
    "GA (period)": r.standardGa,
    "GA (MTD)": r.mtdGa,
    "Monthly GA Target": r.gaTarget,
    "MTD Achievement %": r.gaTarget ? r.achievement : "",
    C2C: Math.round(r.c2cAmount),
    C2S: Math.round(r.c2sAmount),
  }));

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
          <ReportActionBar
            filename={`daily-summary-${range.from}_to_${range.to}`}
            rows={exportRows}
            summary={summary}
          />
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
        emptyTitle="No supervisor activity for this period"
        emptyHint="Check Data Readiness on the Reporting Center — a feed may not be imported for these dates."
      />
    </main>
  );
}

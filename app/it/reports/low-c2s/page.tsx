/**
 * Low C2S Retailers — lowest retail sales first, so the weakest outlets sit
 * at the top of the page rather than the bottom.
 *
 * The demo offers All / Bottom 10 / Bottom 20 / Zero-only. Those live in the
 * URL like the date range, so a filtered view is a shareable link.
 */

import { requireUser } from "../../../../lib/auth";
import { resolveRange, rangeQuery } from "../../../../lib/report-range";
import { retailerReport } from "../../../../lib/report-data";
import { RetailerReportView, identityColumns, identityExport, money } from "../RetailerReportView";
import type { Column } from "../../../components/ReportTable";
import type { RetailerReportRow } from "../../../../lib/report-data";
import Link from "next/link";

export const dynamic = "force-dynamic";

const VIEWS = [
  { key: "all", label: "All" },
  { key: "bottom10", label: "Bottom 10" },
  { key: "bottom20", label: "Bottom 20" },
  { key: "zero", label: "Zero C2S Only" },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

export default async function LowC2s({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; view?: string }>;
}) {
  await requireUser(["ADMIN", "IT"]);
  const sp = await searchParams;
  const range = resolveRange(sp.from, sp.to);
  const view: ViewKey = (VIEWS.find((v) => v.key === sp.view)?.key ?? "all") as ViewKey;

  const all = await retailerReport(range);
  const ranked = [...all].sort((a, b) => a.c2s - b.c2s || a.retailerCode.localeCompare(b.retailerCode));
  const rows =
    view === "zero"
      ? ranked.filter((r) => r.c2s === 0)
      : view === "bottom10"
        ? ranked.slice(0, 10)
        : view === "bottom20"
          ? ranked.slice(0, 20)
          : ranked;

  const columns: Column<RetailerReportRow>[] = [
    ...identityColumns,
    { key: "c2s", label: "C2S Value", align: "right", render: (r) => money(r.c2s) },
    { key: "trx", label: "Trx", align: "right", render: (r) => r.c2sTransactions },
    { key: "c2c", label: "C2C Value", align: "right", render: (r) => money(r.c2c) },
  ];

  const zero = all.filter((r) => r.c2s === 0).length;
  return (
    <>
      <div className="kit-report-presets no-print kit-mb-12">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={`/it/reports/low-c2s?${rangeQuery(range, v.key === "all" ? {} : { view: v.key })}`}
            className={`kit-preset${view === v.key ? " is-active" : ""}`}
          >
            {v.label}
          </Link>
        ))}
      </div>
      <RetailerReportView
        title="Low C2S Retailers"
        subtitle="Lowest C2S first"
        range={range}
        rows={rows}
        columns={columns}
        exportRows={rows.map((r) => ({
          ...identityExport(r),
          "C2S Value": Math.round(r.c2s),
          Trx: r.c2sTransactions,
          "C2C Value": Math.round(r.c2c),
        }))}
        summaryItems={[
          { label: "Total Retailers", value: all.length.toLocaleString() },
          { label: "Zero C2S", value: zero.toLocaleString(), tone: "amber" },
          { label: "Showing", value: rows.length.toLocaleString() },
          {
            label: "Total C2S",
            value: money(all.reduce((a, r) => a + r.c2s, 0)),
          },
        ]}
        filename={`low-c2s-${view}`}
        emptyTitle="No retailers match this view"
        emptyHint="Try the All view, or check Data Readiness for the C2S feed."
      />
    </>
  );
}

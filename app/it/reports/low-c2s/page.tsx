/**
 * Low C2S Retailers — lowest retail sales first, so the weakest outlets sit
 * at the top of the page rather than the bottom.
 *
 * The demo offers All / Bottom 10 / Bottom 20 / Zero-only. Those live in the
 * URL like the date range, so a filtered view is a shareable link.
 */

import { requireUser } from "../../../../lib/auth";
import { resolveRange, rangeQuery } from "../../../../lib/report-range";
import {
  LOW_C2S_VIEWS,
  buildLowC2s,
  lowC2sView,
  reportExportHref,
  searchReport,
} from "../../../../lib/report-builders";
import { reportPageHref } from "../../../../lib/report-paging";
import { RetailerReportView, identityColumns, money } from "../RetailerReportView";
import type { Column } from "../../../components/ReportTable";
import type { RetailerReportRow } from "../../../../lib/report-data";
import { AppLink as Link } from "../../../components/AppLink";

export const dynamic = "force-dynamic";

export default async function LowC2s({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; view?: string; page?: string; q?: string }>;
}) {
  await requireUser(["ADMIN", "IT"]);
  const sp = await searchParams;
  const range = resolveRange(sp.from, sp.to);
  const view = lowC2sView(sp.view);
  const { rows, total, zero, totalC2s, matched, unfiltered } = searchReport(await buildLowC2s(range, view), sp.q);

  const columns: Column<RetailerReportRow>[] = [
    ...identityColumns,
    { key: "c2s", label: "C2S Value", align: "right", render: (r) => money(r.c2s) },
    { key: "trx", label: "Trx", align: "right", render: (r) => r.c2sTransactions },
    { key: "c2c", label: "C2C Value", align: "right", render: (r) => money(r.c2c) },
  ];

  // The view is part of the identity of this report, so it rides along in both
  // the pager's links and the export URL. Losing it in either would silently
  // show or download a different report than the one being viewed.
  const viewParam = view === "all" ? undefined : view;

  // One instant for both renders — see ReportDateBar's nowIso.

  const nowIso = new Date().toISOString();

  return (
    <RetailerReportView
      title="Low C2S Retailers"
      subtitle="Lowest C2S first"
      range={range}
      nowIso={nowIso}
      rows={rows}
      columns={columns}
      exportHref={reportExportHref("low-c2s", range, viewParam ? { view: viewParam } : {})}
      search={{ matched, total: unfiltered, noun: "retailer" }}
      paging={{
        page: sp.page,
        noun: "retailer",
        hrefFor: (p) => reportPageHref("/it/reports/low-c2s", { from: range.from, to: range.to, view: viewParam }, p),
      }}
      summaryItems={[
        { label: "Total Retailers", value: total.toLocaleString("en-US") },
        { label: "Zero C2S", value: zero.toLocaleString("en-US"), tone: "amber" },
        { label: "Showing", value: rows.length.toLocaleString("en-US") },
        { label: "Total C2S", value: money(totalC2s) },
      ]}
      emptyTitle="No retailers match this view"
      emptyHint="Try the All view, or check Data Readiness for the C2S feed."
    >
      <div className="kit-report-presets no-print kit-mb-12">
        {LOW_C2S_VIEWS.map((v) => (
          <Link
            key={v.key}
            href={`/it/reports/low-c2s?${rangeQuery(range, v.key === "all" ? {} : { view: v.key })}`}
            className={`kit-preset${view === v.key ? " is-active" : ""}`}
          >
            {v.label}
          </Link>
        ))}
      </div>
    </RetailerReportView>
  );
}

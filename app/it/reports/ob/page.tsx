/**
 * Opening Balance — retailer-wise latest balance snapshot.
 *
 * A retailer with no OB record shows "—", not 0. Opening balance is a snapshot
 * that is replaced wholesale on each import, so a missing row means "not in
 * the latest snapshot", which is a different fact from "balance is zero" and
 * must not be shown as one.
 */

import { requireUser } from "../../../../lib/auth";
import { resolveRange } from "../../../../lib/report-range";
import { buildOpeningBalance, reportExportHref, searchReport } from "../../../../lib/report-builders";
import { reportPageHref } from "../../../../lib/report-paging";
import { RetailerReportView, identityColumns, money } from "../RetailerReportView";
import type { Column } from "../../../components/ReportTable";
import type { RetailerReportRow } from "../../../../lib/report-data";

export const dynamic = "force-dynamic";

export default async function OpeningBalance({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; page?: string; q?: string }>;
}) {
  await requireUser(["ADMIN", "IT"]);
  const sp = await searchParams;
  const range = resolveRange(sp.from, sp.to);
  const { rows, total, withBalance, totalBalance, matched, unfiltered } = searchReport(
    await buildOpeningBalance(range),
    sp.q,
  );

  const columns: Column<RetailerReportRow>[] = [
    ...identityColumns,
    {
      key: "openingBalance",
      label: "Opening Balance",
      align: "right",
      render: (r) => (r.openingBalance === null ? "—" : money(r.openingBalance)),
    },
  ];

  // One instant for both renders — see ReportDateBar's nowIso.

  const nowIso = new Date().toISOString();

  return (
    <RetailerReportView
      title="Opening Balance Report"
      subtitle="Latest snapshot, highest balance first"
      range={range}
      nowIso={nowIso}
      rows={rows}
      columns={columns}
      exportHref={reportExportHref("ob", range)}
      search={{ matched, total: unfiltered, noun: "retailer" }}
      paging={{
        page: sp.page,
        noun: "retailer",
        hrefFor: (p) => reportPageHref("/it/reports/ob", { from: range.from, to: range.to, q: sp.q }, p),
      }}
      summaryItems={[
        { label: "Retailers", value: total.toLocaleString("en-US") },
        { label: "With Balance", value: withBalance.toLocaleString("en-US"), tone: "brand" },
        { label: "Not In Snapshot", value: (total - withBalance).toLocaleString("en-US"), tone: "amber" },
        { label: "Total Balance", value: money(totalBalance) },
      ]}
      emptyTitle="No retailers found"
      emptyHint="Check Data Readiness — the Opening Balance feed may not be imported."
    />
  );
}

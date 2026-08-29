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
import { retailerReport } from "../../../../lib/report-data";
import { RetailerReportView, identityColumns, identityExport, money } from "../RetailerReportView";
import type { Column } from "../../../components/ReportShell";
import type { RetailerReportRow } from "../../../../lib/report-data";

export const dynamic = "force-dynamic";

export default async function OpeningBalance({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireUser(["ADMIN", "IT"]);
  const range = resolveRange(...(await searchParams.then((s) => [s.from, s.to] as const)));
  const all = await retailerReport(range);

  const withBalance = all.filter((r) => r.openingBalance !== null);
  const rows = [...all].sort((a, b) => (b.openingBalance ?? -1) - (a.openingBalance ?? -1));

  const columns: Column<RetailerReportRow>[] = [
    ...identityColumns,
    {
      key: "openingBalance",
      label: "Opening Balance",
      align: "right",
      render: (r) => (r.openingBalance === null ? "—" : money(r.openingBalance)),
    },
  ];

  const total = withBalance.reduce((a, r) => a + (r.openingBalance ?? 0), 0);
  return (
    <RetailerReportView
      title="Opening Balance Report"
      subtitle="Latest snapshot, highest balance first"
      range={range}
      rows={rows}
      columns={columns}
      exportRows={rows.map((r) => ({
        ...identityExport(r),
        // Blank, not 0 — the sheet must not assert a balance that was never imported.
        "Opening Balance": r.openingBalance === null ? "" : Math.round(r.openingBalance),
      }))}
      summaryItems={[
        { label: "Retailers", value: all.length.toLocaleString() },
        { label: "With Balance", value: withBalance.length.toLocaleString(), tone: "teal" },
        { label: "Not In Snapshot", value: (all.length - withBalance.length).toLocaleString(), tone: "amber" },
        { label: "Total Balance", value: money(total) },
      ]}
      filename="opening-balance"
      emptyTitle="No retailers found"
      emptyHint="Check Data Readiness — the Opening Balance feed may not be imported."
    />
  );
}

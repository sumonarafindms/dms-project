/**
 * LSO Pending — retailers that have not met the monthly C2S amount AND
 * transaction requirements. Most incomplete first.
 *
 * Unlike SSO, LSO applies to every retailer, not only SIM sellers.
 */

import { requireUser } from "../../../../lib/auth";
import { resolveRange } from "../../../../lib/report-range";
import { retailerReport } from "../../../../lib/report-data";
import { LSO_MIN_MONTHLY_AMOUNT, LSO_MIN_MONTHLY_TRANSACTIONS } from "../../../../lib/business-rules";
import { RetailerReportView, identityColumns, identityExport, money } from "../RetailerReportView";
import type { Column } from "../../../components/ReportShell";
import type { RetailerReportRow } from "../../../../lib/report-data";

export const dynamic = "force-dynamic";

export default async function LsoPending({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireUser(["ADMIN", "IT"]);
  const range = resolveRange(...(await searchParams.then((s) => [s.from, s.to] as const)));
  const all = await retailerReport(range);

  // Ordered by how far from the amount requirement the outlet is, so the ones
  // closest to converting are not buried under hopeless ones.
  const rows = all
    .filter((r) => !r.lsoComplete)
    .sort((a, b) => b.c2s - a.c2s || a.retailerCode.localeCompare(b.retailerCode));

  const columns: Column<RetailerReportRow>[] = [
    ...identityColumns,
    { key: "c2s", label: "C2S Value", align: "right", render: (r) => money(r.c2s) },
    { key: "trx", label: "Trx", align: "right", render: (r) => r.c2sTransactions },
    {
      key: "needAmount",
      label: "Needs Amount",
      align: "right",
      render: (r) => money(Math.max(LSO_MIN_MONTHLY_AMOUNT - r.c2s, 0)),
    },
    {
      key: "needTrx",
      label: "Needs Trx",
      align: "right",
      render: (r) => Math.max(LSO_MIN_MONTHLY_TRANSACTIONS - r.c2sTransactions, 0),
    },
  ];

  const complete = all.length - rows.length;
  return (
    <RetailerReportView
      title="LSO Pending"
      subtitle={`Complete at ৳${LSO_MIN_MONTHLY_AMOUNT} and ${LSO_MIN_MONTHLY_TRANSACTIONS} transactions in one month`}
      range={range}
      rows={rows}
      columns={columns}
      exportRows={rows.map((r) => ({
        ...identityExport(r),
        "C2S Value": Math.round(r.c2s),
        Trx: r.c2sTransactions,
        "Needs Amount": Math.max(LSO_MIN_MONTHLY_AMOUNT - r.c2s, 0),
        "Needs Trx": Math.max(LSO_MIN_MONTHLY_TRANSACTIONS - r.c2sTransactions, 0),
      }))}
      summaryItems={[
        { label: "Total Retailers", value: all.length.toLocaleString() },
        { label: "LSO Complete", value: complete.toLocaleString(), tone: "teal" },
        { label: "LSO Pending", value: rows.length.toLocaleString(), tone: "amber" },
        { label: "Completion", value: all.length ? `${Math.round((complete / all.length) * 100)}%` : "—" },
      ]}
      filename="lso-pending"
      emptyTitle="All LSO complete"
      emptyHint="Every retailer met the monthly C2S amount and transaction requirement for this period."
    />
  );
}

/**
 * LSO Pending — retailers that have not met the monthly C2S amount AND
 * transaction requirements, closest to converting first.
 *
 * Unlike SSO, LSO applies to every retailer, not only SIM sellers.
 *
 * (The old header here said "Most incomplete first", which is the opposite of
 * what the code below it has always done and of the reason written beside the
 * sort. SSO Pending was the one actually ordered that way; v152 made both
 * reports order by how close an outlet is to converting.)
 */

import { requireUser } from "../../../../lib/auth";
import { resolveRange } from "../../../../lib/report-range";
import { buildLso, reportExportHref, searchReport } from "../../../../lib/report-builders";
import { reportPageHref } from "../../../../lib/report-paging";
import { LSO_MIN_MONTHLY_AMOUNT, LSO_MIN_MONTHLY_TRANSACTIONS } from "../../../../lib/business-rules";
import { RetailerReportView, identityColumns, money } from "../RetailerReportView";
import type { Column } from "../../../components/ReportTable";
import type { RetailerReportRow } from "../../../../lib/report-data";

export const dynamic = "force-dynamic";

export default async function LsoPending({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; page?: string; q?: string }>;
}) {
  await requireUser(["ADMIN", "IT"]);
  const sp = await searchParams;
  const range = resolveRange(sp.from, sp.to);
  const { rows, total, complete, matched, unfiltered } = searchReport(await buildLso(range), sp.q);

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

  // One instant for both renders — see ReportDateBar's nowIso.

  const nowIso = new Date().toISOString();

  return (
    <RetailerReportView
      title="LSO Pending"
      subtitle={`Complete at ৳${LSO_MIN_MONTHLY_AMOUNT} and ${LSO_MIN_MONTHLY_TRANSACTIONS} transactions in one month • Closest to complete first`}
      range={range}
      nowIso={nowIso}
      rows={rows}
      columns={columns}
      exportHref={reportExportHref("lso", range)}
      search={{ matched, total: unfiltered, noun: "retailer" }}
      paging={{
        page: sp.page,
        noun: "retailer",
        hrefFor: (p) => reportPageHref("/it/reports/lso", { from: range.from, to: range.to }, p),
      }}
      summaryItems={[
        { label: "Total Retailers", value: total.toLocaleString("en-US") },
        { label: "LSO Complete", value: complete.toLocaleString("en-US"), tone: "brand" },
        { label: "LSO Pending", value: rows.length.toLocaleString("en-US"), tone: "amber" },
        { label: "Completion", value: total ? `${Math.round((complete / total) * 100)}%` : "—" },
      ]}
      emptyTitle="All LSO complete"
      emptyHint="Every retailer met the monthly C2S amount and transaction requirement for this period."
    />
  );
}

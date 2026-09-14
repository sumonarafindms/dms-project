/**
 * SSO Pending — SIM-seller retailers that have not reached the monthly
 * standard-GA threshold.
 *
 * Rows, ordering and the spreadsheet all come from `buildSso()` so the file
 * and the screen cannot disagree; see lib/report-builders.ts for why the
 * ordering changed in v152.
 */

import { requireUser } from "../../../../lib/auth";
import { resolveRange } from "../../../../lib/report-range";
import { buildSso, reportExportHref, searchReport } from "../../../../lib/report-builders";
import { reportPageHref } from "../../../../lib/report-paging";
import { SSO_MIN_MONTHLY_STANDARD_GA } from "../../../../lib/business-rules";
import { RetailerReportView, identityColumns } from "../RetailerReportView";
import type { Column } from "../../../components/ReportTable";
import type { RetailerReportRow } from "../../../../lib/report-data";

export const dynamic = "force-dynamic";

export default async function SsoPending({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; page?: string; q?: string }>;
}) {
  await requireUser(["ADMIN", "IT"]);
  const sp = await searchParams;
  const range = resolveRange(sp.from, sp.to);
  const { rows, sellers, complete, matched, unfiltered } = searchReport(await buildSso(range), sp.q);

  const columns: Column<RetailerReportRow>[] = [
    ...identityColumns,
    { key: "ga", label: "GA Done", align: "right" },
    { key: "req", label: "Required", align: "right", render: () => SSO_MIN_MONTHLY_STANDARD_GA },
    {
      key: "remaining",
      label: "Remaining",
      align: "right",
      render: (r) => Math.max(SSO_MIN_MONTHLY_STANDARD_GA - r.ga, 0),
    },
  ];

  return (
    <RetailerReportView
      title="SSO Pending"
      subtitle={`Complete at ${SSO_MIN_MONTHLY_STANDARD_GA} standard GA in one month • Closest to complete first`}
      range={range}
      rows={rows}
      columns={columns}
      exportHref={reportExportHref("sso", range)}
      search={{ matched, total: unfiltered, noun: "retailer" }}
      paging={{
        page: sp.page,
        noun: "retailer",
        hrefFor: (p) => reportPageHref("/it/reports/sso", { from: range.from, to: range.to }, p),
      }}
      summaryItems={[
        { label: "SIM Seller Outlets", value: sellers.toLocaleString() },
        { label: "SSO Complete", value: complete.toLocaleString(), tone: "brand" },
        { label: "SSO Pending", value: rows.length.toLocaleString(), tone: "amber" },
        { label: "Completion", value: sellers ? `${Math.round((complete / sellers) * 100)}%` : "—" },
      ]}
      emptyTitle="All SSO complete"
      emptyHint="Every SIM-seller retailer has reached the monthly GA requirement for this period."
    />
  );
}

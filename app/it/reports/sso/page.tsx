/**
 * SSO Pending — SIM-seller retailers that have not reached the monthly
 * standard-GA threshold. Most incomplete first, so the top of the list is the
 * day's call sheet.
 *
 * Non-SIM-seller retailers are excluded entirely: the SSO rule only applies to
 * them (lib/business-rules.ts isSsoComplete), so listing them as "pending"
 * would be inventing work that does not exist.
 */

import { requireUser } from "../../../../lib/auth";
import { resolveRange } from "../../../../lib/report-range";
import { retailerReport } from "../../../../lib/report-data";
import { SSO_MIN_MONTHLY_STANDARD_GA } from "../../../../lib/business-rules";
import { RetailerReportView, identityColumns, identityExport } from "../RetailerReportView";
import type { Column } from "../../../components/ReportShell";
import type { RetailerReportRow } from "../../../../lib/report-data";

export const dynamic = "force-dynamic";

export default async function SsoPending({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireUser(["ADMIN", "IT"]);
  const range = resolveRange(...(await searchParams.then((s) => [s.from, s.to] as const)));
  const all = await retailerReport(range);

  const sellers = all.filter((r) => r.simSeller);
  const rows = sellers
    .filter((r) => !r.ssoComplete)
    .sort((a, b) => a.ga - b.ga || a.retailerCode.localeCompare(b.retailerCode));

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

  const complete = sellers.length - rows.length;
  return (
    <RetailerReportView
      title="SSO Pending"
      subtitle={`Complete at ${SSO_MIN_MONTHLY_STANDARD_GA} standard GA in one month • Most incomplete first`}
      range={range}
      rows={rows}
      columns={columns}
      exportRows={rows.map((r) => ({
        ...identityExport(r),
        "GA Done": r.ga,
        Required: SSO_MIN_MONTHLY_STANDARD_GA,
        Remaining: Math.max(SSO_MIN_MONTHLY_STANDARD_GA - r.ga, 0),
      }))}
      summaryItems={[
        { label: "SIM Seller Outlets", value: sellers.length.toLocaleString() },
        { label: "SSO Complete", value: complete.toLocaleString(), tone: "teal" },
        { label: "SSO Pending", value: rows.length.toLocaleString(), tone: "amber" },
        {
          label: "Completion",
          value: sellers.length ? `${Math.round((complete / sellers.length) * 100)}%` : "—",
        },
      ]}
      filename="sso-pending"
      emptyTitle="All SSO complete"
      emptyHint="Every SIM-seller retailer has reached the monthly GA requirement for this period."
    />
  );
}

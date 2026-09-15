/**
 * Activation Report — SIM activation against target, grouped by Supervisor,
 * RSO or BP. The grouping lives in the URL so a grouped view is shareable.
 *
 * "Activation" here is standard GA only. SIMWAP and EV-SWAP are replacements
 * and are excluded by withStandardGa() upstream — a swap is not a new
 * activation and must never inflate an activation figure.
 */

import Link from "next/link";
import { requireUser } from "../../../../lib/auth";
import { rangeLabel, resolveRange, rangeQuery } from "../../../../lib/report-range";
import type { ActivationRow } from "../../../../lib/report-data";
import {
  ACTIVATION_GROUPS,
  ACTIVATION_SUB_LABEL,
  activationGroup,
  buildActivation,
  reportExportHref,
  searchReport,
} from "../../../../lib/report-builders";
import { reportPageHref } from "../../../../lib/report-paging";
import { targetPercent } from "../../../../lib/achievement";
import { PageHeader, SummaryStrip } from "../../../components/Kit";
import { ReportActionBar, ReportDateBar, ReportSearch } from "../../../components/ReportShell";
import { ReportTable } from "../../../components/ReportTable";
import type { Column } from "../../../components/ReportTable";
import { Icon } from "../../../components/icons";

export const dynamic = "force-dynamic";

export default async function ActivationReport({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; group?: string; page?: string; q?: string }>;
}) {
  await requireUser(["ADMIN", "IT"]);
  const sp = await searchParams;
  const range = resolveRange(sp.from, sp.to);
  const group = activationGroup(sp.group);
  const { rows: ordered, matched, unfiltered } = searchReport(await buildActivation(range, group), sp.q);
  const groupParam = group === "supervisor" ? undefined : group;

  const totalActivation = ordered.reduce((a, r) => a + r.activation, 0);
  const totalTarget = ordered.reduce((a, r) => a + r.target, 0);

  const columns: Column<ActivationRow>[] = [
    { key: "name", label: ACTIVATION_GROUPS.find((g) => g.key === group)!.label.replace("By ", "") },
    { key: "code", label: "Code" },
    { key: "sub", label: ACTIVATION_SUB_LABEL[group] },
    { key: "activation", label: "Activation", align: "right", render: (r) => r.activation.toLocaleString("en-US") },
    { key: "target", label: "Target", align: "right", render: (r) => r.target.toLocaleString("en-US") },
    {
      key: "pct",
      label: "Achievement %",
      align: "right",
      render: (r) => (r.target ? `${targetPercent(r.activation, r.target)}%` : "—"),
    },
  ];

  return (
    <main className="page">
      <Link href={`/it/reports?${rangeQuery(range)}`} className="kit-detail-back no-print">
        <Icon name="arrow" /> Back to Reports
      </Link>
      <PageHeader
        title="Activation Report"
        subtitle={`Report Period: ${rangeLabel(range)} • Standard GA only, SIM swap excluded`}
        action={
          <ReportActionBar
            exportHref={reportExportHref("activation", range, groupParam ? { group: groupParam } : {})}
            rowCount={ordered.length}
          />
        }
      />
      <ReportDateBar range={range} />
      <div className="kit-report-presets no-print kit-mb-12">
        {ACTIVATION_GROUPS.map((g) => (
          <Link
            key={g.key}
            href={`/it/reports/activation?${rangeQuery(range, g.key === "supervisor" ? {} : { group: g.key })}`}
            className={`kit-preset${group === g.key ? " is-active" : ""}`}
          >
            {g.label}
          </Link>
        ))}
      </div>
      <ReportSearch matched={matched} total={unfiltered} noun={group === "bp" ? "BP" : group} />
      <SummaryStrip
        items={[
          { label: "Total Activation", value: totalActivation.toLocaleString("en-US"), tone: "brand" },
          { label: "Total Target", value: totalTarget.toLocaleString("en-US") },
          {
            label: "Achievement",
            value: totalTarget ? `${targetPercent(totalActivation, totalTarget)}%` : "—",
          },
          { label: "Rows", value: ordered.length.toLocaleString("en-US") },
        ]}
      />
      <ReportTable
        columns={columns}
        rows={ordered}
        paging={{
          page: sp.page,
          noun: group === "bp" ? "BP" : group,
          hrefFor: (p) =>
            reportPageHref("/it/reports/activation", { from: range.from, to: range.to, group: groupParam }, p),
        }}
        emptyTitle="No activation for this period"
        emptyHint="Check Data Readiness on the Reporting Center — the GA feed may not be imported for these dates."
      />
    </main>
  );
}

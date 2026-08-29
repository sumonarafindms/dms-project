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
import { bpActivation, rsoActivation, supervisorSummary } from "../../../../lib/report-data";
import type { ActivationRow } from "../../../../lib/report-data";
import { targetPercent } from "../../../../lib/achievement";
import { PageHeader, SummaryStrip } from "../../../components/Kit";
import { ReportActionBar, ReportDateBar, ReportTable } from "../../../components/ReportShell";
import type { Column } from "../../../components/ReportShell";
import { Icon } from "../../../components/icons";

export const dynamic = "force-dynamic";

const GROUPS = [
  { key: "supervisor", label: "By Supervisor" },
  { key: "rso", label: "By RSO" },
  { key: "bp", label: "By BP" },
] as const;
type GroupKey = (typeof GROUPS)[number]["key"];

const SUB_LABEL: Record<GroupKey, string> = {
  supervisor: "RSOs",
  rso: "Supervisor",
  bp: "RSO",
};

export default async function ActivationReport({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; group?: string }>;
}) {
  await requireUser(["ADMIN", "IT"]);
  const sp = await searchParams;
  const range = resolveRange(sp.from, sp.to);
  const group: GroupKey = (GROUPS.find((g) => g.key === sp.group)?.key ?? "supervisor") as GroupKey;

  // Only the grouping actually being shown is queried.
  const rows: ActivationRow[] =
    group === "supervisor"
      ? (await supervisorSummary(range)).map((s) => ({
          id: s.id,
          name: s.name,
          code: "—",
          sub: `${s.rsoCount}`,
          activation: s.standardGa,
          target: s.gaTarget,
        }))
      : group === "rso"
        ? await rsoActivation(range)
        : await bpActivation(range);

  const ordered = [...rows].sort((a, b) => b.activation - a.activation || a.name.localeCompare(b.name));
  const totalActivation = ordered.reduce((a, r) => a + r.activation, 0);
  const totalTarget = ordered.reduce((a, r) => a + r.target, 0);

  const columns: Column<ActivationRow>[] = [
    { key: "name", label: GROUPS.find((g) => g.key === group)!.label.replace("By ", "") },
    { key: "code", label: "Code" },
    { key: "sub", label: SUB_LABEL[group] },
    { key: "activation", label: "Activation", align: "right", render: (r) => r.activation.toLocaleString() },
    { key: "target", label: "Target", align: "right", render: (r) => r.target.toLocaleString() },
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
            filename={`activation-${group}-${range.from}_to_${range.to}`}
            rows={ordered.map((r) => ({
              Name: r.name,
              Code: r.code,
              [SUB_LABEL[group]]: r.sub,
              Activation: r.activation,
              Target: r.target,
              "Achievement %": r.target ? targetPercent(r.activation, r.target) : "",
            }))}
          />
        }
      />
      <ReportDateBar range={range} />
      <div className="kit-report-presets no-print kit-mb-12">
        {GROUPS.map((g) => (
          <Link
            key={g.key}
            href={`/it/reports/activation?${rangeQuery(range, g.key === "supervisor" ? {} : { group: g.key })}`}
            className={`kit-preset${group === g.key ? " is-active" : ""}`}
          >
            {g.label}
          </Link>
        ))}
      </div>
      <SummaryStrip
        items={[
          { label: "Total Activation", value: totalActivation.toLocaleString(), tone: "teal" },
          { label: "Total Target", value: totalTarget.toLocaleString() },
          {
            label: "Achievement",
            value: totalTarget ? `${targetPercent(totalActivation, totalTarget)}%` : "—",
          },
          { label: "Rows", value: ordered.length.toLocaleString() },
        ]}
      />
      <ReportTable
        columns={columns}
        rows={ordered}
        emptyTitle="No activation for this period"
        emptyHint="Check Data Readiness on the Reporting Center — the GA feed may not be imported for these dates."
      />
    </main>
  );
}

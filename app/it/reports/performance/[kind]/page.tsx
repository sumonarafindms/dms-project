/**
 * Entity performance — one route serving supervisor, RSO, BP and retailer.
 *
 * The demo has four separate shortcuts but they are one report ranked over
 * four different populations, so `kind` is a route parameter rather than four
 * near-identical files (Rule 9).
 *
 * Retailers have no targets in this schema, so the retailer view ranks by GA
 * volume and shows SSO/LSO status instead of an achievement percentage. It
 * does not display a target column that would have to be invented.
 */

import { notFound } from "next/navigation";
import { requireUser } from "../../../../../lib/auth";
import { resolveRange } from "../../../../../lib/report-range";
import { bpActivation, retailerReport, rollUpToSupervisor, rsoSummary } from "../../../../../lib/report-data";
import { targetPercent } from "../../../../../lib/achievement";
import { Badge } from "../../../../components/Kit";
import { GroupedReportView, money } from "../../GroupedReportView";
import type { Column } from "../../../../components/ReportTable";

export const dynamic = "force-dynamic";

const KINDS = {
  supervisor: "Supervisor Performance",
  rso: "RSO Performance",
  bp: "BP Performance",
  retailer: "Retailer Performance",
} as const;
type Kind = keyof typeof KINDS;

type Row = {
  id: string;
  name: string;
  code: string;
  sub: string;
  achieved: number;
  target: number;
  extra?: React.ReactNode;
  c2c?: number;
  c2s?: number;
};

export default async function Performance({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireUser(["ADMIN", "IT"]);
  const { kind: raw } = await params;
  if (!(raw in KINDS)) notFound();
  const kind = raw as Kind;
  const sp = await searchParams;
  const range = resolveRange(sp.from, sp.to);

  let rows: Row[];
  if (kind === "bp") {
    rows = (await bpActivation(range)).map((b) => ({
      id: b.id,
      name: b.name,
      code: b.code,
      sub: b.sub,
      achieved: b.activation,
      target: b.target,
    }));
  } else if (kind === "retailer") {
    rows = (await retailerReport(range)).map((r) => ({
      id: r.id,
      name: r.retailerName,
      code: r.retailerCode,
      sub: `${r.supervisor} / ${r.employeeName}`,
      achieved: r.ga,
      target: 0,
      c2c: r.c2c,
      c2s: r.c2s,
      extra: (
        <span className="kit-inline-group">
          <Badge tone={r.ssoComplete ? "complete" : "pending"}>SSO</Badge>
          <Badge tone={r.lsoComplete ? "complete" : "pending"}>LSO</Badge>
        </span>
      ),
    }));
  } else {
    const summary = await rsoSummary(range);
    const source = kind === "supervisor" ? rollUpToSupervisor(summary) : summary;
    rows = source.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      sub: kind === "supervisor" ? `${r.retailerCount.toLocaleString()} retailers` : r.supervisor,
      achieved: r.ga,
      target: r.gaTarget,
      c2c: r.c2c,
      c2s: r.c2s,
    }));
  }

  // With targets, rank by achievement; without, rank by volume.
  const hasTargets = kind !== "retailer";
  const ordered = [...rows].sort((a, b) =>
    hasTargets
      ? targetPercent(b.achieved, b.target) - targetPercent(a.achieved, a.target) || b.achieved - a.achieved
      : b.achieved - a.achieved || a.name.localeCompare(b.name),
  );

  const columns: Column<Row>[] = [
    { key: "rank", label: "#", render: (r) => ordered.indexOf(r) + 1 },
    { key: "name", label: KINDS[kind].replace(" Performance", "") },
    { key: "code", label: "Code" },
    { key: "sub", label: kind === "supervisor" ? "Coverage" : kind === "bp" ? "RSO" : "Supervisor / RSO" },
    { key: "achieved", label: "GA", align: "right", render: (r) => r.achieved.toLocaleString() },
    ...(hasTargets
      ? ([
          { key: "target", label: "Target", align: "right", render: (r: Row) => r.target.toLocaleString() },
          {
            key: "pct",
            label: "Achievement %",
            align: "right",
            render: (r: Row) => (r.target ? `${targetPercent(r.achieved, r.target)}%` : "—"),
          },
        ] as Column<Row>[])
      : ([
          { key: "c2c", label: "C2C", align: "right", render: (r: Row) => money(r.c2c ?? 0) },
          { key: "c2s", label: "C2S", align: "right", render: (r: Row) => money(r.c2s ?? 0) },
          { key: "extra", label: "Execution", render: (r: Row) => r.extra },
        ] as Column<Row>[])),
  ];

  const totalAchieved = ordered.reduce((a, r) => a + r.achieved, 0);
  const totalTarget = ordered.reduce((a, r) => a + r.target, 0);
  const behind = hasTargets
    ? ordered.filter((r) => r.target > 0 && targetPercent(r.achieved, r.target) < 80).length
    : ordered.filter((r) => r.achieved === 0).length;

  return (
    <GroupedReportView
      title={KINDS[kind]}
      subtitle={hasTargets ? "Ranked by achievement" : "Ranked by GA volume"}
      range={range}
      rows={ordered}
      columns={columns}
      exportRows={ordered.map((r, i) => ({
        "#": i + 1,
        Name: r.name,
        Code: r.code,
        Context: r.sub,
        GA: r.achieved,
        ...(hasTargets
          ? { Target: r.target, "Achievement %": r.target ? targetPercent(r.achieved, r.target) : "" }
          : { C2C: Math.round(r.c2c ?? 0), C2S: Math.round(r.c2s ?? 0) }),
      }))}
      summaryItems={[
        { label: "Total GA", value: totalAchieved.toLocaleString(), tone: "teal" },
        ...(hasTargets
          ? [
              { label: "Total Target", value: totalTarget.toLocaleString() },
              {
                label: "Achievement",
                value: totalTarget ? `${targetPercent(totalAchieved, totalTarget)}%` : "—",
              },
              { label: "Behind Target", value: behind.toLocaleString(), tone: "amber" as const },
            ]
          : [
              { label: "Retailers", value: ordered.length.toLocaleString() },
              { label: "Zero GA", value: behind.toLocaleString(), tone: "amber" as const },
            ]),
      ]}
      filename={`${kind}-performance`}
      emptyTitle={`No ${kind} data for this period`}
      emptyHint="Check Data Readiness on the Reporting Center."
    />
  );
}

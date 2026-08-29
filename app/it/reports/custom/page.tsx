/**
 * Custom Report — pick a level and the columns, get a table you can export.
 *
 * Configuration lives entirely in the URL, so a custom report someone builds
 * is a link they can send. That is the whole point of the feature: it exists
 * so IT can answer a one-off question without a new page being written.
 *
 * Only columns backed by real data are offered. There is no "add a metric"
 * that quietly produces zeros.
 */

import Link from "next/link";
import { requireUser } from "../../../../lib/auth";
import { rangeDayCount, resolveRange, rangeQuery } from "../../../../lib/report-range";
import { retailerReport, rollUpToSupervisor, rsoSummary } from "../../../../lib/report-data";
import { targetPercent } from "../../../../lib/achievement";
import { GroupedReportView, money } from "../GroupedReportView";
import { Card, SectionHead } from "../../../components/Kit";
import type { Column, ExportRow } from "../../../components/ReportShell";

export const dynamic = "force-dynamic";

const LEVELS = [
  { key: "supervisor", label: "Supervisor" },
  { key: "rso", label: "RSO" },
  { key: "retailer", label: "Retailer" },
] as const;
type Level = (typeof LEVELS)[number]["key"];

// Every field here maps to a real number. `levels` marks where it is available:
// retailers carry no targets, so target-bearing fields are absent there.
const FIELDS = [
  { key: "ga", label: "GA", levels: ["supervisor", "rso", "retailer"] },
  { key: "gaTarget", label: "GA Target", levels: ["supervisor", "rso"] },
  { key: "gaPct", label: "GA %", levels: ["supervisor", "rso"] },
  { key: "c2c", label: "C2C", levels: ["supervisor", "rso", "retailer"] },
  { key: "c2s", label: "C2S", levels: ["supervisor", "rso", "retailer"] },
  { key: "sso", label: "SSO Complete", levels: ["supervisor", "rso"] },
  { key: "lso", label: "LSO Complete", levels: ["supervisor", "rso"] },
  { key: "retailerCount", label: "Retailers", levels: ["supervisor", "rso"] },
  { key: "ob", label: "Opening Balance", levels: ["retailer"] },
] as const;
type FieldKey = (typeof FIELDS)[number]["key"];

const DEFAULT_FIELDS: FieldKey[] = ["ga", "c2c", "c2s"];

type Row = { id: string; name: string; code: string; sub: string } & Partial<Record<FieldKey, number | null>>;

export default async function CustomReport({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; level?: string; fields?: string }>;
}) {
  await requireUser(["ADMIN", "IT"]);
  const sp = await searchParams;
  const range = resolveRange(sp.from, sp.to);
  const level = (LEVELS.find((l) => l.key === sp.level)?.key ?? "supervisor") as Level;

  const availableFields = FIELDS.filter((f) => (f.levels as readonly string[]).includes(level));
  const requested = (sp.fields ?? "").split(",").filter(Boolean) as FieldKey[];
  const selected = availableFields
    .map((f) => f.key)
    .filter((k) => (requested.length ? requested.includes(k) : DEFAULT_FIELDS.includes(k)));
  const active: FieldKey[] = selected.length ? selected : (availableFields.map((f) => f.key).slice(0, 3) as FieldKey[]);

  let rows: Row[];
  if (level === "retailer") {
    rows = (await retailerReport(range)).map((r) => ({
      id: r.id,
      name: r.retailerName,
      code: r.retailerCode,
      sub: `${r.supervisor} / ${r.employeeName}`,
      ga: r.ga,
      c2c: r.c2c,
      c2s: r.c2s,
      ob: r.openingBalance,
    }));
  } else {
    const summary = await rsoSummary(range);
    const source = level === "supervisor" ? rollUpToSupervisor(summary) : summary;
    rows = source.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      sub: level === "supervisor" ? `${r.retailerCount.toLocaleString()} retailers` : r.supervisor,
      ga: r.ga,
      gaTarget: r.gaTarget,
      gaPct: r.gaTarget ? targetPercent(r.ga, r.gaTarget) : null,
      c2c: r.c2c,
      c2s: r.c2s,
      sso: r.sso,
      lso: r.lso,
      retailerCount: r.retailerCount,
    }));
  }

  const isMoney = (k: FieldKey) => k === "c2c" || k === "c2s" || k === "ob";
  const show = (r: Row, k: FieldKey) => {
    const v = r[k];
    if (v === null || v === undefined) return "—";
    if (k === "gaPct") return `${v}%`;
    return isMoney(k) ? money(v) : v.toLocaleString();
  };

  const columns: Column<Row>[] = [
    { key: "name", label: LEVELS.find((l) => l.key === level)!.label },
    { key: "code", label: "Code" },
    { key: "sub", label: level === "supervisor" ? "Coverage" : "Reports to" },
    ...active.map((k): Column<Row> => ({
      key: k,
      label: FIELDS.find((f) => f.key === k)!.label,
      align: "right",
      render: (r) => show(r, k),
    })),
  ];

  const exportRows: ExportRow[] = rows.map((r) => {
    const out: ExportRow = { Name: r.name, Code: r.code, Context: r.sub };
    for (const k of active) {
      const v = r[k];
      out[FIELDS.find((f) => f.key === k)!.label] = v === null || v === undefined ? "" : Math.round(v);
    }
    return out;
  });

  const linkFor = (nextLevel: Level, fields: FieldKey[]) =>
    `/it/reports/custom?${rangeQuery(range, {
      ...(nextLevel === "supervisor" ? {} : { level: nextLevel }),
      ...(fields.length ? { fields: fields.join(",") } : {}),
    })}`;

  return (
    <GroupedReportView
      title="Custom Report"
      subtitle={`${LEVELS.find((l) => l.key === level)!.label} level`}
      range={range}
      rows={rows}
      columns={columns}
      exportRows={exportRows}
      summaryItems={[
        { label: "Level", value: LEVELS.find((l) => l.key === level)!.label },
        { label: "Rows", value: rows.length.toLocaleString() },
        { label: "Columns", value: String(active.length) },
        { label: "Period", value: `${rangeDayCount(range)} day${rangeDayCount(range) === 1 ? "" : "s"}` },
      ]}
      filename={`custom-${level}`}
      emptyTitle="No rows for this period"
      emptyHint="Widen the date range, or check Data Readiness on the Reporting Center."
    >
      <Card padded className="no-print kit-mb-12">
        <SectionHead title="Build the report" sub="Choices are stored in the link, so this view can be shared." />
        <p className="kit-label kit-mb-6">
          Level
        </p>
        <div className="kit-report-presets kit-mb-12">
          {LEVELS.map((l) => (
            <Link key={l.key} href={linkFor(l.key, [])} className={`kit-preset${level === l.key ? " is-active" : ""}`}>
              {l.label}
            </Link>
          ))}
        </div>
        <p className="kit-label kit-mb-6">
          Columns
        </p>
        <div className="kit-report-presets">
          {availableFields.map((f) => {
            const on = active.includes(f.key);
            const next = on ? active.filter((k) => k !== f.key) : [...active, f.key];
            return (
              <Link
                key={f.key}
                href={linkFor(level, next.length ? next : [f.key])}
                className={`kit-preset${on ? " is-active" : ""}`}
              >
                {on ? "✓ " : ""}
                {f.label}
              </Link>
            );
          })}
        </div>
      </Card>
    </GroupedReportView>
  );
}

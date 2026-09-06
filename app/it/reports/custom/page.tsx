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
import {
  CUSTOM_FIELDS,
  CUSTOM_LEVELS,
  buildCustom,
  customFieldsFor,
  customLevel,
  reportExportHref,
} from "../../../../lib/report-builders";
import type { CustomField, CustomLevel, CustomRow } from "../../../../lib/report-builders";
import { reportPageHref } from "../../../../lib/report-paging";
import { GroupedReportView, money } from "../GroupedReportView";
import { Card, SectionHead } from "../../../components/Kit";
import type { Column } from "../../../components/ReportTable";

export const dynamic = "force-dynamic";

export default async function CustomReport({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; level?: string; fields?: string; page?: string }>;
}) {
  await requireUser(["ADMIN", "IT"]);
  const sp = await searchParams;
  const range = resolveRange(sp.from, sp.to);
  const level = customLevel(sp.level);
  const { available, active } = customFieldsFor(level, sp.fields);
  const { rows } = await buildCustom(range, level, active);

  const isMoney = (k: CustomField) => k === "c2c" || k === "c2s" || k === "ob";
  const show = (r: CustomRow, k: CustomField) => {
    const v = r[k];
    if (v === null || v === undefined) return "—";
    if (k === "gaPct") return `${v}%`;
    return isMoney(k) ? money(v) : v.toLocaleString();
  };

  const columns: Column<CustomRow>[] = [
    { key: "name", label: CUSTOM_LEVELS.find((l) => l.key === level)!.label },
    { key: "code", label: "Code" },
    { key: "sub", label: level === "supervisor" ? "Coverage" : "Reports to" },
    ...active.map((k): Column<CustomRow> => ({
      key: k,
      label: CUSTOM_FIELDS.find((f) => f.key === k)!.label,
      align: "right",
      render: (r) => show(r, k),
    })),
  ];

  const linkFor = (nextLevel: CustomLevel, fields: CustomField[]) =>
    `/it/reports/custom?${rangeQuery(range, {
      ...(nextLevel === "supervisor" ? {} : { level: nextLevel }),
      ...(fields.length ? { fields: fields.join(",") } : {}),
    })}`;

  // The level and the chosen columns ARE the report, so both ride along in the
  // export URL and in the pager's links. `fields` is sent explicitly rather
  // than left to default, so a link that names its columns keeps naming them
  // on page 2 and in the spreadsheet.
  const levelParam = level === "supervisor" ? undefined : level;
  const fieldsParam = active.join(",");

  return (
    <GroupedReportView
      title="Custom Report"
      subtitle={`${CUSTOM_LEVELS.find((l) => l.key === level)!.label} level`}
      range={range}
      rows={rows}
      columns={columns}
      exportHref={reportExportHref("custom", range, {
        ...(levelParam ? { level: levelParam } : {}),
        fields: fieldsParam,
      })}
      paging={{
        page: sp.page,
        noun: level === "retailer" ? "retailer" : "row",
        hrefFor: (p) =>
          reportPageHref(
            "/it/reports/custom",
            { from: range.from, to: range.to, level: levelParam, fields: fieldsParam },
            p,
          ),
      }}
      summaryItems={[
        { label: "Level", value: CUSTOM_LEVELS.find((l) => l.key === level)!.label },
        { label: "Rows", value: rows.length.toLocaleString() },
        { label: "Columns", value: String(active.length) },
        { label: "Period", value: `${rangeDayCount(range)} day${rangeDayCount(range) === 1 ? "" : "s"}` },
      ]}
      emptyTitle="No rows for this period"
      emptyHint="Widen the date range, or check Data Readiness on the Reporting Center."
    >
      <Card padded className="no-print kit-mb-12">
        <SectionHead title="Build the report" sub="Choices are stored in the link, so this view can be shared." />
        <p className="kit-label kit-mb-6">Level</p>
        <div className="kit-report-presets kit-mb-12">
          {CUSTOM_LEVELS.map((l) => (
            <Link key={l.key} href={linkFor(l.key, [])} className={`kit-preset${level === l.key ? " is-active" : ""}`}>
              {l.label}
            </Link>
          ))}
        </div>
        <p className="kit-label kit-mb-6">Columns</p>
        <div className="kit-report-presets">
          {available.map((f) => {
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

/**
 * Daily Summary report — the period's overview at whichever level you ask for.
 *
 * The aggregation runs on the server, so the browser receives finished rows
 * rather than raw records to add up. The Excel export and the copy summary are
 * both built from those same rows, which is what guarantees the file and the
 * clipboard text match what is on screen for the current period.
 *
 * ## Levels, and clicking a supervisor
 *
 * It used to show supervisors only, with the name as plain text — so the
 * obvious gesture, clicking the team you want to look into, did nothing, and
 * there was no route from "Shaheen's team did 7 GA" to "which of Shaheen's ten
 * RSOs did it". Now there are three levels, and a supervisor's name is a link
 * into the RSO view filtered to that supervisor.
 *
 * The BP level shows GA, target and achievement and no C2C/C2S, because this
 * schema has no per-BP recharge — see `DailyRow.hasValue`. Empty money columns
 * would read as "this BP sold nothing" rather than "we do not track that here".
 */

import Link from "next/link";
import { requireUser } from "../../../../lib/auth";
import { rangeLabel, resolveRange, rangeQuery, isMonthToDate } from "../../../../lib/report-range";
import { rangeTotals } from "../../../../lib/report-data";
import { DAILY_LEVELS, buildDaily, dailyLevel, reportExportHref, searchReport } from "../../../../lib/report-builders";
import type { DailyRow as Row } from "../../../../lib/report-builders";
import { reportPageHref } from "../../../../lib/report-paging";
import { PageHeader, SummaryStrip } from "../../../components/Kit";
import { ReportActionBar, ReportDateBar, ReportSearch } from "../../../components/ReportShell";
import { ReportTable } from "../../../components/ReportTable";
import type { Column } from "../../../components/ReportTable";
import { Icon } from "../../../components/icons";

export const dynamic = "force-dynamic";

const money = (n: number) => `৳${Math.round(n).toLocaleString()}`;

export default async function DailySummary({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    page?: string;
    q?: string;
    level?: string;
    supervisor?: string;
  }>;
}) {
  await requireUser(["ADMIN", "IT"]);
  const sp = await searchParams;
  const range = resolveRange(sp.from, sp.to);
  const level = dailyLevel(sp.level);
  // A supervisor filter only means anything in the RSO view — it is where the
  // drill-down lands. Carrying it into the other levels would filter a list
  // that has no supervisor column and leave the reader with no way to see why.
  const supervisor = level === "rso" ? sp.supervisor : undefined;

  const [built, totals] = await Promise.all([buildDaily(range, level, supervisor), rangeTotals(range)]);
  const { rows, matched, unfiltered } = searchReport(built, sp.q);

  const who = level === "supervisor" ? "Supervisor" : level === "rso" ? "RSO" : "BP";
  const hasValue = level !== "bp";

  const columns: Column<Row>[] = [
    {
      key: "name",
      label: who,
      // Only at supervisor level: the name is the way into that team's RSOs.
      render:
        level === "supervisor"
          ? (r) => (
              <Link
                className="kit-tablelink"
                href={reportPageHref(
                  "/it/reports/daily",
                  { from: range.from, to: range.to, level: "rso", supervisor: r.name },
                  1,
                )}
              >
                {r.name}
              </Link>
            )
          : undefined,
    },
    ...(level === "supervisor"
      ? ([{ key: "rsoCount", label: "RSOs", align: "right" }] as Column<Row>[])
      : level === "rso"
        ? ([{ key: "supervisor", label: "Supervisor" }] as Column<Row>[])
        : ([{ key: "supervisor", label: "RSO" }] as Column<Row>[])),
    ...(level === "bp"
      ? []
      : ([
          { key: "retailerCount", label: "Retailers", align: "right", render: (r) => r.retailerCount.toLocaleString() },
        ] as Column<Row>[])),
    { key: "standardGa", label: "GA (period)", align: "right", render: (r) => r.standardGa.toLocaleString() },
    ...(isMonthToDate(range)
      ? []
      : [{ key: "mtdGa", label: "GA (MTD)", align: "right" as const, render: (r: Row) => r.mtdGa.toLocaleString() }]),
    { key: "gaTarget", label: "Monthly GA Target", align: "right", render: (r) => r.gaTarget.toLocaleString() },
    {
      key: "achievement",
      // Named for what it divides: month-to-date GA over the monthly target.
      label: "MTD Achievement %",
      align: "right",
      render: (r) => (r.gaTarget ? `${r.achievement}%` : "—"),
    },
    ...(hasValue
      ? ([
          { key: "c2cAmount", label: "C2C", align: "right", render: (r: Row) => money(r.c2cAmount) },
          { key: "c2sAmount", label: "C2S", align: "right", render: (r: Row) => money(r.c2sAmount) },
        ] as Column<Row>[])
      : []),
  ];

  const summary = [
    `DMS Daily Summary`,
    `Period: ${rangeLabel(range)}`,
    ...(supervisor ? [`Supervisor: ${supervisor}`] : []),
    ``,
    `Total GA: ${totals.standardGa.toLocaleString()}`,
    `SIM Swap: ${totals.simSwap.toLocaleString()}`,
    ...(totals.unknownGa ? [`Unrecognised product codes: ${totals.unknownGa.toLocaleString()}`] : []),
    `Total C2C: ${money(totals.c2cAmount)}`,
    `Total C2S: ${money(totals.c2sAmount)} (${totals.c2sTransactions.toLocaleString()} trx)`,
    ``,
    `${who}s: ${rows.length}`,
    ...(level === "supervisor" ? [`RSOs: ${rows.reduce((a, r) => a + r.rsoCount, 0)}`] : []),
    ...(hasValue ? [`Retailers: ${rows.reduce((a, r) => a + r.retailerCount, 0).toLocaleString()}`] : []),
  ].join("\n");

  const levelParam = level === "supervisor" ? undefined : level;
  const pageParams = { from: range.from, to: range.to, level: levelParam, supervisor };

  return (
    <main className="page">
      <Link href={`/it/reports?${rangeQuery(range)}`} className="kit-detail-back no-print">
        <Icon name="arrow" /> Back to Reports
      </Link>
      <PageHeader
        title="Daily Summary"
        subtitle={`Report Period: ${rangeLabel(range)}${supervisor ? ` • ${supervisor}` : ""}`}
        action={
          <ReportActionBar
            exportHref={reportExportHref("daily", range, {
              ...(levelParam ? { level: levelParam } : {}),
              ...(supervisor ? { supervisor } : {}),
            })}
            rowCount={rows.length}
            summary={summary}
          />
        }
      />
      <ReportDateBar range={range} />

      <div className="kit-report-presets no-print kit-mb-12">
        {DAILY_LEVELS.map((l) => (
          <Link
            key={l.key}
            // Changing level clears the supervisor drill-down: it belongs to
            // the RSO view, and carrying it to "By BP" would silently filter a
            // list that never had a supervisor column.
            href={reportPageHref(
              "/it/reports/daily",
              { from: range.from, to: range.to, level: l.key === "supervisor" ? undefined : l.key },
              1,
            )}
            className={`kit-preset${level === l.key ? " is-active" : ""}`}
          >
            {l.label}
          </Link>
        ))}
      </div>

      {supervisor && (
        <div className="kit-note is-info no-print" role="status">
          <Icon name="filter" />
          <span>
            Showing only <b>{supervisor}</b>&apos;s RSOs.{" "}
            <Link href={reportPageHref("/it/reports/daily", { from: range.from, to: range.to, level: "rso" }, 1)}>
              Show every RSO →
            </Link>
          </span>
        </div>
      )}

      <SummaryStrip
        items={[
          { label: "Total GA", value: totals.standardGa.toLocaleString(), tone: "teal" },
          { label: "SIM Swap", value: totals.simSwap.toLocaleString() },
          { label: "Total C2C", value: money(totals.c2cAmount) },
          { label: `Total C2S · ${totals.c2sTransactions.toLocaleString()} trx`, value: money(totals.c2sAmount) },
        ]}
      />
      <ReportSearch matched={matched} total={unfiltered} noun={who === "BP" ? "BP" : who.toLowerCase()} />
      <ReportTable
        columns={columns}
        rows={rows}
        paging={{
          page: sp.page,
          noun: who === "BP" ? "BP" : who.toLowerCase(),
          hrefFor: (p) => reportPageHref("/it/reports/daily", pageParams, p),
        }}
        emptyTitle={`No ${who} activity for this period`}
        emptyHint="Check Data Readiness on the Reporting Center — a feed may not be imported for these dates."
      />
    </main>
  );
}

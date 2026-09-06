/**
 * Every Reporting Center report, built in one place.
 *
 * ## Why this file exists
 *
 * Each report used to compute its rows inside its page component, and the page
 * passed the finished `exportRows` array to a client component so the browser
 * could build the workbook. That had two costs, both measured in v152:
 *
 * 1. **The whole report shipped on every page load.** Every row appeared three
 *    times in the document — once in the desktop table, once again in the
 *    mobile cards, and a third time in the RSC flight payload, which also
 *    carried the export array. `/it/reports/performance/retailer` was
 *    **1,018,255 bytes** with only 260 retailers seeded, 69% of it flight
 *    payload. The company's real retailer count is a multiple of that.
 * 2. **`xlsx` was a client dependency.** ~400 KB, dynamically imported, in a
 *    browser, to format numbers the server already had.
 *
 * Paging the table fixes the first cost only if the export stops riding along
 * with it — otherwise the page still carries every row for a button most
 * viewings never press. So the export moved to `/api/reports/export`, and that
 * route needs to rebuild any report from its URL alone.
 *
 * ## Why the builders live here and not in the pages
 *
 * The route could have had its own copy of each report's row logic. It would
 * have worked on the day it was written and drifted by the second change: a
 * column added to a page, an ordering fixed, a filter corrected, and the
 * spreadsheet quietly disagrees with the screen that produced it. A wrong
 * number in a file someone forwards is worse than a missing one.
 *
 * So a report is built exactly once, here, and both callers read that result:
 * the page renders `rows` (a page of them) and the route writes `exportRows`.
 * The `reportKey` a page passes to its action bar is the same key the route
 * looks up, and `tests/report-export.smoke.test.ts` fails if a page names a key
 * the registry does not have.
 *
 * Presentation is deliberately NOT here. Columns carry `render` functions that
 * return React nodes, and the export route has no business importing those.
 * Pages own their columns; this file owns rows and the values in them.
 */

import {
  bpActivation,
  retailerReport,
  rollUpToSupervisor,
  rsoActivation,
  rsoSummary,
  supervisorSummary,
} from "./report-data";
import type { ActivationRow, RetailerReportRow, RsoSummaryRow, SupervisorSummaryRow } from "./report-data";
import { isMonthToDate, monthToDate, resolveRange } from "./report-range";
import type { ReportRange } from "./report-range";
import { targetPercent } from "./achievement";
import { LSO_MIN_MONTHLY_AMOUNT, LSO_MIN_MONTHLY_TRANSACTIONS, SSO_MIN_MONTHLY_STANDARD_GA } from "./business-rules";

/**
 * One row of a spreadsheet, keyed by its column heading.
 *
 * Defined here rather than in the client component that used to own it: the
 * export route is server-only and must not import from a `"use client"`
 * module to name a type.
 */
export type ExportRow = Record<string, string | number>;

/** Everything a report page needs that depends on rows it no longer holds. */
export type Built<T> = {
  /** Every row, in display order. The page shows a slice; the export takes all. */
  rows: T[];
  /** The same rows as spreadsheet records, keys being the on-screen headings. */
  exportRows: ExportRow[];
};

const round = (n: number) => Math.round(n);

/* ------------------------------------------------------------------ *
 * Daily Summary
 * ------------------------------------------------------------------ */
export type DailyRow = {
  id: string;
  name: string;
  rsoCount: number;
  retailerCount: number;
  standardGa: number;
  mtdGa: number;
  gaTarget: number;
  achievement: number;
  c2cAmount: number;
  c2sAmount: number;
};

export async function buildDaily(range: ReportRange): Promise<Built<DailyRow>> {
  const mtd = monthToDate(range);
  const [supervisors, mtdRows] = await Promise.all([
    supervisorSummary(range),
    // The GA target is a MONTHLY figure. Comparing one day's activations
    // against it produced an "Achievement %" that read as catastrophic
    // under-performance every morning; month-to-date is the comparison that
    // matches the denominator. Skipped when the range already is the month.
    isMonthToDate(range) ? Promise.resolve(null) : supervisorSummary(mtd),
  ]);
  const mtdGaById = new Map((mtdRows ?? supervisors).map((r: SupervisorSummaryRow) => [r.id, r.standardGa]));

  const rows: DailyRow[] = supervisors.map((s) => {
    const mtdGa = mtdGaById.get(s.id) ?? s.standardGa;
    return {
      id: s.id,
      name: s.name,
      rsoCount: s.rsoCount,
      retailerCount: s.retailerCount,
      standardGa: s.standardGa,
      mtdGa,
      gaTarget: s.gaTarget,
      achievement: targetPercent(mtdGa, s.gaTarget),
      c2cAmount: s.c2cAmount,
      c2sAmount: s.c2sAmount,
    };
  });

  return {
    rows,
    exportRows: rows.map((r) => ({
      Supervisor: r.name,
      RSO: r.rsoCount,
      Retailer: r.retailerCount,
      "GA (period)": r.standardGa,
      "GA (MTD)": r.mtdGa,
      "Monthly GA Target": r.gaTarget,
      "MTD Achievement %": r.gaTarget ? r.achievement : "",
      C2C: round(r.c2cAmount),
      C2S: round(r.c2sAmount),
    })),
  };
}

/* ------------------------------------------------------------------ *
 * Activation
 * ------------------------------------------------------------------ */
export const ACTIVATION_GROUPS = [
  { key: "supervisor", label: "By Supervisor" },
  { key: "rso", label: "By RSO" },
  { key: "bp", label: "By BP" },
] as const;
export type ActivationGroup = (typeof ACTIVATION_GROUPS)[number]["key"];

export const ACTIVATION_SUB_LABEL: Record<ActivationGroup, string> = {
  supervisor: "RSOs",
  rso: "Supervisor",
  bp: "RSO",
};

export const activationGroup = (v?: string): ActivationGroup =>
  (ACTIVATION_GROUPS.find((g) => g.key === v)?.key ?? "supervisor") as ActivationGroup;

export async function buildActivation(range: ReportRange, group: ActivationGroup): Promise<Built<ActivationRow>> {
  // Only the grouping actually being shown is queried.
  const source: ActivationRow[] =
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

  const rows = [...source].sort((a, b) => b.activation - a.activation || a.name.localeCompare(b.name));
  return {
    rows,
    exportRows: rows.map((r) => ({
      Name: r.name,
      Code: r.code,
      [ACTIVATION_SUB_LABEL[group]]: r.sub,
      Activation: r.activation,
      Target: r.target,
      "Achievement %": r.target ? targetPercent(r.activation, r.target) : "",
    })),
  };
}

/* ------------------------------------------------------------------ *
 * Entity performance — supervisor, RSO, BP, retailer
 * ------------------------------------------------------------------ */
export const PERFORMANCE_KINDS = {
  supervisor: "Supervisor Performance",
  rso: "RSO Performance",
  bp: "BP Performance",
  retailer: "Retailer Performance",
} as const;
export type PerformanceKind = keyof typeof PERFORMANCE_KINDS;

export const isPerformanceKind = (v: string): v is PerformanceKind => v in PERFORMANCE_KINDS;

export type PerformanceRow = {
  id: string;
  name: string;
  code: string;
  sub: string;
  /**
   * Position in the ranking, assigned once during the sort.
   *
   * It used to be a column that called `ordered.indexOf(row)` for every row it
   * rendered — and `ReportTable` renders each row twice, once for the desktop
   * table and once for the mobile card. That is a linear scan per row per
   * rendering: 2n² reference comparisons to number rows the sort had already
   * put in order. Storing it here is what the export beside it always did.
   */
  rank: number;
  achieved: number;
  target: number;
  ssoComplete?: boolean;
  lsoComplete?: boolean;
  c2c?: number;
  c2s?: number;
};

export async function buildPerformance(range: ReportRange, kind: PerformanceKind): Promise<Built<PerformanceRow>> {
  type Pre = Omit<PerformanceRow, "rank">;
  let pre: Pre[];
  if (kind === "bp") {
    pre = (await bpActivation(range)).map((b) => ({
      id: b.id,
      name: b.name,
      code: b.code,
      sub: b.sub,
      achieved: b.activation,
      target: b.target,
    }));
  } else if (kind === "retailer") {
    pre = (await retailerReport(range)).map((r) => ({
      id: r.id,
      name: r.retailerName,
      code: r.retailerCode,
      sub: `${r.supervisor} / ${r.employeeName}`,
      achieved: r.ga,
      target: 0,
      c2c: r.c2c,
      c2s: r.c2s,
      ssoComplete: r.ssoComplete,
      lsoComplete: r.lsoComplete,
    }));
  } else {
    const summary = await rsoSummary(range);
    const source = kind === "supervisor" ? rollUpToSupervisor(summary) : summary;
    pre = source.map((r) => ({
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
  const rows: PerformanceRow[] = [...pre]
    .sort((a, b) =>
      hasTargets
        ? targetPercent(b.achieved, b.target) - targetPercent(a.achieved, a.target) || b.achieved - a.achieved
        : b.achieved - a.achieved || a.name.localeCompare(b.name),
    )
    .map((r, i) => ({ ...r, rank: i + 1 }));

  return {
    rows,
    exportRows: rows.map((r) => ({
      "#": r.rank,
      Name: r.name,
      Code: r.code,
      Context: r.sub,
      GA: r.achieved,
      ...(hasTargets
        ? { Target: r.target, "Achievement %": r.target ? targetPercent(r.achieved, r.target) : "" }
        : {
            C2C: round(r.c2c ?? 0),
            C2S: round(r.c2s ?? 0),
            // The screen shows these as a pair of badges under "Execution".
            // A spreadsheet cannot show a badge, so it says the same thing in
            // words rather than dropping the column.
            Execution: `SSO ${r.ssoComplete ? "complete" : "pending"}, LSO ${r.lsoComplete ? "complete" : "pending"}`,
          }),
    })),
  };
}

/* ------------------------------------------------------------------ *
 * C2C / C2S value report
 * ------------------------------------------------------------------ */
export const VALUE_GROUPS = [
  { key: "supervisor", label: "By Supervisor" },
  { key: "rso", label: "By RSO" },
  { key: "retailer", label: "By Retailer" },
] as const;
export type ValueGroup = (typeof VALUE_GROUPS)[number]["key"];

export const valueGroup = (v?: string): ValueGroup =>
  (VALUE_GROUPS.find((g) => g.key === v)?.key ?? "supervisor") as ValueGroup;

export type ValueRow = { id: string; name: string; code: string; sub: string; value: number; target: number };

export async function buildValue(
  range: ReportRange,
  metric: "c2c" | "c2s",
  group: ValueGroup,
): Promise<Built<ValueRow> & { total: number; totalTarget: number }> {
  const label = metric.toUpperCase();
  // Only C2C carries a target in this schema — MonthlyTarget has c2cTarget but
  // no c2sTarget — so the C2S view shows value and share and simply omits the
  // achievement column rather than inventing a target to fill the space.
  const hasTarget = metric === "c2c";

  let pre: ValueRow[];
  if (group === "retailer") {
    pre = (await retailerReport(range)).map((r) => ({
      id: r.id,
      name: r.retailerName,
      code: r.retailerCode,
      sub: `${r.supervisor} / ${r.employeeName}`,
      value: metric === "c2c" ? r.c2c : r.c2s,
      target: 0, // no per-retailer targets exist in this schema
    }));
  } else {
    const summary = await rsoSummary(range);
    const source = group === "supervisor" ? rollUpToSupervisor(summary) : summary;
    pre = source.map((r: RsoSummaryRow) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      sub: group === "supervisor" ? `${r.retailerCount.toLocaleString()} retailers` : r.supervisor,
      value: metric === "c2c" ? r.c2c : r.c2s,
      target: metric === "c2c" ? r.c2cTarget : 0,
    }));
  }

  const rows = [...pre].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const total = rows.reduce((a, r) => a + r.value, 0);
  const totalTarget = rows.reduce((a, r) => a + r.target, 0);
  const showTarget = hasTarget && group !== "retailer";

  return {
    rows,
    total,
    totalTarget,
    exportRows: rows.map((r) => ({
      Name: r.name,
      Code: r.code,
      Context: r.sub,
      [`${label} Value`]: round(r.value),
      ...(showTarget
        ? { Target: round(r.target), "Achievement %": r.target ? targetPercent(r.value, r.target) : "" }
        : {}),
      // The screen has always had a Share column; the sheet had not, which made
      // the two disagree about how many columns the report has.
      Share: total ? Math.round((r.value / total) * 1000) / 10 : "",
    })),
  };
}

/* ------------------------------------------------------------------ *
 * Target vs Achievement
 * ------------------------------------------------------------------ */
export const TARGET_GROUPS = [
  { key: "supervisor", label: "By Supervisor" },
  { key: "rso", label: "By RSO" },
] as const;
export type TargetGroup = (typeof TARGET_GROUPS)[number]["key"];

export const targetGroup = (v?: string): TargetGroup =>
  (TARGET_GROUPS.find((g) => g.key === v)?.key ?? "supervisor") as TargetGroup;

export async function buildTarget(range: ReportRange, group: TargetGroup): Promise<Built<RsoSummaryRow>> {
  const summary = await rsoSummary(range);
  const source = group === "supervisor" ? rollUpToSupervisor(summary) : summary;
  const rows = [...source].sort(
    (a, b) => targetPercent(b.ga, b.gaTarget) - targetPercent(a.ga, a.gaTarget) || a.name.localeCompare(b.name),
  );

  return {
    rows,
    /*
     * The sheet carries every column the screen shows.
     *
     * It used to give the four raw pairs and the GA percentage only, dropping
     * "SSO %", "LSO %" and "C2C %" — three of the nine columns on screen, and
     * the three a reader is most likely to be looking for, since a percentage
     * is the whole point of a target report. Anyone reconciling the file
     * against the page found columns missing and no note saying why.
     */
    exportRows: rows.map((r) => ({
      Name: r.name,
      GA: r.ga,
      "GA Target": r.gaTarget,
      "GA %": r.gaTarget ? targetPercent(r.ga, r.gaTarget) : "",
      SSO: r.sso,
      "SSO Target": r.ssoTarget,
      "SSO %": r.ssoTarget ? targetPercent(r.sso, r.ssoTarget) : "",
      LSO: r.lso,
      "LSO Target": r.lsoTarget,
      "LSO %": r.lsoTarget ? targetPercent(r.lso, r.lsoTarget) : "",
      C2C: round(r.c2c),
      "C2C Target": round(r.c2cTarget),
      "C2C %": r.c2cTarget ? targetPercent(r.c2c, r.c2cTarget) : "",
    })),
  };
}

/* ------------------------------------------------------------------ *
 * Retailer execution reports — SSO, LSO, Low C2S, Opening Balance
 * ------------------------------------------------------------------ */
export const LOW_C2S_VIEWS = [
  { key: "all", label: "All" },
  { key: "bottom10", label: "Bottom 10" },
  { key: "bottom20", label: "Bottom 20" },
  { key: "zero", label: "Zero C2S Only" },
] as const;
export type LowC2sView = (typeof LOW_C2S_VIEWS)[number]["key"];

export const lowC2sView = (v?: string): LowC2sView =>
  (LOW_C2S_VIEWS.find((x) => x.key === v)?.key ?? "all") as LowC2sView;

export const retailerIdentityExport = (r: RetailerReportRow) => ({
  Retailer: r.retailerName,
  Code: r.retailerCode,
  Supervisor: r.supervisor,
  RSO: r.employeeName,
  BP: r.bpName,
});

export async function buildSso(
  range: ReportRange,
): Promise<Built<RetailerReportRow> & { sellers: number; complete: number }> {
  const all = await retailerReport(range);
  // Non-SIM-seller retailers are excluded entirely: the SSO rule only applies
  // to them (lib/business-rules.ts isSsoComplete), so listing them as
  // "pending" would be inventing work that does not exist.
  const sellers = all.filter((r) => r.simSeller);
  /*
   * Closest to the requirement first — the same order LSO Pending uses, and
   * for the same reason it gives: "the ones closest to converting are not
   * buried under hopeless ones".
   *
   * This list is a call sheet. It used to sort by GA ascending, which put
   * every outlet on zero at the top and a seller sitting on 165 of 170 — one
   * activation from complete — below hundreds of rows nobody would reach. The
   * two pending reports now answer the same question in the same order.
   */
  const rows = sellers
    .filter((r) => !r.ssoComplete)
    .sort((a, b) => b.ga - a.ga || a.retailerCode.localeCompare(b.retailerCode));

  return {
    rows,
    sellers: sellers.length,
    complete: sellers.length - rows.length,
    exportRows: rows.map((r) => ({
      ...retailerIdentityExport(r),
      "GA Done": r.ga,
      Required: SSO_MIN_MONTHLY_STANDARD_GA,
      Remaining: Math.max(SSO_MIN_MONTHLY_STANDARD_GA - r.ga, 0),
    })),
  };
}

export async function buildLso(
  range: ReportRange,
): Promise<Built<RetailerReportRow> & { total: number; complete: number }> {
  const all = await retailerReport(range);
  // Closest to the amount requirement first, so the ones nearest converting
  // are not buried under hopeless ones.
  const rows = all
    .filter((r) => !r.lsoComplete)
    .sort((a, b) => b.c2s - a.c2s || a.retailerCode.localeCompare(b.retailerCode));

  return {
    rows,
    total: all.length,
    complete: all.length - rows.length,
    exportRows: rows.map((r) => ({
      ...retailerIdentityExport(r),
      "C2S Value": round(r.c2s),
      Trx: r.c2sTransactions,
      "Needs Amount": Math.max(LSO_MIN_MONTHLY_AMOUNT - r.c2s, 0),
      "Needs Trx": Math.max(LSO_MIN_MONTHLY_TRANSACTIONS - r.c2sTransactions, 0),
    })),
  };
}

export async function buildLowC2s(
  range: ReportRange,
  view: LowC2sView,
): Promise<Built<RetailerReportRow> & { total: number; zero: number; totalC2s: number }> {
  const all = await retailerReport(range);
  const ranked = [...all].sort((a, b) => a.c2s - b.c2s || a.retailerCode.localeCompare(b.retailerCode));
  const rows =
    view === "zero"
      ? ranked.filter((r) => r.c2s === 0)
      : view === "bottom10"
        ? ranked.slice(0, 10)
        : view === "bottom20"
          ? ranked.slice(0, 20)
          : ranked;

  return {
    rows,
    total: all.length,
    zero: all.filter((r) => r.c2s === 0).length,
    totalC2s: all.reduce((a, r) => a + r.c2s, 0),
    exportRows: rows.map((r) => ({
      ...retailerIdentityExport(r),
      "C2S Value": round(r.c2s),
      Trx: r.c2sTransactions,
      "C2C Value": round(r.c2c),
    })),
  };
}

export async function buildOpeningBalance(
  range: ReportRange,
): Promise<Built<RetailerReportRow> & { total: number; withBalance: number; totalBalance: number }> {
  const all = await retailerReport(range);
  const withBalance = all.filter((r) => r.openingBalance !== null);
  const rows = [...all].sort((a, b) => (b.openingBalance ?? -1) - (a.openingBalance ?? -1));

  return {
    rows,
    total: all.length,
    withBalance: withBalance.length,
    totalBalance: withBalance.reduce((a, r) => a + (r.openingBalance ?? 0), 0),
    exportRows: rows.map((r) => ({
      ...retailerIdentityExport(r),
      // Blank, not 0 — the sheet must not assert a balance that was never
      // imported. A missing OB row means "not in the latest snapshot", which
      // is a different fact from "balance is zero".
      "Opening Balance": r.openingBalance === null ? "" : round(r.openingBalance),
    })),
  };
}

/* ------------------------------------------------------------------ *
 * Custom report
 * ------------------------------------------------------------------ */
export const CUSTOM_LEVELS = [
  { key: "supervisor", label: "Supervisor" },
  { key: "rso", label: "RSO" },
  { key: "retailer", label: "Retailer" },
] as const;
export type CustomLevel = (typeof CUSTOM_LEVELS)[number]["key"];

// Every field here maps to a real number. `levels` marks where it is
// available: retailers carry no targets, so target-bearing fields are absent.
export const CUSTOM_FIELDS = [
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
export type CustomField = (typeof CUSTOM_FIELDS)[number]["key"];

const DEFAULT_CUSTOM_FIELDS: CustomField[] = ["ga", "c2c", "c2s"];

export type CustomRow = { id: string; name: string; code: string; sub: string } & Partial<
  Record<CustomField, number | null>
>;

export const customLevel = (v?: string): CustomLevel =>
  (CUSTOM_LEVELS.find((l) => l.key === v)?.key ?? "supervisor") as CustomLevel;

export function customFieldsFor(level: CustomLevel, requestedCsv?: string) {
  const available = CUSTOM_FIELDS.filter((f) => (f.levels as readonly string[]).includes(level));
  const requested = (requestedCsv ?? "").split(",").filter(Boolean) as CustomField[];
  const selected = available
    .map((f) => f.key)
    .filter((k) => (requested.length ? requested.includes(k) : DEFAULT_CUSTOM_FIELDS.includes(k)));
  const active: CustomField[] = selected.length ? selected : (available.map((f) => f.key).slice(0, 3) as CustomField[]);
  return { available, active };
}

export async function buildCustom(
  range: ReportRange,
  level: CustomLevel,
  active: CustomField[],
): Promise<Built<CustomRow>> {
  let pre: CustomRow[];
  if (level === "retailer") {
    pre = (await retailerReport(range)).map((r) => ({
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
    pre = source.map((r) => ({
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

  /*
   * Ordered by the first selected column, descending, then by name.
   *
   * This was the only report that never sorted. It rendered rows in whatever
   * order the data layer happened to produce, which meant a page of a paged
   * report had no defined membership: "page 2" was not a stable set of rows,
   * and two loads of the same link could disagree. Every other report sorts;
   * this one now does too, by the column the user chose to look at.
   */
  const first = active[0];
  const rows = [...pre].sort((a, b) => {
    const av = (first ? a[first] : null) ?? -Infinity;
    const bv = (first ? b[first] : null) ?? -Infinity;
    return bv - av || a.name.localeCompare(b.name);
  });

  const labelOf = (k: CustomField) => CUSTOM_FIELDS.find((f) => f.key === k)!.label;
  return {
    rows,
    exportRows: rows.map((r) => {
      const out: ExportRow = { Name: r.name, Code: r.code, Context: r.sub };
      for (const k of active) {
        const v = r[k];
        out[labelOf(k)] = v === null || v === undefined ? "" : round(v);
      }
      return out;
    }),
  };
}

/* ------------------------------------------------------------------ *
 * Registry — the export route's whole knowledge of what a report is
 * ------------------------------------------------------------------ */

/** Query parameters an export URL may carry, straight off the request. */
export type ExportQuery = {
  from?: string;
  to?: string;
  group?: string;
  level?: string;
  view?: string;
  kind?: string;
  fields?: string;
  metric?: string;
};

type Entry = { build: (q: ExportQuery, range: ReportRange) => Promise<{ exportRows: ExportRow[] }>; stem: string };

/**
 * Report key → builder.
 *
 * A page names its key when it renders its action bar, and the export route
 * looks the same key up here. `tests/report-export.smoke.test.ts` reads both
 * sides and fails on a key that exists in only one of them, so a new report
 * cannot ship with an Export button that 404s.
 */
export const REPORTS: Record<string, Entry> = {
  daily: { stem: "daily-summary", build: (_q, r) => buildDaily(r) },
  activation: {
    stem: "activation",
    build: (q, r) => buildActivation(r, activationGroup(q.group)),
  },
  performance: {
    stem: "performance",
    build: (q, r) => {
      const kind = q.kind && isPerformanceKind(q.kind) ? q.kind : "supervisor";
      return buildPerformance(r, kind);
    },
  },
  c2c: { stem: "c2c", build: (q, r) => buildValue(r, "c2c", valueGroup(q.group)) },
  c2s: { stem: "c2s", build: (q, r) => buildValue(r, "c2s", valueGroup(q.group)) },
  target: { stem: "target-vs-achievement", build: (q, r) => buildTarget(r, targetGroup(q.group)) },
  sso: { stem: "sso-pending", build: (_q, r) => buildSso(r) },
  lso: { stem: "lso-pending", build: (_q, r) => buildLso(r) },
  "low-c2s": { stem: "low-c2s", build: (q, r) => buildLowC2s(r, lowC2sView(q.view)) },
  ob: { stem: "opening-balance", build: (_q, r) => buildOpeningBalance(r) },
  custom: {
    stem: "custom",
    build: (q, r) => {
      const level = customLevel(q.level);
      return buildCustom(r, level, customFieldsFor(level, q.fields).active);
    },
  },
};

export type ReportKey = keyof typeof REPORTS;

/** The download's filename, without extension. Mirrors what the pages used. */
export function exportFilename(key: string, q: ExportQuery, range: ReportRange) {
  const entry = REPORTS[key];
  const suffix = q.kind ?? q.group ?? q.level ?? q.view ?? "";
  const stem = entry ? entry.stem : key;
  const middle = suffix && suffix !== "all" ? `-${suffix}` : "";
  return `${stem}${middle}-${range.from}_to_${range.to}`;
}

/** Build one report's spreadsheet rows from URL parameters alone. */
export async function buildExport(key: string, q: ExportQuery) {
  const entry = REPORTS[key];
  if (!entry) return null;
  const range = resolveRange(q.from, q.to);
  const { exportRows } = await entry.build(q, range);
  return { rows: exportRows, filename: exportFilename(key, q, range) };
}

/**
 * The Export Excel href for a report.
 *
 * **`page` is never included, and that is the point.** The screen shows sixty
 * rows; the file is the report. A `page` parameter here would silently turn
 * every export into whatever slice the reader happened to be looking at, and
 * they would have no way to tell from the file that rows were missing.
 */
export function reportExportHref(key: string, range: ReportRange, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({ report: key, from: range.from, to: range.to });
  for (const [k, v] of Object.entries(extra)) {
    // Dropped here rather than trusted not to be passed. The first version of
    // this function copied `extra` wholesale and carried a comment promising
    // it did not — a promise in a comment that the code did not keep, which is
    // how a caller ends up exporting one page and nobody notices. The refusal
    // belongs in the one place that builds every export URL.
    if (k === "page") continue;
    if (v) q.set(k, v);
  }
  return `/api/reports/export?${q.toString()}`;
}

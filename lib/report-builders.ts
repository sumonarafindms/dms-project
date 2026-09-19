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
  companyTotals,
  reportPerformanceRows,
  rollUpToSupervisor,
  rsoActivation,
  rsoSummary,
  supervisorSummary,
} from "./report-data";
import type {
  ActivationRow,
  CompanyTotals,
  RetailerReportRow,
  RsoSummaryRow,
  SupervisorSummaryRow,
} from "./report-data";
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
 * Search
 * ------------------------------------------------------------------ */

/**
 * Narrow a built report to the rows matching a search.
 *
 * ## Why it matches against the EXPORT rows
 *
 * `exportRows` is the report stated as one fact per column — the retailer, its
 * code, its wallet, the supervisor, the RSO, the RSO's wallet, the BP, whether
 * SSO is complete. Matching against those means a search covers every column a
 * reader can see, in every one of the twelve reports, without each report
 * having to declare which of its fields are searchable — a list that would be
 * wrong the first time a column was added.
 *
 * The display rows and the export rows are built in lockstep from the same
 * source, so index `i` is the same record in both. That is what lets this
 * filter one and keep the other aligned.
 *
 * ## What it deliberately does not touch
 *
 * The summary figures above the table. Those describe the whole period, and
 * searching for one supervisor must not make "Total Retailers: 2,431" read as
 * 40. Every builder computes them before this runs, for exactly that reason.
 */
/**
 * Bengali digits folded to Latin, for comparison only.
 *
 * Retailer and RSO wallet numbers are stored exactly as the carrier's
 * spreadsheet wrote them, which is Latin digits: `01700000001`. A person typing
 * on a Bengali keyboard produces `০১৭০০০০০০০০১` — the same number, not one
 * character of which matches. The search would have found nothing and looked
 * broken, and the operator would have had no way to tell why.
 *
 * Folded on both sides, so it works whichever way round the mismatch is, and
 * only for matching — nothing displayed or exported is rewritten. U+09E6…U+09EF
 * are the Bengali digits ০–৯ in order, so subtracting the base gives the value.
 */
/* Moved to lib/format.ts so a client component can use it without pulling this
   module's database imports. Re-exported so every existing import still works. */
export { foldDigits } from "./format";
import { foldDigits } from "./format";

export function searchReport<B extends Built<unknown>>(
  built: B,
  q?: string,
): B & { matched: number; unfiltered: number } {
  /*
   * The generic is `B extends Built<unknown>` rather than `Built<T>` so the
   * builder's own extras — `sellers`, `zero`, `withBalance`, `totalC2s` — come
   * through untouched. The first version returned `Built<T> & {…}`, which
   * silently erased them and broke every summary strip.
   *
   * The count is `unfiltered`, not `total`: four builders already return a
   * `total` of their own meaning something else (retailers in the period, not
   * rows before the search), and reusing the name shadowed theirs.
   */
  const unfiltered = built.rows.length;
  const needle = foldDigits((q ?? "").trim().toLowerCase());
  if (!needle) return { ...built, matched: unfiltered, unfiltered };

  const keep: number[] = [];
  built.exportRows.forEach((row, i) => {
    // Joined with a space so a query cannot accidentally span two columns —
    // searching "Shuvo Pranto" should not match a row whose supervisor ends in
    // "Shuvo" and whose next column begins "Pranto" only because the two were
    // concatenated without a gap.
    const hay = foldDigits(Object.values(row).join(" ").toLowerCase());
    if (hay.includes(needle)) keep.push(i);
  });

  return {
    ...built,
    rows: keep.map((i) => built.rows[i]),
    exportRows: keep.map((i) => built.exportRows[i]),
    matched: keep.length,
    unfiltered,
  };
}

/*
 * ------------------------------------------------------------------ *
 * Spreadsheet identity blocks
 * ------------------------------------------------------------------ *
 *
 * One fact per column, always.
 *
 * The exports used to pack two facts into one cell to save width on screen:
 * `Context` held "Shaheen / Dipu" — a supervisor and an RSO — and `Execution`
 * held "SSO pending, LSO pending". Both read fine in a table and are useless in
 * a spreadsheet, which is a tool for sorting and filtering columns. Nobody can
 * filter "all of Shaheen's outlets" out of a column that also contains the RSO
 * name, and the RSO's wallet number — the thing you dial to chase an outlet —
 * was not in the file at all.
 *
 * These helpers are the single definition of who a row belongs to, so the
 * twelve reports cannot drift into twelve different column orders.
 */

/**
 * `"—"` on screen, empty in a sheet.
 *
 * A dash is how the UI says "no value", and it is right there. In a spreadsheet
 * it is a *value*: it sorts, it survives a filter, and `COUNTA` counts it. An
 * empty cell is the only honest way to write "we do not have this".
 */
const blankIfDash = (v: string | null | undefined) => (!v || v === "—" ? "" : v);

/** A yes/no fact as a word, never a badge and never a blank. */
const doneOrPending = (ok: boolean) => (ok ? "Complete" : "Pending");

/** Everything identifying one outlet, each in its own column. */
export const retailerIdentity = (r: RetailerReportRow): ExportRow => ({
  Retailer: r.retailerName,
  "Retailer Code": r.retailerCode,
  "Retailer Wallet": blankIfDash(r.retailerWallet),
  Category: blankIfDash(r.category),
  Route: blankIfDash(r.route),
  Supervisor: r.supervisor,
  RSO: r.employeeName,
  "RSO Wallet": blankIfDash(r.employeeMsisdn),
  BP: blankIfDash(r.bpName),
});

/** Everything identifying one RSO or one supervisor rollup. */
export const personIdentity = (r: RsoSummaryRow, level: "supervisor" | "rso"): ExportRow =>
  level === "supervisor"
    ? { Supervisor: r.name, Retailers: r.retailerCount }
    : {
        RSO: r.name,
        "RSO Code": blankIfDash(r.code),
        "RSO Wallet": blankIfDash(r.msisdn),
        Supervisor: r.supervisor,
        Retailers: r.retailerCount,
      };

/* ------------------------------------------------------------------ *
 * Daily Summary
 * ------------------------------------------------------------------ */

/**
 * Daily Summary answers the same question at three levels.
 *
 * It used to show supervisors and nothing else, and the supervisor's name was
 * plain text — so the obvious gesture, clicking the name of the team you want
 * to look at, did nothing. There was no way to get from "Shaheen's team did 7
 * GA" to "which of Shaheen's ten RSOs did it".
 *
 * Now the level is in the URL, like the date range and the page, so a view of
 * one team is a link someone can send.
 */
export const DAILY_LEVELS = [
  { key: "supervisor", label: "By Supervisor" },
  { key: "rso", label: "By RSO" },
  { key: "bp", label: "By BP" },
] as const;
export type DailyLevel = (typeof DAILY_LEVELS)[number]["key"];

export const dailyLevel = (v?: string): DailyLevel =>
  (DAILY_LEVELS.find((l) => l.key === v)?.key ?? "supervisor") as DailyLevel;

export type DailyRow = {
  id: string;
  name: string;
  /** Blank at supervisor level, where the row IS the supervisor. */
  supervisor: string;
  /** RSOs under a supervisor; 0 for an RSO or BP row. */
  rsoCount: number;
  retailerCount: number;
  standardGa: number;
  mtdGa: number;
  gaTarget: number;
  achievement: number;
  c2cAmount: number;
  c2sAmount: number;
  /**
   * Whether this row has C2C/C2S at all.
   *
   * A BP's activations are counted through BpAssignment, which carries a GA
   * target and nothing else — there is no per-BP recharge in this schema. The
   * columns are therefore absent from the BP view rather than filled with
   * zeros, which would read as "this BP sold nothing" instead of "this system
   * does not track that for a BP".
   */
  hasValue: boolean;
};

export async function buildDaily(
  range: ReportRange,
  level: DailyLevel = "supervisor",
  supervisor?: string,
): Promise<Built<DailyRow>> {
  const mtd = monthToDate(range);
  // The GA target is a MONTHLY figure. Comparing one day's activations against
  // it produced an "Achievement %" that read as catastrophic under-performance
  // every morning; month-to-date is the comparison that matches the
  // denominator. Skipped when the range already is the month.
  const needsMtd = !isMonthToDate(range);

  let rows: DailyRow[];

  if (level === "bp") {
    const [now, then] = await Promise.all([bpActivation(range), needsMtd ? bpActivation(mtd) : Promise.resolve(null)]);
    const mtdById = new Map((then ?? now).map((b) => [b.id, b.activation]));
    rows = now.map((b) => {
      const mtdGa = mtdById.get(b.id) ?? b.activation;
      return {
        id: b.id,
        name: b.name,
        supervisor: b.sub, // the RSO this BP reports to
        rsoCount: 0,
        retailerCount: 0,
        standardGa: b.activation,
        mtdGa,
        gaTarget: b.target,
        achievement: targetPercent(mtdGa, b.target),
        c2cAmount: 0,
        c2sAmount: 0,
        hasValue: false,
      };
    });
  } else if (level === "rso") {
    const [now, then] = await Promise.all([rsoSummary(range), needsMtd ? rsoSummary(mtd) : Promise.resolve(null)]);
    const mtdById = new Map((then ?? now).map((r) => [r.id, r.ga]));
    rows = now.map((r) => {
      const mtdGa = mtdById.get(r.id) ?? r.ga;
      return {
        id: r.id,
        name: r.name,
        supervisor: r.supervisor,
        rsoCount: 0,
        retailerCount: r.retailerCount,
        standardGa: r.ga,
        mtdGa,
        gaTarget: r.gaTarget,
        achievement: targetPercent(mtdGa, r.gaTarget),
        c2cAmount: r.c2c,
        c2sAmount: r.c2s,
        hasValue: true,
      };
    });
    /*
     * Drill-down from a supervisor's name.
     *
     * Filtered here rather than in the page so the row count in the summary and
     * the pager agree with what is on screen, and so the link is a complete
     * description of the view.
     */
    if (supervisor) rows = rows.filter((r) => r.supervisor === supervisor);
  } else {
    const [now, then] = await Promise.all([
      supervisorSummary(range),
      needsMtd ? supervisorSummary(mtd) : Promise.resolve(null),
    ]);
    const mtdById = new Map((then ?? now).map((r: SupervisorSummaryRow) => [r.id, r.standardGa]));
    rows = now.map((s) => {
      const mtdGa = mtdById.get(s.id) ?? s.standardGa;
      return {
        id: s.id,
        name: s.name,
        supervisor: "",
        rsoCount: s.rsoCount,
        retailerCount: s.retailerCount,
        standardGa: s.standardGa,
        mtdGa,
        gaTarget: s.gaTarget,
        achievement: targetPercent(mtdGa, s.gaTarget),
        c2cAmount: s.c2cAmount,
        c2sAmount: s.c2sAmount,
        hasValue: true,
      };
    });
  }

  const who = level === "supervisor" ? "Supervisor" : level === "rso" ? "RSO" : "BP";
  return {
    rows,
    exportRows: rows.map((r) => ({
      [who]: r.name,
      // "RSOs"/"Retailers", not "RSO"/"Retailer": these are counts, and the
      // singular headings read as though the cell held a name.
      ...(level === "supervisor"
        ? { RSOs: r.rsoCount, Retailers: r.retailerCount }
        : level === "rso"
          ? { Supervisor: r.supervisor, Retailers: r.retailerCount }
          : { RSO: blankIfDash(r.supervisor) }),
      "GA (period)": r.standardGa,
      "GA (MTD)": r.mtdGa,
      "Monthly GA Target": r.gaTarget,
      "MTD Achievement %": r.gaTarget ? r.achievement : "",
      ...(r.hasValue ? { C2C: round(r.c2cAmount), C2S: round(r.c2sAmount) } : {}),
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
    /*
     * The heading names what the row IS, rather than a generic "Name".
     * `sub` carries a different fact per grouping — a count of RSOs under a
     * supervisor, a supervisor's name under an RSO, an RSO's name under a BP —
     * so it gets a heading that says which, instead of one column meaning
     * three things depending on a URL parameter the file does not carry.
     */
    exportRows: rows.map((r) => {
      const who = group === "supervisor" ? "Supervisor" : group === "rso" ? "RSO" : "BP";
      return {
        [who]: r.name,
        [`${who} Code`]: blankIfDash(r.code),
        [group === "supervisor" ? "RSOs" : ACTIVATION_SUB_LABEL[group]]:
          group === "supervisor" ? Number(r.sub) || 0 : blankIfDash(r.sub),
        Activation: r.activation,
        Target: r.target,
        "Achievement %": r.target ? targetPercent(r.activation, r.target) : "",
      };
    }),
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
  /**
   * The row's identity as spreadsheet columns, one fact each.
   *
   * Built where the source record is still in hand. `sub` above is the screen's
   * compact form ("Shaheen / Dipu") and stays that way — a table column is
   * narrow and a reader takes it in at a glance. A sheet is filtered and
   * sorted, so it gets the pieces separately.
   */
  identity: ExportRow;
};

export async function buildPerformance(
  range: ReportRange,
  kind: PerformanceKind,
): Promise<Built<PerformanceRow> & { totals: CompanyTotals | null }> {
  type Pre = Omit<PerformanceRow, "rank">;
  let pre: Pre[];
  /*
   * Null for a BP or retailer grouping, on purpose: those rows ARE the things
   * themselves, nothing is held aside and nothing is shared, so the sum of
   * them IS the total and the page uses it.
   */
  let company: CompanyTotals | null = null;
  if (kind === "bp") {
    pre = (await bpActivation(range)).map((b) => ({
      id: b.id,
      name: b.name,
      code: b.code,
      sub: b.sub,
      achieved: b.activation,
      target: b.target,
      identity: { BP: b.name, "BP Code": blankIfDash(b.code), RSO: blankIfDash(b.sub) },
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
      identity: retailerIdentity(r),
    }));
  } else {
    const perf = await reportPerformanceRows(range);
    company = await companyTotals(range, kind === "supervisor" ? "supervisor" : "rso", perf);
    const source = kind === "supervisor" ? await rollUpToSupervisor(range, perf) : await rsoSummary(range, perf);
    pre = source.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      sub: kind === "supervisor" ? `${r.retailerCount.toLocaleString("en-US")} retailers` : r.supervisor,
      achieved: r.ga,
      target: r.gaTarget,
      c2c: r.c2c,
      c2s: r.c2s,
      identity: personIdentity(r, kind === "supervisor" ? "supervisor" : "rso"),
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
    totals: company,
    exportRows: rows.map((r) => ({
      Rank: r.rank,
      ...r.identity,
      GA: r.achieved,
      ...(hasTargets
        ? { "GA Target": r.target, "Achievement %": r.target ? targetPercent(r.achieved, r.target) : "" }
        : {
            C2C: round(r.c2c ?? 0),
            C2S: round(r.c2s ?? 0),
            // The screen shows these as a pair of badges under one "Execution"
            // heading. A sheet gets them as two columns, so "show me every
            // outlet whose SSO is pending" is a filter rather than a search.
            SSO: doneOrPending(!!r.ssoComplete),
            LSO: doneOrPending(!!r.lsoComplete),
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

export type ValueRow = {
  id: string;
  name: string;
  code: string;
  sub: string;
  value: number;
  target: number;
  /** Identity as separate spreadsheet columns; see PerformanceRow.identity. */
  identity: ExportRow;
};

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
  // Fetched once when the grouping needs it, and shared with the strip below.
  let valuePerf: Awaited<ReturnType<typeof reportPerformanceRows>> | undefined;
  if (group === "retailer") {
    pre = (await retailerReport(range)).map((r) => ({
      id: r.id,
      name: r.retailerName,
      code: r.retailerCode,
      sub: `${r.supervisor} / ${r.employeeName}`,
      value: metric === "c2c" ? r.c2c : r.c2s,
      target: 0, // no per-retailer targets exist in this schema
      identity: retailerIdentity(r),
    }));
  } else {
    valuePerf = await reportPerformanceRows(range);
    const source =
      group === "supervisor" ? await rollUpToSupervisor(range, valuePerf) : await rsoSummary(range, valuePerf);
    pre = source.map((r: RsoSummaryRow) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      sub: group === "supervisor" ? `${r.retailerCount.toLocaleString("en-US")} retailers` : r.supervisor,
      value: metric === "c2c" ? r.c2c : r.c2s,
      target: metric === "c2c" ? r.c2cTarget : 0,
      identity: personIdentity(r, group === "supervisor" ? "supervisor" : "rso"),
    }));
  }

  const rows = [...pre].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  /*
   * The strip is the company for a person grouping, and the sum of the rows
   * for a retailer one. See `companyTotals` in lib/report-data.ts: an RSO row
   * holds its BP share aside, and two teams each count a shared outlet once.
   */
  const person = group !== "retailer";
  const company = person ? await companyTotals(range, group === "supervisor" ? "supervisor" : "rso", valuePerf) : null;
  const total = company ? (metric === "c2c" ? company.c2c : company.c2s) : rows.reduce((a, r) => a + r.value, 0);
  const totalTarget = company ? (metric === "c2c" ? company.c2cTarget : 0) : rows.reduce((a, r) => a + r.target, 0);
  const showTarget = hasTarget && group !== "retailer";

  return {
    rows,
    total,
    totalTarget,
    exportRows: rows.map((r) => ({
      ...r.identity,
      [`${label} Value`]: round(r.value),
      ...(showTarget
        ? { [`${label} Target`]: round(r.target), "Achievement %": r.target ? targetPercent(r.value, r.target) : "" }
        : {}),
      // The screen has always had a Share column; the sheet had not, which made
      // the two disagree about how many columns the report has.
      "Share %": total ? Math.round((r.value / total) * 1000) / 10 : "",
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

export async function buildTarget(
  range: ReportRange,
  group: TargetGroup,
): Promise<Built<RsoSummaryRow> & { totals: CompanyTotals }> {
  /*
   * One fetch, two uses.
   *
   * The table and the company figure above it want the same performance rows,
   * and `employeePerformance` company-wide costs about 0.9s at production
   * volume — asking twice took this page to five seconds.
   */
  const perf = await reportPerformanceRows(range);
  const [source, totals] = await Promise.all([
    group === "supervisor" ? rollUpToSupervisor(range, perf) : rsoSummary(range, perf),
    companyTotals(range, group === "supervisor" ? "supervisor" : "rso", perf),
  ]);
  const rows = [...source].sort(
    (a, b) => targetPercent(b.ga, b.gaTarget) - targetPercent(a.ga, a.gaTarget) || a.name.localeCompare(b.name),
  );

  return {
    rows,
    totals,
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
      ...personIdentity(r, group),
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
      ...retailerIdentity(r),
      "GA Done": r.ga,
      "GA Required": SSO_MIN_MONTHLY_STANDARD_GA,
      "GA Remaining": Math.max(SSO_MIN_MONTHLY_STANDARD_GA - r.ga, 0),
      SSO: doneOrPending(r.ssoComplete),
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
      ...retailerIdentity(r),
      "C2S Value": round(r.c2s),
      "C2S Trx": r.c2sTransactions,
      "Needs Amount": Math.max(LSO_MIN_MONTHLY_AMOUNT - r.c2s, 0),
      "Needs Trx": Math.max(LSO_MIN_MONTHLY_TRANSACTIONS - r.c2sTransactions, 0),
      LSO: doneOrPending(r.lsoComplete),
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
      ...retailerIdentity(r),
      "C2S Value": round(r.c2s),
      "C2S Trx": r.c2sTransactions,
      "C2C Value": round(r.c2c),
      SSO: doneOrPending(r.ssoComplete),
      LSO: doneOrPending(r.lsoComplete),
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
      ...retailerIdentity(r),
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

export type CustomRow = {
  id: string;
  name: string;
  code: string;
  sub: string;
  /** Identity as separate spreadsheet columns; see PerformanceRow.identity. */
  identity: ExportRow;
} & Partial<Record<CustomField, number | null>>;

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
      identity: retailerIdentity(r),
      ga: r.ga,
      c2c: r.c2c,
      c2s: r.c2s,
      ob: r.openingBalance,
    }));
  } else {
    const source = level === "supervisor" ? await rollUpToSupervisor(range) : await rsoSummary(range);
    pre = source.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      sub: level === "supervisor" ? `${r.retailerCount.toLocaleString("en-US")} retailers` : r.supervisor,
      identity: personIdentity(r, level === "supervisor" ? "supervisor" : "rso"),
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
      const out: ExportRow = { ...r.identity };
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
  /** Daily Summary's drill-down: one supervisor's RSOs. */
  supervisor?: string;
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
  daily: {
    stem: "daily-summary",
    build: (q, r) => {
      const level = dailyLevel(q.level);
      return buildDaily(r, level, level === "rso" ? q.supervisor : undefined);
    },
  },
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
 * **Neither `page` nor `q` is ever included, and that is the point.** The
 * screen shows sixty rows of whatever the search matched; the file is the
 * report. Either parameter here would silently turn every export into whatever
 * slice the reader happened to be looking at, and they would have no way to
 * tell from the file that rows were missing.
 *
 * Because that makes a searched screen and its download disagree, the search
 * bar says so on screen while a search is active — see `ReportSearch`.
 */
export function reportExportHref(key: string, range: ReportRange, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({ report: key, from: range.from, to: range.to });
  for (const [k, v] of Object.entries(extra)) {
    /*
     * Dropped here rather than trusted not to be passed.
     *
     * The first version of this function copied `extra` wholesale and carried a
     * comment promising it did not — a promise in a comment that the code did
     * not keep, which is how a caller ends up exporting one page and nobody
     * notices. The refusal belongs in the one place that builds every export
     * URL.
     *
     * `q` joined the list in v154 for the same reason and was caught the same
     * way: the search was added, the export URL quietly carried it, and only a
     * test that asserted the absence found it.
     */
    if (k === "page" || k === "q") continue;
    if (v) q.set(k, v);
  }
  return `/api/reports/export?${q.toString()}`;
}

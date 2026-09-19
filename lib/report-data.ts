/**
 * Reporting Center aggregates.
 *
 * Each function answers one report's question with as few round trips as the
 * question allows — the demo sums a per-day array because it has no database,
 * but a real 90-day range must not fetch 90 days of rows to add them up.
 *
 * Scope is deliberately absent: every caller here is an ADMIN/IT page, which
 * sees everything. If a scoped variant is ever needed, it takes a REQUIRED
 * employeeIds argument rather than an optional one — see the warning below.
 *
 * ## Who owns what (moved here from lib/ownership.ts in v132)
 *
 * The schema carries two different links from a Retailer to an Employee. They
 * answer different questions and are NOT interchangeable:
 *
 *   Retailer.employeeId
 *     Which RSO works this outlet. Set in bulk by the retailer master import,
 *     which matches I_TOP_UP_SR_NUMBER against the employee's RSO MSISDN
 *     (lib/master-import.ts). Every active retailer has one.
 *
 *   BpAssignment
 *     Which retailers act as Business Partners, which RSO each BP reports to,
 *     and that BP's GA target. Created one at a time by an admin from
 *     /admin/bp-management, date-ranged so history is preserved. Only a small
 *     subset of retailers ever has one.
 *
 * So BpAssignment is authoritative for BP identity and BP ownership;
 * Retailer.employeeId is authoritative for retailer ownership. Using
 * BpAssignment for plain retailer scoping would empty every RSO, supervisor
 * and manager page, because most retailers are not BPs.
 *
 * **The dangerous part.** `lib/retailer-opportunities.ts` and
 * `lib/performance.ts` both treat an omitted `employeeIds` as "company-wide",
 * which is one forgotten argument away from showing another team's data. Any
 * new scoped helper should take the argument as REQUIRED.
 */

import { prisma } from "./prisma";
import { rangeBounds } from "./report-range";
import type { ReportRange } from "./report-range";
import { withSimSwap, withStandardGa } from "./business-rules";
import { coversDate, overlapsRange } from "./bp-period";
import { retailerOpportunities } from "./retailer-opportunities";
import type { RetailerOpportunity } from "./retailer-opportunities";
import { employeePerformance } from "./performance";
import type { EmployeePerformance } from "./performance";

/** What `employeePerformance` returns — shared by every builder below. */
type EmployeePerformanceRows = EmployeePerformance[];
import { groupSizes, groupTotals, teamTotals } from "./bp-rollup";
import { supervisorTargets } from "./supervisor-target-query";
import { sumSupervisorTargets, targetFor } from "./supervisor-target";
import { bpDisplayName } from "./bp-name";

/* ------------------------------------------------------------------ *
 * Data readiness — MOVED
 * ------------------------------------------------------------------ *
 * `dataReadiness()`, `FeedReadiness` and `REPORT_FEEDS` lived here until v135.
 * They are now `lib/readiness.ts` (the rules) and `lib/readiness-data.ts` (the
 * queries), and `/it/readiness` shows the result.
 *
 * Worth recording, because the old version looked right:
 *
 *   It asked whether ONE completed batch of each type had a businessDate
 *   anywhere in the selected range. For the Reporting Center's default range —
 *   yesterday — that is exactly correct. For a month it is close to
 *   meaningless: a single GA import on the 3rd reported "Ready", in green,
 *   while the totals printed underneath it were missing thirty days of
 *   activations. Nothing failed, nothing looked wrong, and the number was
 *   simply not the whole answer.
 *
 * The original note here said readiness must come from ImportBatch and never be
 * inferred from whether rows happen to exist. That reasoning was kept: the new
 * code reads BOTH, per day, because the disagreement is the useful part — a
 * completed batch with no rows is a file that parsed to nothing, and the Upload
 * Center shows it as a success.
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * Headline totals for the range
 * ------------------------------------------------------------------ */
export type RangeTotals = {
  standardGa: number;
  simSwap: number;
  /** Rows whose product code matches neither a standard GA pack nor a swap. */
  unknownGa: number;
  c2cAmount: number;
  c2sAmount: number;
  c2sTransactions: number;
};

export async function rangeTotals(range: ReportRange): Promise<RangeTotals> {
  const { start, endExclusive } = rangeBounds(range);
  const window = { gte: start, lt: endExclusive };

  const [standardGa, simSwap, allGa, c2c, c2s] = await Promise.all([
    // Standard GA only — SIMWAP and EV-SWAP are replacements and never count
    // toward GA (lib/business-rules.ts).
    prisma.gaActivation.count({ where: withStandardGa({ activationDate: window }) }),
    // Actual swaps, by the same centralized rule. This used to be computed as
    // `allGa - standardGa`, which quietly counted every unrecognised product
    // code as a SIM swap — the UI labels the number "SIM Swap", so an import
    // carrying one new product code inflated it.
    prisma.gaActivation.count({ where: withSimSwap({ activationDate: window }) }),
    prisma.gaActivation.count({ where: { activationDate: window } }),
    prisma.c2cRecord.aggregate({ where: { date: window }, _sum: { amount: true } }),
    // `transactionCount` is the business transaction total; `_count._all`
    // counts retailer-day ROWS. The daily report prints this as "… trx", so
    // summing rows understated every C2S transaction figure in the Reporting
    // Center — a retailer-day with 12 transactions counted as 1.
    prisma.c2sRecord.aggregate({
      where: { date: window },
      _sum: { amount: true, transactionCount: true },
    }),
  ]);

  return {
    standardGa,
    simSwap,
    unknownGa: Math.max(0, allGa - standardGa - simSwap),
    c2cAmount: Number(c2c._sum.amount ?? 0),
    c2sAmount: Number(c2s._sum.amount ?? 0),
    c2sTransactions: Number(c2s._sum.transactionCount ?? 0),
  };
}

/* ------------------------------------------------------------------ *
 * Supervisor-level daily summary
 * ------------------------------------------------------------------ */
export type SupervisorSummaryRow = {
  id: string;
  name: string;
  rsoCount: number;
  retailerCount: number;
  standardGa: number;
  c2cAmount: number;
  c2sAmount: number;
  gaTarget: number;
};

export async function supervisorSummary(
  range: ReportRange,
  prefetched?: EmployeePerformanceRows,
): Promise<SupervisorSummaryRow[]> {
  /*
   * ## One supervisor calculation, not two
   *
   * This used to roll GA, C2C and C2S up to an RSO by RETAILER OWNERSHIP
   * (`Retailer.employeeId`) and then add the RSOs together per supervisor.
   * Every dashboard in the app routes a BP-held outlet's sales to the BP
   * holder instead — the ledger v139 and v142 established and v178 spelled
   * out — so the Reporting Center and the dashboards answered the same
   * question two different ways. Measured on the production-volume database
   * for September, three RSOs differed: 1,575 GA against 1,680, 470 against
   * 481, 447 against 451, with SSO, LSO and C2C wrong the same way.
   *
   * It is now the same rollup the Target vs Achievement report uses, mapped
   * into this report's column names. Two functions that must agree are one
   * function with two shapes.
   */
  const rows = await rollUpToSupervisor(range, prefetched);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    rsoCount: r.rsoCount,
    retailerCount: r.retailerCount,
    standardGa: r.ga,
    c2cAmount: r.c2c,
    c2sAmount: r.c2s,
    gaTarget: r.gaTarget,
  }));
}

function monthStartOf(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/* ------------------------------------------------------------------ *
 * The company's own totals, for a report's summary strip
 * ------------------------------------------------------------------ */

/**
 * What the COMPANY did, for the figure above a grouped report.
 *
 * ## Why a strip cannot add up the rows it is showing
 *
 * Found by auditing v181's own work. Every grouped report built its summary
 * strip with `rows.reduce(...)` over the rows on screen, and that is wrong in
 * two opposite directions:
 *
 *   - **Grouped by RSO**, each row is that RSO's OWN credit, with the Business
 *     Partner share held aside by design. Adding them leaves the BP share out
 *     of a figure labelled as the report's total. Measured on the
 *     production-volume database for September: GA short by 120, GA target by
 *     175, SSO by 4, LSO by 3 and C2C by ৳127,260.
 *
 *   - **Grouped by supervisor**, an outlet worked as a BP by two RSOs on two
 *     different teams counts once in each team — correctly, because both teams
 *     really work it. Adding the teams then counts it twice. Measured: GA 11
 *     too high, SSO 1 too high. 67,409 is not any real quantity.
 *
 * `lib/bp-rollup.ts` states the rule this breaks: "Only a total ACROSS groups
 * needs `teamTotals()` over the underlying rows, never a sum of these."
 *
 * ## The target basis follows the grouping
 *
 * The numerator is always the company's achievement. The denominator has to be
 * the company's target *on the same basis as the rows*, or the percentage
 * compares two different questions — the defect this version already fixed one
 * level down. Grouped by RSO that is the RSO targets plus the BP targets;
 * grouped by supervisor it is the supervisors' own targets (v181).
 */
export type CompanyTotals = {
  ga: number;
  gaTarget: number;
  sso: number;
  ssoTarget: number;
  lso: number;
  lsoTarget: number;
  c2c: number;
  c2cTarget: number;
  c2s: number;
  totalRecharge: number;
  totalRechargeTarget: number;
};

/**
 * The performance rows a report is built from — fetched ONCE per request.
 *
 * `employeePerformance` company-wide costs about 0.9s at production volume,
 * and a report page needs the same rows twice: for the grouped table and for
 * the company figure above it. Calling it twice took the Target report to 5
 * seconds. Every builder now fetches here and passes the rows down.
 */
export const reportPerformanceRows = (range: ReportRange) =>
  employeePerformance(`${range.from.slice(0, 7)}-01`, undefined, range.from, range.to);

export async function companyTotals(
  range: ReportRange,
  basis: "rso" | "supervisor",
  prefetched?: EmployeePerformanceRows,
): Promise<CompanyTotals> {
  const { start, endExclusive } = rangeBounds(range);
  const [rows, stored] = await Promise.all([
    prefetched ?? reportPerformanceRows(range),
    basis === "supervisor" ? supervisorTargets(start, endExclusive) : Promise.resolve(null),
  ]);
  // teamTotals, not a sum: Business Partners included, a shared outlet once.
  const t = teamTotals(rows);
  const sup = stored ? sumSupervisorTargets(stored.values()) : null;
  return {
    ga: t.gaAchieved,
    gaTarget: sup ? sup.gaTarget : t.gaTarget,
    sso: t.ssoAchieved,
    ssoTarget: sup ? sup.ssoTarget : t.ssoTarget,
    lso: t.lsoAchieved,
    lsoTarget: sup ? sup.lsoTarget : t.lsoTarget,
    c2c: t.c2cAchieved,
    c2cTarget: sup ? sup.c2cTarget : t.c2cTarget,
    c2s: t.c2sAmount,
    totalRecharge: t.totalRechargeAchieved,
    totalRechargeTarget: sup ? sup.totalRechargeTarget : t.totalRechargeTarget,
  };
}

/* ------------------------------------------------------------------ *
 * Retailer-level rows for the execution reports
 * ------------------------------------------------------------------ *
 * SSO Pending, LSO Pending, Low C2S and Opening Balance are four views of
 * one dataset, so they share one query. lib/retailer-opportunities already
 * computes GA, C2C, C2S, opening balance and the SSO/LSO completion rules
 * for a date range — reimplementing any of that here would create a second
 * place for the SSO and LSO thresholds to drift.
 *
 * The one thing it does not carry is the BP, because a BP is a BpAssignment
 * and not a retailer column. That is joined on here — see the ownership
 * note at the top of this file.
 */

export type RetailerReportRow = RetailerOpportunity & { bpName: string };

export async function retailerReport(range: ReportRange): Promise<RetailerReportRow[]> {
  const { start, endExclusive } = rangeBounds(range);
  const [rows, assignments] = await Promise.all([
    // retailerOpportunities is month-anchored with an optional range overlay;
    // the range's own start month is the correct anchor for the SSO/LSO
    // per-calendar-month rules.
    retailerOpportunities(range.from.slice(0, 7), undefined, range.from, range.to),
    // Assignments that were in force during the REPORT PERIOD, not whichever
    // one happens to be active today. A retailer moved from BP A to BP B last
    // week was previously reported under B for every historical date — which
    // is exactly backwards for a Reporting Center whose whole job is history.
    prisma.bpAssignment.findMany({
      where: overlapsRange(start, endExclusive),
      orderBy: { startDate: "desc" },
      select: { retailerId: true, startDate: true, endDate: true, employee: { select: { name: true } } },
    }),
  ]);
  // Newest-first above, so the first assignment seen for a retailer is the one
  // that covers the latest part of the period; a retailer with two in the same
  // range is reported under the later BP and the earlier one is named too.
  const bpByRetailer = new Map<string, string[]>();
  for (const a of assignments) {
    const list = bpByRetailer.get(a.retailerId) ?? [];
    if (!list.includes(a.employee.name)) list.push(a.employee.name);
    bpByRetailer.set(a.retailerId, list);
  }
  return rows.map((r) => ({ ...r, bpName: bpByRetailer.get(r.id)?.join(" → ") ?? "—" }));
}

/* ------------------------------------------------------------------ *
 * Activation by RSO and by BP
 * ------------------------------------------------------------------ */
export type ActivationRow = {
  id: string;
  name: string;
  code: string;
  sub: string;
  activation: number;
  target: number;
};

export async function rsoActivation(
  range: ReportRange,
  prefetched?: EmployeePerformanceRows,
): Promise<ActivationRow[]> {
  /*
   * ## The same correction as `rsoSummary`
   *
   * This counted an RSO's activations by walking the retailers they OWN. An
   * outlet held as a Business Partner has its activations credited to the BP
   * holder on every other screen in the app, so this report credited the owner
   * for SIMs the app told the owner were not theirs — and compared that figure
   * against the owner's own GA target, which never covered them.
   *
   * `employeePerformance` is the one function every role screen already asks,
   * and it returns both halves of this report: the RSO's own GA credit and the
   * RSO's own GA target. The BP side has its own report, immediately below.
   */
  const rows = prefetched ?? (await reportPerformanceRows(range));
  return rows.map((r) => ({
    id: r.employeeId,
    name: r.name,
    code: r.employeeCode || r.rsoMsisdn,
    sub: r.supervisor,
    activation: r.gaAchieved,
    target: r.gaTarget,
  }));
}

export async function bpActivation(range: ReportRange): Promise<ActivationRow[]> {
  const { start, endExclusive } = rangeBounds(range);
  const [assignments, gaGroups, monthlyTargets] = await Promise.all([
    // Same rule as retailerReport: the assignments effective during the report
    // period. `active: true` reported yesterday's activations against today's
    // BP and omitted a BP whose assignment had since ended.
    prisma.bpAssignment.findMany({
      where: overlapsRange(start, endExclusive),
      select: {
        id: true,
        retailerId: true,
        gaTarget: true,
        startDate: true,
        endDate: true,
        retailer: { select: { retailerCode: true, retailerName: true, bpName: true } },
        employee: { select: { name: true } },
      },
    }),
    prisma.gaActivation.groupBy({
      by: ["retailerId", "activationDate"],
      where: withStandardGa({ activationDate: { gte: start, lt: endExclusive } }),
      _count: { _all: true },
    }),
    // A month-specific BP target overrides the assignment's standing one.
    prisma.bpMonthlyTarget.findMany({
      where: { month: { gte: monthStartOf(start), lt: endExclusive } },
      select: { assignmentId: true, gaTarget: true },
    }),
  ]);

  const monthlyByAssignment = new Map<string, number>();
  for (const t of monthlyTargets) {
    monthlyByAssignment.set(t.assignmentId, (monthlyByAssignment.get(t.assignmentId) ?? 0) + t.gaTarget);
  }

  // Each activation counts for the assignment that was in force on its own
  // date. Summing per retailer would double-count a retailer that changed BP
  // inside the period, and would credit the wrong BP for the earlier days.
  return assignments
    .map((a) => ({
      id: a.id,
      name: bpDisplayName(a.retailer),
      code: a.retailer.retailerCode,
      sub: a.employee.name,
      activation: gaGroups.reduce(
        (n, g) =>
          g.retailerId === a.retailerId && coversDate(a, g.activationDate, start, endExclusive) ? n + g._count._all : n,
        0,
      ),
      target: monthlyByAssignment.get(a.id) ?? a.gaTarget,
    }))
    .sort((x, y) => x.name.localeCompare(y.name));
}

/* ------------------------------------------------------------------ *
 * RSO-level summary — the shared basis for four reports
 * ------------------------------------------------------------------ *
 * C2C, C2S, Target vs Achievement and RSO Performance all want the same
 * per-employee numbers, so they are computed once here rather than four
 * times with four chances to disagree.
 *
 * SSO and LSO achievement are counted from the monthly rules rather than
 * summed from a column: SSO is "SIM-seller retailers with >= 2 standard GA
 * in a calendar month" and LSO is "retailers meeting the monthly C2S amount
 * AND transaction rule". Both come from lib/business-rules via
 * retailerReport(), so the thresholds stay in one place.
 */
export type RsoSummaryRow = {
  id: string;
  name: string;
  code: string;
  /** The RSO's wallet number, kept apart from `code` so a sheet can show both. */
  msisdn: string;
  /**
   * The supervisor's id alongside the name.
   *
   * `rollUpToSupervisor` grouped on the NAME, so two supervisors who share one
   * silently shared a row — the same defect the dashboards fixed by grouping
   * on id. It also had no way to look up a supervisor's own target, which
   * v181 needs.
   */
  supervisorId: string | null;
  supervisor: string;
  retailerCount: number;
  /** How many RSOs this row covers. 1 for an RSO row, the team size for a rollup. */
  rsoCount: number;
  ga: number;
  gaTarget: number;
  c2c: number;
  c2cTarget: number;
  c2s: number;
  sso: number;
  ssoTarget: number;
  lso: number;
  lsoTarget: number;
  totalRechargeTarget: number;
};

export async function rsoSummary(range: ReportRange, prefetched?: EmployeePerformanceRows): Promise<RsoSummaryRow[]> {
  /*
   * ## Why this asks `employeePerformance` rather than adding retailers up
   *
   * It used to roll `retailerReport(range)` up by `Retailer.employeeId` — who
   * OWNS each outlet. But an outlet held as a Business Partner has its sales
   * credited to the BP holder on every dashboard in the app, not to the owner
   * (v139, v142, v178). So the Reporting Center credited the owner, the RSO's
   * own page credited the BP, and the two never agreed.
   *
   * Worse, the target came from the RSO's own `MonthlyTarget`, which excludes
   * the BP target by design. The achievement percentage therefore divided a
   * figure that included somebody else's BP outlets by a target that did not
   * cover them. Measured on the production-volume database for September, GA
   * was out by 105, 11 and 4 for the three RSOs involved with BPs, and SSO,
   * LSO and C2C were out the same way.
   *
   * `employeePerformance` is the one function every role screen already asks.
   * Asking it here is the whole fix: the rows are the RSO's own credit, with
   * the BP share held aside in `row.bp` and reported on its own screens.
   *
   * The BP side of the business is not lost — `bpActivation()` below is the
   * report for it, and `/rso/bp` is the screen.
   */
  const rows = prefetched ?? (await reportPerformanceRows(range));
  return rows.map((r) => ({
    id: r.employeeId,
    name: r.name,
    code: r.employeeCode || r.rsoMsisdn,
    msisdn: r.rsoMsisdn,
    supervisorId: r.supervisorId,
    supervisor: r.supervisor,
    retailerCount: r.retailerCount,
    rsoCount: 1,
    ga: r.gaAchieved,
    gaTarget: r.gaTarget,
    c2c: r.c2cAchieved,
    c2cTarget: r.c2cTarget,
    c2s: r.c2sAmount,
    sso: r.ssoAchieved,
    ssoTarget: r.ssoTarget,
    lso: r.lsoAchieved,
    lsoTarget: r.lsoTarget,
    totalRechargeTarget: r.totalRechargeTarget,
  }));
}

/** Rolls RSO rows up to their supervisors. */
export async function rollUpToSupervisor(
  range: ReportRange,
  prefetched?: EmployeePerformanceRows,
): Promise<RsoSummaryRow[]> {
  /*
   * ## Why this fetches rather than folding `rsoSummary`'s rows
   *
   * It used to take `RsoSummaryRow[]` and add them up. That worked while those
   * rows were ownership-based totals, but `rsoSummary` now returns each RSO's
   * OWN credit with the Business Partner share held aside — so adding them
   * would give a supervisor a territory figure with every BP outlet missing,
   * while the daily report's supervisor rows (`supervisorSummary` above)
   * include them. Two supervisor figures in one Reporting Center, disagreeing:
   * exactly the defect this version exists to remove.
   *
   * So both go through `groupTotals`, which is the one place allowed to add a
   * BP's figures to a team's and which counts an outlet held by two RSOs on
   * the same team once.
   */
  const { start, endExclusive } = rangeBounds(range);
  const [rows, stored, supervisors] = await Promise.all([
    prefetched ?? reportPerformanceRows(range),
    supervisorTargets(start, endExclusive),
    prisma.supervisor.findMany({ where: { active: true }, select: { id: true, name: true } }),
  ]);

  // By id, never by name: two supervisors sharing a name used to share one row.
  const totals = groupTotals(rows, (r) => r.supervisorId);
  const sizes = groupSizes(rows, (r) => r.supervisorId);
  const nameOf = new Map<string | null, string>(supervisors.map((s) => [s.id, s.name]));
  for (const r of rows) if (!nameOf.has(r.supervisorId)) nameOf.set(r.supervisorId, r.supervisor);

  /*
   * Every active supervisor, not only those with rows.
   *
   * A supervisor whose team sold nothing, or who has no RSOs assigned yet,
   * still has a target and still belongs on a report about targets. Dropping
   * them would be the v175 defect again: an empty row is information, an
   * absent row is a silence the reader has to notice.
   */
  const ids = [...new Set([...supervisors.map((x) => x.id), ...totals.keys()])];
  return ids
    .map((supervisorId) => {
      const t = totals.get(supervisorId) ?? EMPTY_TOTALS;
      // v181: the achievement is the territory's, the target is the
      // supervisor's own. See lib/supervisor-target.ts.
      const target = targetFor(stored, supervisorId);
      return {
        id: supervisorId ?? "unassigned",
        name: nameOf.get(supervisorId) || "Unassigned",
        // A supervisor row is a rollup, not a person with a wallet.
        code: "—",
        msisdn: "—",
        supervisorId,
        supervisor: "",
        retailerCount: t.retailerCount,
        rsoCount: sizes.get(supervisorId) ?? 0,
        ga: t.gaAchieved,
        gaTarget: target.gaTarget,
        c2c: t.c2cAchieved,
        c2cTarget: target.c2cTarget,
        c2s: t.c2sAmount,
        sso: t.ssoAchieved,
        ssoTarget: target.ssoTarget,
        lso: t.lsoAchieved,
        lsoTarget: target.lsoTarget,
        totalRechargeTarget: target.totalRechargeTarget,
      } satisfies RsoSummaryRow;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** A supervisor with no rows at all: every figure genuinely zero. */
const EMPTY_TOTALS = {
  retailerCount: 0,
  gaAchieved: 0,
  c2cAchieved: 0,
  c2sAmount: 0,
  ssoAchieved: 0,
  lsoAchieved: 0,
};

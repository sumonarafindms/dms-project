/**
 * Reporting Center aggregates.
 *
 * Each function answers one report's question with as few round trips as the
 * question allows — the demo sums a per-day array because it has no database,
 * but a real 90-day range must not fetch 90 days of rows to add them up.
 *
 * Scope is deliberately absent: every caller here is an ADMIN/IT page, which
 * sees everything. If a scoped variant is ever needed, it takes a REQUIRED
 * employeeIds argument rather than an optional one — see lib/ownership.ts for
 * why optional scope is dangerous.
 */

import { prisma } from "./prisma";
import { rangeBounds } from "./report-range";
import type { ReportRange } from "./report-range";
import { withStandardGa } from "./business-rules";
import type { ImportType } from "@prisma/client";
import { retailerOpportunities } from "./retailer-opportunities";
import type { RetailerOpportunity } from "./retailer-opportunities";

/* ------------------------------------------------------------------ *
 * Data readiness
 * ------------------------------------------------------------------ *
 * "Was each feed actually imported for the selected period?"
 *
 * Answered only from ImportBatch, which records a businessDate and a status
 * per import. A feed with no successful batch whose businessDate falls in the
 * range is reported "Missing" — never guessed at from whether rows happen to
 * exist, because rows can survive from an earlier import and would make a
 * missing day look present.
 */
export type FeedReadiness = {
  feed: ImportType;
  ready: boolean;
  latestBusinessDate: Date | null;
  fileName: string | null;
  uploadedAt: Date | null;
};

const REPORT_FEEDS = ["GA", "C2C", "C2S", "OB"] as const;

export async function dataReadiness(range: ReportRange): Promise<FeedReadiness[]> {
  const { start, endExclusive } = rangeBounds(range);
  const batches = await Promise.all(
    REPORT_FEEDS.map((feed) =>
      prisma.importBatch.findFirst({
        where: {
          type: feed as ImportType,
          businessDate: { gte: start, lt: endExclusive },
          status: { in: ["COMPLETED", "COMPLETED_WITH_ERRORS"] },
        },
        orderBy: { businessDate: "desc" },
        select: { businessDate: true, fileName: true, uploadedAt: true },
      }),
    ),
  );
  return REPORT_FEEDS.map((feed, i) => ({
    feed: feed as ImportType,
    ready: Boolean(batches[i]),
    latestBusinessDate: batches[i]?.businessDate ?? null,
    fileName: batches[i]?.fileName ?? null,
    uploadedAt: batches[i]?.uploadedAt ?? null,
  }));
}

/* ------------------------------------------------------------------ *
 * Headline totals for the range
 * ------------------------------------------------------------------ */
export type RangeTotals = {
  standardGa: number;
  simSwap: number;
  c2cAmount: number;
  c2sAmount: number;
  c2sTransactions: number;
};

export async function rangeTotals(range: ReportRange): Promise<RangeTotals> {
  const { start, endExclusive } = rangeBounds(range);
  const window = { gte: start, lt: endExclusive };

  const [standardGa, allGa, c2c, c2s] = await Promise.all([
    // Standard GA only — SIMWAP and EV-SWAP are replacements and never count
    // toward GA (lib/business-rules.ts).
    prisma.gaActivation.count({ where: withStandardGa({ activationDate: window }) }),
    prisma.gaActivation.count({ where: { activationDate: window } }),
    prisma.c2cRecord.aggregate({ where: { date: window }, _sum: { amount: true } }),
    prisma.c2sRecord.aggregate({ where: { date: window }, _sum: { amount: true }, _count: { _all: true } }),
  ]);

  return {
    standardGa,
    // Everything that is not standard GA in the window: swaps plus any row
    // whose product code we do not recognise. Shown separately, never folded in.
    simSwap: allGa - standardGa,
    c2cAmount: Number(c2c._sum.amount ?? 0),
    c2sAmount: Number(c2s._sum.amount ?? 0),
    c2sTransactions: c2s._count._all,
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

export async function supervisorSummary(range: ReportRange): Promise<SupervisorSummaryRow[]> {
  const { start, endExclusive } = rangeBounds(range);
  const window = { gte: start, lt: endExclusive };

  const [supervisors, retailers, gaGroups, c2cGroups, c2sGroups, targets] = await Promise.all([
    prisma.supervisor.findMany({
      where: { active: true },
      select: { id: true, name: true, employees: { where: { active: true }, select: { id: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.retailer.findMany({
      where: { active: true, employeeId: { not: null } },
      select: { id: true, employeeId: true },
    }),
    prisma.gaActivation.groupBy({
      by: ["retailerId"],
      where: withStandardGa({ activationDate: window }),
      _count: { _all: true },
    }),
    prisma.c2cRecord.groupBy({ by: ["retailerId"], where: { date: window }, _sum: { amount: true } }),
    prisma.c2sRecord.groupBy({ by: ["retailerId"], where: { date: window }, _sum: { amount: true } }),
    // Supervisors hold no targets of their own — a supervisor's target is the
    // sum of their RSOs' monthly targets. Every month the range touches counts.
    prisma.monthlyTarget.findMany({
      where: { month: { gte: monthStartOf(start), lt: endExclusive } },
      select: { employeeId: true, gaTarget: true },
    }),
  ]);

  const employeeOfRetailer = new Map(retailers.map((r) => [r.id, r.employeeId!]));
  const gaByEmployee = new Map<string, number>();
  const c2cByEmployee = new Map<string, number>();
  const c2sByEmployee = new Map<string, number>();
  const retailerCountByEmployee = new Map<string, number>();

  for (const r of retailers) {
    retailerCountByEmployee.set(r.employeeId!, (retailerCountByEmployee.get(r.employeeId!) ?? 0) + 1);
  }
  const addTo = (map: Map<string, number>, retailerId: string, value: number) => {
    const employeeId = employeeOfRetailer.get(retailerId);
    if (!employeeId) return; // unassigned retailer: counted nowhere, never silently attributed
    map.set(employeeId, (map.get(employeeId) ?? 0) + value);
  };
  for (const g of gaGroups) addTo(gaByEmployee, g.retailerId, g._count._all);
  for (const g of c2cGroups) addTo(c2cByEmployee, g.retailerId, Number(g._sum.amount ?? 0));
  for (const g of c2sGroups) addTo(c2sByEmployee, g.retailerId, Number(g._sum.amount ?? 0));

  const targetByEmployee = new Map<string, number>();
  for (const t of targets) {
    targetByEmployee.set(t.employeeId, (targetByEmployee.get(t.employeeId) ?? 0) + t.gaTarget);
  }

  const sum = (ids: string[], map: Map<string, number>) => ids.reduce((a, id) => a + (map.get(id) ?? 0), 0);

  return supervisors.map((s) => {
    const ids = s.employees.map((e) => e.id);
    return {
      id: s.id,
      name: s.name,
      rsoCount: ids.length,
      retailerCount: sum(ids, retailerCountByEmployee),
      standardGa: sum(ids, gaByEmployee),
      c2cAmount: sum(ids, c2cByEmployee),
      c2sAmount: sum(ids, c2sByEmployee),
      gaTarget: sum(ids, targetByEmployee),
    };
  });
}

function monthStartOf(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
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
 * and not a retailer column. That is joined on here, per lib/ownership.ts.
 */

export type RetailerReportRow = RetailerOpportunity & { bpName: string };

export async function retailerReport(range: ReportRange): Promise<RetailerReportRow[]> {
  const [rows, assignments] = await Promise.all([
    // retailerOpportunities is month-anchored with an optional range overlay;
    // the range's own start month is the correct anchor for the SSO/LSO
    // per-calendar-month rules.
    retailerOpportunities(range.from.slice(0, 7), undefined, range.from, range.to),
    prisma.bpAssignment.findMany({
      where: { active: true },
      select: { retailerId: true, employee: { select: { name: true } } },
    }),
  ]);
  const bpByRetailer = new Map(assignments.map((a) => [a.retailerId, a.employee.name]));
  return rows.map((r) => ({ ...r, bpName: bpByRetailer.get(r.id) ?? "—" }));
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

export async function rsoActivation(range: ReportRange): Promise<ActivationRow[]> {
  const { start, endExclusive } = rangeBounds(range);
  const [employees, gaGroups, targets] = await Promise.all([
    prisma.employee.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        employeeCode: true,
        rsoMsisdn: true,
        supervisor: { select: { name: true } },
        retailers: { select: { id: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.gaActivation.groupBy({
      by: ["retailerId"],
      where: withStandardGa({ activationDate: { gte: start, lt: endExclusive } }),
      _count: { _all: true },
    }),
    prisma.monthlyTarget.findMany({
      where: { month: { gte: monthStartOf(start), lt: endExclusive } },
      select: { employeeId: true, gaTarget: true },
    }),
  ]);

  const gaByRetailer = new Map(gaGroups.map((g) => [g.retailerId, g._count._all]));
  const targetByEmployee = new Map<string, number>();
  for (const t of targets) {
    targetByEmployee.set(t.employeeId, (targetByEmployee.get(t.employeeId) ?? 0) + t.gaTarget);
  }

  return employees.map((e) => ({
    id: e.id,
    name: e.name,
    code: e.employeeCode || e.rsoMsisdn,
    sub: e.supervisor?.name ?? "Unassigned",
    activation: e.retailers.reduce((a, r) => a + (gaByRetailer.get(r.id) ?? 0), 0),
    target: targetByEmployee.get(e.id) ?? 0,
  }));
}

export async function bpActivation(range: ReportRange): Promise<ActivationRow[]> {
  const { start, endExclusive } = rangeBounds(range);
  const [assignments, gaGroups, monthlyTargets] = await Promise.all([
    prisma.bpAssignment.findMany({
      where: { active: true },
      select: {
        id: true,
        retailerId: true,
        gaTarget: true,
        retailer: { select: { retailerCode: true, retailerName: true } },
        employee: { select: { name: true } },
      },
    }),
    prisma.gaActivation.groupBy({
      by: ["retailerId"],
      where: withStandardGa({ activationDate: { gte: start, lt: endExclusive } }),
      _count: { _all: true },
    }),
    // A month-specific BP target overrides the assignment's standing one.
    prisma.bpMonthlyTarget.findMany({
      where: { month: { gte: monthStartOf(start), lt: endExclusive } },
      select: { assignmentId: true, gaTarget: true },
    }),
  ]);

  const gaByRetailer = new Map(gaGroups.map((g) => [g.retailerId, g._count._all]));
  const monthlyByAssignment = new Map<string, number>();
  for (const t of monthlyTargets) {
    monthlyByAssignment.set(t.assignmentId, (monthlyByAssignment.get(t.assignmentId) ?? 0) + t.gaTarget);
  }

  return assignments
    .map((a) => ({
      id: a.id,
      name: a.retailer.retailerName || a.retailer.retailerCode,
      code: a.retailer.retailerCode,
      sub: a.employee.name,
      activation: gaByRetailer.get(a.retailerId) ?? 0,
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
  supervisor: string;
  retailerCount: number;
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

export async function rsoSummary(range: ReportRange): Promise<RsoSummaryRow[]> {
  // Only the target query needs raw bounds here; the retailer rollup below
  // gets its range through retailerReport().
  const { start, endExclusive } = rangeBounds(range);

  const [employees, retailers, targets] = await Promise.all([
    prisma.employee.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        employeeCode: true,
        rsoMsisdn: true,
        supervisor: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    }),
    // Retailer-level rows already carry GA, C2C, C2S and the SSO/LSO verdicts
    // for this range; rolling them up by employee is cheaper and more
    // consistent than a second set of groupBy queries.
    retailerReport(range),
    prisma.monthlyTarget.findMany({
      where: { month: { gte: monthStartOf(start), lt: endExclusive } },
      select: {
        employeeId: true,
        gaTarget: true,
        c2cTarget: true,
        ssoTarget: true,
        lsoTarget: true,
        totalRechargeTarget: true,
      },
    }),
  ]);

  type Acc = { retailerCount: number; ga: number; c2c: number; c2s: number; sso: number; lso: number };
  const byEmployee = new Map<string, Acc>();
  for (const r of retailers) {
    if (!r.employeeId) continue; // unassigned retailer: never silently attributed
    const acc = byEmployee.get(r.employeeId) ?? { retailerCount: 0, ga: 0, c2c: 0, c2s: 0, sso: 0, lso: 0 };
    acc.retailerCount += 1;
    acc.ga += r.ga;
    acc.c2c += r.c2c;
    acc.c2s += r.c2s;
    if (r.simSeller && r.ssoComplete) acc.sso += 1;
    if (r.lsoComplete) acc.lso += 1;
    byEmployee.set(r.employeeId, acc);
  }

  const targetByEmployee = new Map<string, RsoSummaryRow>();
  for (const t of targets) {
    const cur = targetByEmployee.get(t.employeeId);
    const add = {
      gaTarget: t.gaTarget,
      c2cTarget: Number(t.c2cTarget),
      ssoTarget: t.ssoTarget,
      lsoTarget: t.lsoTarget,
      totalRechargeTarget: Number(t.totalRechargeTarget),
    };
    targetByEmployee.set(t.employeeId, {
      ...(cur ?? ({} as RsoSummaryRow)),
      gaTarget: (cur?.gaTarget ?? 0) + add.gaTarget,
      c2cTarget: (cur?.c2cTarget ?? 0) + add.c2cTarget,
      ssoTarget: (cur?.ssoTarget ?? 0) + add.ssoTarget,
      lsoTarget: (cur?.lsoTarget ?? 0) + add.lsoTarget,
      totalRechargeTarget: (cur?.totalRechargeTarget ?? 0) + add.totalRechargeTarget,
    } as RsoSummaryRow);
  }

  return employees.map((e) => {
    const a = byEmployee.get(e.id) ?? { retailerCount: 0, ga: 0, c2c: 0, c2s: 0, sso: 0, lso: 0 };
    const t = targetByEmployee.get(e.id);
    return {
      id: e.id,
      name: e.name,
      code: e.employeeCode || e.rsoMsisdn,
      supervisor: e.supervisor?.name ?? "Unassigned",
      retailerCount: a.retailerCount,
      ga: a.ga,
      c2c: a.c2c,
      c2s: a.c2s,
      sso: a.sso,
      lso: a.lso,
      gaTarget: t?.gaTarget ?? 0,
      c2cTarget: t?.c2cTarget ?? 0,
      ssoTarget: t?.ssoTarget ?? 0,
      lsoTarget: t?.lsoTarget ?? 0,
      totalRechargeTarget: t?.totalRechargeTarget ?? 0,
    };
  });
}

/** Rolls RSO rows up to their supervisors. */
export function rollUpToSupervisor(rows: RsoSummaryRow[]): RsoSummaryRow[] {
  const bySup = new Map<string, RsoSummaryRow>();
  for (const r of rows) {
    const cur = bySup.get(r.supervisor);
    if (!cur) {
      bySup.set(r.supervisor, { ...r, id: r.supervisor, name: r.supervisor, code: "—", supervisor: "" });
      continue;
    }
    cur.retailerCount += r.retailerCount;
    cur.ga += r.ga;
    cur.c2c += r.c2c;
    cur.c2s += r.c2s;
    cur.sso += r.sso;
    cur.lso += r.lso;
    cur.gaTarget += r.gaTarget;
    cur.c2cTarget += r.c2cTarget;
    cur.ssoTarget += r.ssoTarget;
    cur.lsoTarget += r.lsoTarget;
    cur.totalRechargeTarget += r.totalRechargeTarget;
  }
  return [...bySup.values()].sort((a, b) => a.name.localeCompare(b.name));
}

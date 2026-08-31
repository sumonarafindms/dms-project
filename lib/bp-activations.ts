import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { monthBounds } from "./month";
import { normalizeMonth } from "./drilldown";
import { monthStartsInRange, parseYmd } from "./date-range";
import { withGa170, withSimSwap, withStandardGa } from "./business-rules";
import { assignmentGaTarget, assignmentWindow } from "./bp-period";
// Re-exported so the BP screens keep their existing import path; the rule
// itself now lives in bp-period.ts, shared with lib/performance.ts.
export { assignmentWindow };

export type BpViewer = {
  role: string;
  employeeId?: string | null;
  supervisorId?: string | null;
  bpRetailerId?: string | null;
  managerSupervisorIds?: string[];
};

export type BpAssignmentListRow = {
  id: string;
  active: boolean;
  retailerId: string;
  employeeId: string;
  gaTarget: number;
  startDate: Date;
  endDate: Date | null;
  monthGa: number;
  retailer: {
    retailerCode: string;
    retailerName: string | null;
  };
  employee: {
    name: string;
    employeeCode: string | null;
    supervisor: { name: string } | null;
  };
};

export function assignmentAccessWhere(user: BpViewer): Prisma.BpAssignmentWhereInput {
  if (user.role === "ADMIN" || user.role === "IT") return {};
  if (user.role === "MANAGER") return { employee: { supervisorId: { in: user.managerSupervisorIds || [] } } };
  if (user.role === "SUPERVISOR") return { employee: { supervisorId: user.supervisorId || "__none__" } };
  if (user.role === "RSO") return { employeeId: user.employeeId || "__none__" };
  if (user.role === "BP") return { retailerId: user.bpRetailerId || "__none__", active: true };
  return { id: "__none__" };
}

/**
 * Standard-GA counts for a set of BP assignments, in ONE database query.
 *
 * Every caller used to run `gaActivation.count` per assignment inside a
 * `Promise.all`, so a 500-row BP list issued 501 round trips and a supervisor
 * with 40 BPs issued 41. Here the whole page is grouped by retailer AND date
 * once, and each assignment's own effective window is applied in memory —
 * grouping by retailer alone would give both assignments the retailer's whole
 * total when a BP changed inside the range.
 *
 * Returns a Map keyed by assignment id.
 */
export async function standardGaByAssignment(
  assignments: { id: string; retailerId: string; startDate: Date; endDate: Date | null }[],
  rangeStart: Date,
  rangeEnd: Date,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!assignments.length) return out;

  const groups = await prisma.gaActivation.groupBy({
    by: ["retailerId", "activationDate"],
    where: withStandardGa({
      retailerId: { in: [...new Set(assignments.map((a) => a.retailerId))] },
      activationDate: { gte: rangeStart, lt: rangeEnd },
    }),
    _count: { _all: true },
  });

  const byRetailer = new Map<string, { day: number; count: number }[]>();
  for (const g of groups) {
    const list = byRetailer.get(g.retailerId) ?? [];
    list.push({ day: g.activationDate.getTime(), count: g._count._all });
    byRetailer.set(g.retailerId, list);
  }

  for (const a of assignments) {
    const { effectiveStart, effectiveEnd } = assignmentWindow(a, rangeStart, rangeEnd);
    out.set(
      a.id,
      effectiveStart < effectiveEnd
        ? (byRetailer.get(a.retailerId) ?? []).reduce(
            (n, d) => (d.day >= effectiveStart.getTime() && d.day < effectiveEnd.getTime() ? n + d.count : n),
            0,
          )
        : 0,
    );
  }
  return out;
}

/**
 * The part of a report range an assignment actually covers. `endDate` is the
 * last effective day, so the exclusive end is the day after it.
 */

export async function listBpAssignments(
  user: BpViewer,
  monthInput?: string,
  qInput?: string,
  fromInput?: string,
  toInput?: string,
): Promise<{ month: string; assignments: BpAssignmentListRow[] }> {
  const month = normalizeMonth(monthInput),
    q = (qInput || "").trim(),
    { start, end } = monthBounds(`${month}-01`);
  // The shared strict parser: a local copy accepted 2026-02-31 and rolled it
  // forward to 3 March.
  const parse = (v?: string) => parseYmd(v);
  const rangeStart = parse(fromInput) || start,
    to = parse(toInput),
    rangeEnd = to ? new Date(to.getTime() + 86400000) : end;
  const access = assignmentAccessWhere(user);
  const assignments = await prisma.bpAssignment.findMany({
    where: {
      ...access,
      AND: [
        { startDate: { lt: rangeEnd } },
        { OR: [{ endDate: null }, { endDate: { gte: rangeStart } }] },
        ...(q
          ? [
              {
                OR: [
                  { retailer: { retailerCode: { contains: q, mode: "insensitive" as const } } },
                  { retailer: { retailerName: { contains: q, mode: "insensitive" as const } } },
                  { employee: { name: { contains: q, mode: "insensitive" as const } } },
                  { employee: { employeeCode: { contains: q, mode: "insensitive" as const } } },
                ],
              },
            ]
          : []),
      ],
    },
    include: {
      retailer: { select: { retailerCode: true, retailerName: true } },
      employee: { select: { name: true, employeeCode: true, supervisor: { select: { name: true } } } },
      monthlyTargets: true,
    },
    orderBy: [{ active: "desc" }, { startDate: "desc" }],
    take: 500,
  });
  const gaByAssignment = await standardGaByAssignment(assignments, rangeStart, rangeEnd);

  const withCounts: BpAssignmentListRow[] = assignments.map((a) => {
    const { effectiveStart, effectiveEnd } = assignmentWindow(a, rangeStart, rangeEnd);
    const monthGa = gaByAssignment.get(a.id) ?? 0;
    const gaTarget = assignmentGaTarget(a, monthStartsInRange(effectiveStart, effectiveEnd));
    return {
      id: a.id,
      active: a.active,
      retailerId: a.retailerId,
      employeeId: a.employeeId,
      gaTarget,
      startDate: a.startDate,
      endDate: a.endDate,
      monthGa,
      retailer: a.retailer,
      employee: a.employee,
    };
  });
  return { month, assignments: withCounts };
}

export async function bpAssignmentDetail(
  user: BpViewer,
  id: string,
  monthInput?: string,
  qInput?: string,
  fromInput?: string,
  toInput?: string,
) {
  const month = normalizeMonth(fromInput?.slice(0, 7) || monthInput),
    q = (qInput || "").trim(),
    { start, end } = monthBounds(`${month}-01`);
  // The shared strict parser: a local copy accepted 2026-02-31 and rolled it
  // forward to 3 March.
  const parse = (v?: string) => parseYmd(v);
  const rangeStart = parse(fromInput) || start,
    to = parse(toInput),
    rangeEnd = to ? new Date(to.getTime() + 86400000) : end;
  const assignment = await prisma.bpAssignment.findFirst({
    where: { id, ...assignmentAccessWhere(user) },
    include: {
      retailer: { select: { id: true, retailerCode: true, retailerName: true, category: true, route: true } },
      employee: { select: { name: true, employeeCode: true, rsoMsisdn: true, supervisor: { select: { name: true } } } },
      monthlyTargets: true,
    },
  });
  if (!assignment) return null;
  const effectiveStart = assignment.startDate > rangeStart ? assignment.startDate : rangeStart;
  const assignmentEnd = assignment.endDate ? new Date(assignment.endDate.getTime() + 86400000) : rangeEnd;
  // Detail view respects the selected date range and the BP assignment boundary.
  const effectiveEnd = assignmentEnd < rangeEnd ? assignmentEnd : rangeEnd;
  const rangeTarget =
    effectiveStart < effectiveEnd
      ? assignmentGaTarget(assignment, monthStartsInRange(effectiveStart, effectiveEnd))
      : 0;
  const assignmentView = { ...assignment, gaTarget: rangeTarget };
  // No `q` here, and that fixes two things at once.
  //
  // The SIM-serial search is now done in the browser over the rows below
  // (SimActivationList), so typing no longer costs a page load. And because
  // `commonWhere` also feeds the summary counts, the old server-side filter
  // meant searching for one serial dropped "Total GA" to 1 — the summary is
  // meant to describe the assignment period, not the search box.
  const commonWhere: Prisma.GaActivationWhereInput = {
    retailerId: assignment.retailerId,
    activationDate: { gte: effectiveStart, lt: effectiveEnd },
  };
  // Standard GA vs replacement SIM is decided by the shared rules, so separator
  // variants (EV_SWAP / EVSWAP / SIM-WAP) cannot leak into the GA count.
  const where = withStandardGa(commonWhere);
  const swapWhere = withSimSwap(commonWhere);
  const [rows, total, simSwap, total150] = await Promise.all([
    prisma.gaActivation.findMany({
      where,
      orderBy: [{ activationDate: "desc" }, { activationTime: "desc" }],
      take: 500,
      select: { simNo: true, sellingPrice: true, productCode: true, activationDate: true, activationTime: true },
    }),
    prisma.gaActivation.count({ where }),
    prisma.gaActivation.count({ where: swapWhere }),
    prisma.gaActivation.count({ where: withGa170(commonWhere) }),
  ]);
  const total300 = total - total150;
  const dailyRaw = await prisma.gaActivation.groupBy({
    by: ["activationDate"],
    where,
    _count: { _all: true },
    orderBy: { activationDate: "desc" },
  });
  return {
    month,
    q,
    /** True when the 500-row cap was hit, so browser search covers a window. */
    capped: rows.length >= 500,
    assignment: assignmentView,
    total,
    total150,
    total300,
    simSwap,
    rows,
    daily: dailyRaw.map((x) => ({ date: x.activationDate, count: x._count._all })),
    effectiveStart,
    effectiveEnd,
  };
}

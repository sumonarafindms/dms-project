import { NextRequest, NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { monthBounds } from "@/lib/month";
import { isSsoComplete, lsoCompleteMonthlySummaryWhere, withStandardGa } from "@/lib/business-rules";
import { apiError } from "@/lib/http-errors";
import { dhakaMonth } from "@/lib/business-time";
import { assignmentGaTarget, assignmentWindow } from "@/lib/bp-period";
import { monthStartsInRange } from "@/lib/date-range";
import type { BpPortion } from "@/lib/bp-rollup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

function selectedMonth(value: string | null) {
  const text = value && /^\d{4}-\d{2}$/.test(value) ? value : dhakaMonth();
  return monthBounds(`${text}-01T00:00:00.000Z`);
}

export async function GET(req: NextRequest) {
  if (!(await apiUser(["ADMIN", "IT"]))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { start, end } = selectedMonth(req.nextUrl.searchParams.get("month"));

    // Everything below is aggregated in the database. This endpoint used to pull
    // every GaActivation and C2cRecord row for the month into memory, which is
    // what made the dashboard slow once a month held tens of thousands of rows.
    // The request window is exactly one calendar month, so a groupBy on
    // retailerId already gives the per-retailer monthly count SSO needs.
    const [employees, retailers, gaGroups, c2cGroups, lsoRetailers] = await Promise.all([
      prisma.employee.findMany({
        where: { active: true },
        select: {
          id: true,
          employeeCode: true,
          name: true,
          rsoMsisdn: true,
          supervisor: { select: { name: true } },
          _count: { select: { retailers: true } },
          targets: {
            where: { month: start },
            take: 1,
            select: {
              gaTarget: true,
              c2cTarget: true,
              scTarget: true,
              totalRechargeTarget: true,
              ssoTarget: true,
              lsoTarget: true,
            },
          },
          manualMetrics: { where: { month: start }, take: 1, select: { scAchieved: true } },
        },
        orderBy: [{ supervisor: { name: "asc" } }, { name: "asc" }],
      }),
      prisma.retailer.findMany({
        where: { employeeId: { not: null } },
        select: { id: true, employeeId: true, simSeller: true },
      }),
      // Grouped by DAY as well as retailer: a BP assignment starts and ends on
      // a date, so without the day there is no way to give the 11th to the RSO
      // and the 13th to the BP.
      prisma.gaActivation.groupBy({
        by: ["retailerId", "activationDate"],
        where: withStandardGa({ activationDate: { gte: start, lt: end } }),
        _count: { _all: true },
      }),
      prisma.c2cRecord.groupBy({
        by: ["retailerId", "date"],
        where: { date: { gte: start, lt: end } },
        _sum: { amount: true },
      }),
      prisma.c2sMonthlySummary.findMany({
        where: { month: start, ...lsoCompleteMonthlySummaryWhere },
        select: { retailerId: true },
      }),
    ]);

    const retailerMap = new Map(retailers.map((r) => [r.id, r]));

    /*
     * Business Partners, dated.
     *
     * A BP retailer's SIMs and recharge belong to the BP, not to the RSO that
     * services the outlet — so they are split out here exactly as
     * `lib/performance.ts` does it, and added back for the company totals by
     * `teamTotals()` on the dashboard. Two aggregation paths reach this data
     * (this route, and employeePerformance for the role pages); they must apply
     * the same rule or /dashboard and /admin/performance/rsos will disagree
     * about the same RSO.
     */
    const bpAssignments = await prisma.bpAssignment.findMany({
      where: { startDate: { lt: end }, OR: [{ endDate: null }, { endDate: { gte: start } }] },
      select: {
        retailerId: true,
        employeeId: true,
        startDate: true,
        endDate: true,
        gaTarget: true,
        monthlyTargets: { select: { month: true, gaTarget: true } },
      },
    });
    const bpWindows = new Map<string, { from: number; to: number }[]>();
    const bpByEmployee = new Map<string, BpPortion>();
    const portion = (id: string) => {
      let x = bpByEmployee.get(id);
      if (!x) {
        x = {
          count: 0,
          gaTarget: 0,
          gaAchieved: 0,
          ssoAchieved: 0,
          c2cAchieved: 0,
          lsoAchieved: 0,
          c2sAmount: 0,
          c2sTransactions: 0,
        };
        bpByEmployee.set(id, x);
      }
      return x;
    };
    for (const a of bpAssignments) {
      const { effectiveStart, effectiveEnd } = assignmentWindow(a, start, end);
      if (effectiveStart >= effectiveEnd) continue;
      const list = bpWindows.get(a.retailerId) ?? [];
      list.push({ from: effectiveStart.getTime(), to: effectiveEnd.getTime() });
      bpWindows.set(a.retailerId, list);
      const x = portion(a.employeeId);
      x.count += 1;
      x.gaTarget += assignmentGaTarget(a, monthStartsInRange(effectiveStart, effectiveEnd));
    }
    const bpOwnsDay = (retailerId: string, dayMs: number) =>
      (bpWindows.get(retailerId) ?? []).some((w) => dayMs >= w.from && dayMs < w.to);
    // The LSO source is a monthly summary with no day to test, so a retailer
    // that was a BP for any part of the month counts as one — the same choice
    // lib/performance.ts documents.
    const bpOwnsRetailer = (retailerId: string) => bpWindows.has(retailerId);

    const gaByEmployee = new Map<string, number>();
    const ssoByEmployee = new Map<string, number>();
    // SSO counts retailer-MONTHS that reached the threshold, and the window
    // here is exactly one month — so the per-retailer totals are accumulated
    // first, split RSO-side from BP-side, and only then tested.
    const perRetailer = new Map<string, { rso: number; bp: number }>();
    for (const group of gaGroups) {
      const bucket = perRetailer.get(group.retailerId) ?? { rso: 0, bp: 0 };
      if (bpOwnsDay(group.retailerId, group.activationDate.getTime())) bucket.bp += group._count._all;
      else bucket.rso += group._count._all;
      perRetailer.set(group.retailerId, bucket);
    }
    for (const [retailerId, counts] of perRetailer) {
      const retailer = retailerMap.get(retailerId);
      const employeeId = retailer?.employeeId;
      if (!employeeId) continue;
      if (counts.rso > 0) {
        gaByEmployee.set(employeeId, (gaByEmployee.get(employeeId) || 0) + counts.rso);
        if (isSsoComplete(retailer.simSeller, counts.rso))
          ssoByEmployee.set(employeeId, (ssoByEmployee.get(employeeId) || 0) + 1);
      }
      if (counts.bp > 0) {
        const x = portion(employeeId);
        x.gaAchieved += counts.bp;
        if (isSsoComplete(retailer.simSeller, counts.bp)) x.ssoAchieved += 1;
      }
    }

    const c2cByEmployee = new Map<string, number>();
    for (const group of c2cGroups) {
      const employeeId = retailerMap.get(group.retailerId)?.employeeId;
      if (!employeeId) continue;
      const amount = Number(group._sum.amount || 0);
      if (bpOwnsDay(group.retailerId, group.date.getTime())) portion(employeeId).c2cAchieved += amount;
      else c2cByEmployee.set(employeeId, (c2cByEmployee.get(employeeId) || 0) + amount);
    }

    const lsoByEmployee = new Map<string, number>();
    for (const row of lsoRetailers) {
      const employeeId = retailerMap.get(row.retailerId)?.employeeId;
      if (!employeeId) continue;
      if (bpOwnsRetailer(row.retailerId)) portion(employeeId).lsoAchieved += 1;
      else lsoByEmployee.set(employeeId, (lsoByEmployee.get(employeeId) || 0) + 1);
    }

    const rows = employees.map((employee) => {
      const target = employee.targets[0],
        manual = employee.manualMetrics[0];
      const scAchieved = Number(manual?.scAchieved || 0);
      const c2cAchieved = c2cByEmployee.get(employee.id) || 0;
      const bp: BpPortion = bpByEmployee.get(employee.id) ?? {
        count: 0,
        gaTarget: 0,
        gaAchieved: 0,
        ssoAchieved: 0,
        c2cAchieved: 0,
        lsoAchieved: 0,
        c2sAmount: 0,
        c2sTransactions: 0,
      };
      return {
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        name: employee.name,
        supervisor: employee.supervisor?.name || "Unassigned",
        retailerCount: employee._count.retailers,
        // Exactly as entered. RSO and BP targets are set independently, so
        // subtracting the BP's here would remove the same SIMs twice — see the
        // note in lib/performance.ts.
        gaTarget: target?.gaTarget || 0,
        gaAchieved: gaByEmployee.get(employee.id) || 0,
        ssoTarget: target?.ssoTarget || 0,
        ssoAchieved: ssoByEmployee.get(employee.id) || 0,
        c2cTarget: Number(target?.c2cTarget || 0),
        c2cAchieved,
        scTarget: Number(target?.scTarget || 0),
        scAchieved,
        totalRechargeTarget: Number(target?.totalRechargeTarget || 0),
        totalRechargeAchieved: c2cAchieved + scAchieved,
        lsoTarget: target?.lsoTarget || 0,
        lsoAchieved: lsoByEmployee.get(employee.id) || 0,
        bp,
      };
    });

    return NextResponse.json(
      { month: start.toISOString().slice(0, 7), rows },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.error(error);
    const e = apiError(error, "Failed to load dashboard summary.");
    return NextResponse.json({ error: e.error }, { status: e.status });
  }
}

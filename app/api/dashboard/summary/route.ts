import { NextRequest, NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { monthBounds } from "@/lib/month";
import { isSsoComplete, lsoCompleteMonthlySummaryWhere, withStandardGa } from "@/lib/business-rules";
import { apiError } from "@/lib/http-errors";
import { dhakaMonth } from "@/lib/business-time";

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
      prisma.gaActivation.groupBy({
        by: ["retailerId"],
        where: withStandardGa({ activationDate: { gte: start, lt: end } }),
        _count: { _all: true },
      }),
      prisma.c2cRecord.groupBy({
        by: ["retailerId"],
        where: { date: { gte: start, lt: end } },
        _sum: { amount: true },
      }),
      prisma.c2sMonthlySummary.findMany({
        where: { month: start, ...lsoCompleteMonthlySummaryWhere },
        select: { retailerId: true },
      }),
    ]);

    const retailerMap = new Map(retailers.map((r) => [r.id, r]));

    const gaByEmployee = new Map<string, number>();
    const ssoByEmployee = new Map<string, number>();
    for (const group of gaGroups) {
      const retailer = retailerMap.get(group.retailerId);
      const employeeId = retailer?.employeeId;
      if (!employeeId) continue;
      const count = group._count._all;
      gaByEmployee.set(employeeId, (gaByEmployee.get(employeeId) || 0) + count);
      if (isSsoComplete(retailer.simSeller, count))
        ssoByEmployee.set(employeeId, (ssoByEmployee.get(employeeId) || 0) + 1);
    }

    const c2cByEmployee = new Map<string, number>();
    for (const group of c2cGroups) {
      const employeeId = retailerMap.get(group.retailerId)?.employeeId;
      if (!employeeId) continue;
      c2cByEmployee.set(employeeId, (c2cByEmployee.get(employeeId) || 0) + Number(group._sum.amount || 0));
    }

    const lsoByEmployee = new Map<string, number>();
    for (const row of lsoRetailers) {
      const employeeId = retailerMap.get(row.retailerId)?.employeeId;
      if (!employeeId) continue;
      lsoByEmployee.set(employeeId, (lsoByEmployee.get(employeeId) || 0) + 1);
    }

    const rows = employees.map((employee) => {
      const target = employee.targets[0],
        manual = employee.manualMetrics[0];
      const scAchieved = Number(manual?.scAchieved || 0);
      const c2cAchieved = c2cByEmployee.get(employee.id) || 0;
      return {
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        name: employee.name,
        supervisor: employee.supervisor?.name || "Unassigned",
        retailerCount: employee._count.retailers,
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

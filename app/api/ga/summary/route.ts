import {apiUser} from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { monthBounds } from "@/lib/month";

function dateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export async function GET(req: NextRequest) {
  if(!(await apiUser(["ADMIN","ACCOUNTS"]))) return NextResponse.json({error:"Unauthorized"},{status:401});
  try {
    const month = req.nextUrl.searchParams.get("month") || new Date().toISOString().slice(0, 7) + "-01";
    const requestedDate = req.nextUrl.searchParams.get("date");
    const { start, end } = monthBounds(month);

    const dailyStart = requestedDate ? dateOnly(requestedDate) : null;
    const dailyEnd = dailyStart ? new Date(dailyStart.getTime() + 24 * 60 * 60 * 1000) : null;

    const [employees, monthlyActivations, dailyActivations, importHistory] = await Promise.all([
      prisma.employee.findMany({
        where: { active: true },
        orderBy: [{ supervisor: { name: "asc" } }, { name: "asc" }],
        include: {
          supervisor: { select: { name: true } },
          _count: { select: { retailers: true } },
          targets: { where: { month: start }, take: 1 },
        },
      }),
      prisma.gaActivation.findMany({
        where: { activationDate: { gte: start, lt: end } },
        select: {
          retailerId: true,
          sellingPrice: true,
          retailer: {
            select: {
              employeeId: true,
              simSeller: true,
            },
          },
        },
      }),
      dailyStart && dailyEnd
        ? prisma.gaActivation.findMany({
            where: { activationDate: { gte: dailyStart, lt: dailyEnd } },
            select: {
              retailerId: true,
              sellingPrice: true,
              retailer: {
                select: {
                  retailerCode: true,
                  retailerName: true,
                  employeeId: true,
                  employee: {
                    select: {
                      name: true,
                      rsoMsisdn: true,
                      supervisor: { select: { name: true } },
                    },
                  },
                },
              },
            },
          })
        : Promise.resolve([]),
      prisma.importBatch.findMany({
        where: { type: "GA" },
        orderBy: { uploadedAt: "desc" },
        take: 10,
        select: {
          id: true,
          fileName: true,
          uploadedAt: true,
          businessDate: true,
          totalRows: true,
          successRows: true,
          failedRows: true,
          duplicateRows: true,
          status: true,
        },
      }),
    ]);

    const employeeAgg = new Map<string, { total: number; ga150: number; ga300: number }>();
    const retailerMonthlyCount = new Map<string, { employeeId: string; count: number; simSeller: boolean }>();

    for (const activation of monthlyActivations) {
      const employeeId = activation.retailer.employeeId;
      if (!employeeId) continue;
      const price = Number(activation.sellingPrice);
      const current = employeeAgg.get(employeeId) || { total: 0, ga150: 0, ga300: 0 };
      current.total += 1;
      if (price === 170) current.ga150 += 1;
      else current.ga300 += 1;
      employeeAgg.set(employeeId, current);

      const retailer = retailerMonthlyCount.get(activation.retailerId) || {
        employeeId,
        count: 0,
        simSeller: (activation.retailer.simSeller || "").trim().toUpperCase() === "Y",
      };
      retailer.count += 1;
      retailerMonthlyCount.set(activation.retailerId, retailer);
    }

    const ssoByEmployee = new Map<string, number>();
    for (const retailer of retailerMonthlyCount.values()) {
      if (!retailer.simSeller || retailer.count < 2) continue;
      ssoByEmployee.set(retailer.employeeId, (ssoByEmployee.get(retailer.employeeId) || 0) + 1);
    }

    const rows = employees.map((employee) => {
      const ga = employeeAgg.get(employee.id) || { total: 0, ga150: 0, ga300: 0 };
      const target = employee.targets[0];
      return {
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        name: employee.name,
        rsoMsisdn: employee.rsoMsisdn,
        supervisor: employee.supervisor?.name ?? "Unassigned",
        retailerCount: employee._count.retailers,
        ga150: ga.ga150,
        ga300: ga.ga300,
        gaAchieved: ga.total,
        gaTarget: target?.gaTarget ?? 0,
        gaPercent: target?.gaTarget ? Number(((ga.total / target.gaTarget) * 100).toFixed(1)) : 0,
        ssoAchieved: ssoByEmployee.get(employee.id) ?? 0,
        ssoTarget: target?.ssoTarget ?? 0,
      };
    });

    const dailyMap = new Map<string, {
      retailerCode: string;
      retailerName: string;
      employee: string;
      rsoMsisdn: string;
      supervisor: string;
      total: number;
      ga150: number;
      ga300: number;
    }>();

    for (const activation of dailyActivations) {
      const info = activation.retailer;
      const current = dailyMap.get(activation.retailerId) || {
        retailerCode: info.retailerCode,
        retailerName: info.retailerName || "",
        employee: info.employee?.name || "Unassigned",
        rsoMsisdn: info.employee?.rsoMsisdn || "",
        supervisor: info.employee?.supervisor?.name || "Unassigned",
        total: 0,
        ga150: 0,
        ga300: 0,
      };
      current.total += 1;
      if (Number(activation.sellingPrice) === 170) current.ga150 += 1;
      else current.ga300 += 1;
      dailyMap.set(activation.retailerId, current);
    }

    const retailerDaily = [...dailyMap.values()].sort((a, b) =>
      b.total - a.total || a.retailerCode.localeCompare(b.retailerCode),
    );

    return NextResponse.json({
      month: start,
      selectedDate: dailyStart?.toISOString().slice(0, 10) || null,
      rows,
      retailerDaily,
      importHistory,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load GA summary" },
      { status: 500 },
    );
  }
}

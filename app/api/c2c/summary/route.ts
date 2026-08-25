import {apiUser} from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { monthBounds } from "@/lib/month";

function parseDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(req: NextRequest) {
  if(!(await apiUser(["ADMIN","ACCOUNTS"]))) return NextResponse.json({error:"Unauthorized"},{status:401});
  try {
    const monthText = req.nextUrl.searchParams.get("month") || new Date().toISOString().slice(0, 7) + "-01";
    const selectedDate = parseDate(req.nextUrl.searchParams.get("date"));
    const { start, end } = monthBounds(monthText);
    const fromDate=parseDate(req.nextUrl.searchParams.get("from"))||start;
    const toRaw=parseDate(req.nextUrl.searchParams.get("to"));
    const rangeEnd=toRaw?new Date(toRaw.getTime()+86400000):end;
    const dayEnd = selectedDate ? new Date(selectedDate.getTime() + 86400000) : null;

    const [employees, dailyRows, history, latestMonthRows] = await Promise.all([
      prisma.employee.findMany({
        where: { active: true },
        orderBy: [{ supervisor: { name: "asc" } }, { name: "asc" }],
        include: {
          supervisor: { select: { name: true } },
          _count: { select: { retailers: true } },
          targets: { where: { month: start }, take: 1 },
          manualMetrics: { where: { month: start }, take: 1 },
        },
      }),
      selectedDate && dayEnd
        ? prisma.c2cRecord.findMany({
            where: { date: { gte: selectedDate, lt: dayEnd }, amount: { gt: 0 } },
            select: {
              amount: true,
              retailer: {
                select: {
                  retailerCode: true,
                  retailerName: true,
                  employee: {
                    select: { id: true, name: true, rsoMsisdn: true, supervisor: { select: { name: true } } },
                  },
                },
              },
            },
            orderBy: { amount: "desc" },
          })
        : Promise.resolve([]),
      prisma.importBatch.findMany({
        where: { type: "C2C" },
        orderBy: { uploadedAt: "desc" },
        take: 10,
        select: { id: true, fileName: true, uploadedAt: true, businessDate: true, totalRows: true, successRows: true, failedRows: true, status: true },
      }),
      prisma.c2cRecord.findMany({
        where: { date: { gte: fromDate, lt: rangeEnd } },
        select: { transactionCount: true, amount: true, date: true, retailer: { select: { employeeId: true } } },
      }),
    ]);

    const byEmployee = new Map<string, { amount: number; transactions: number; reportEndDate: Date | null }>();
    for (const row of latestMonthRows) {
      const employeeId = row.retailer.employeeId;
      if (!employeeId) continue;
      const current = byEmployee.get(employeeId) || { amount: 0, transactions: 0, reportEndDate: null };
      current.amount += Number(row.amount);
      current.transactions += row.transactionCount;
      if (!current.reportEndDate || row.date > current.reportEndDate) current.reportEndDate = row.date;
      byEmployee.set(employeeId, current);
    }

    const rows = employees.map((employee) => {
      const c2c = byEmployee.get(employee.id) || { amount: 0, transactions: 0, reportEndDate: null };
      const target = employee.targets[0];
      const sc = Number(employee.manualMetrics[0]?.scAchieved ?? 0);
      const c2cTarget = Number(target?.c2cTarget ?? 0);
      const totalRechargeTarget = Number(target?.totalRechargeTarget ?? 0);
      const totalRecharge = c2c.amount + sc;
      return {
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        name: employee.name,
        rsoMsisdn: employee.rsoMsisdn,
        supervisor: employee.supervisor?.name ?? "Unassigned",
        retailerCount: employee._count.retailers,
        transactionCount: c2c.transactions,
        c2cTarget,
        c2cAchieved: c2c.amount,
        c2cPercent: c2cTarget ? Number(((c2c.amount / c2cTarget) * 100).toFixed(1)) : 0,
        scAchieved: sc,
        totalRechargeTarget,
        totalRechargeAchieved: totalRecharge,
        totalRechargePercent: totalRechargeTarget ? Number(((totalRecharge / totalRechargeTarget) * 100).toFixed(1)) : 0,
        reportEndDate: c2c.reportEndDate?.toISOString().slice(0, 10) ?? null,
      };
    });

    const day = dailyRows.map((row) => ({
      retailerCode: row.retailer.retailerCode,
      retailerName: row.retailer.retailerName || "",
      employee: row.retailer.employee?.name || "Unassigned",
      rsoMsisdn: row.retailer.employee?.rsoMsisdn || "",
      supervisor: row.retailer.employee?.supervisor?.name || "Unassigned",
      amount: Number(row.amount),
    }));

    return NextResponse.json({ rows, dailyRows: day, importHistory: history, month: start.toISOString().slice(0, 10),range:{from:fromDate.toISOString().slice(0,10),to:new Date(rangeEnd.getTime()-86400000).toISOString().slice(0,10)} });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load C2C summary" }, { status: 500 });
  }
}

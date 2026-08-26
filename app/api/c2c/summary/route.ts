import {apiUser,apiPermission} from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { monthBounds } from "@/lib/month";
import {monthStartsInRange,monthStartUtc,fullyCoveredMonths} from "@/lib/date-range";
import {dhakaMonth} from "@/lib/business-time";
import {apiError} from "@/lib/http-errors";

export const dynamic = "force-dynamic";

function parseDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(req: NextRequest) {
  if(!(await apiUser(["ADMIN","ACCOUNTS"]))) return NextResponse.json({error:"Unauthorized"},{status:401});
  if(!(await apiPermission("c2c","view"))) return NextResponse.json({error:"Unauthorized"},{status:403});
  try {
    const monthText = req.nextUrl.searchParams.get("month") || dhakaMonth()+"-01";
    const selectedDate = parseDate(req.nextUrl.searchParams.get("date"));
    const { start, end } = monthBounds(monthText);
    const fromDate=parseDate(req.nextUrl.searchParams.get("from"))||start;
    const toRaw=parseDate(req.nextUrl.searchParams.get("to"));
    const rangeEnd=toRaw?new Date(toRaw.getTime()+86400000):end;
    if(rangeEnd<=fromDate) return NextResponse.json({error:"End date must be on or after start date."},{status:400});
    const targetMonths=monthStartsInRange(fromDate,rangeEnd),targetStart=targetMonths[0]||monthStartUtc(fromDate),targetEnd=new Date(Date.UTC((targetMonths.at(-1)||targetStart).getUTCFullYear(),(targetMonths.at(-1)||targetStart).getUTCMonth()+1,1));
    const fullMonthKeys=new Set(fullyCoveredMonths(fromDate,rangeEnd).map(x=>x.toISOString().slice(0,7)));
    const dayEnd = selectedDate ? new Date(selectedDate.getTime() + 86400000) : null;

    const [employees, dailyRows, history, latestMonthRows, monthlySummaries] = await Promise.all([
      prisma.employee.findMany({
        where: { active: true },
        orderBy: [{ supervisor: { name: "asc" } }, { name: "asc" }],
        include: {
          supervisor: { select: { name: true } },
          _count: { select: { retailers: true } },
          targets: { where: { month: {gte:targetStart,lt:targetEnd} } },
          manualMetrics: { where: { month: {gte:targetStart,lt:targetEnd} } },
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
        select: { amount: true, date: true, retailer: { select: { employeeId: true } } },
      }),
      prisma.c2cMonthlySummary.findMany({
        where:{month:{gte:targetStart,lt:targetEnd}},
        select:{transactionCount:true,reportEndDate:true,retailer:{select:{employeeId:true}}},
      }),
    ]);

    const byEmployee = new Map<string, { amount: number; transactions: number; reportEndDate: Date | null }>();
    for (const row of latestMonthRows) {
      const employeeId = row.retailer.employeeId;
      if (!employeeId) continue;
      const current = byEmployee.get(employeeId) || { amount: 0, transactions: 0, reportEndDate: null };
      current.amount += Number(row.amount);
      if (!current.reportEndDate || row.date > current.reportEndDate) current.reportEndDate = row.date;
      byEmployee.set(employeeId, current);
    }

    for (const summary of monthlySummaries) {
      const employeeId=summary.retailer.employeeId;if(!employeeId)continue;
      const current=byEmployee.get(employeeId)||{amount:0,transactions:0,reportEndDate:null};
      current.transactions+=summary.transactionCount;
      if(!current.reportEndDate||summary.reportEndDate>current.reportEndDate)current.reportEndDate=summary.reportEndDate;
      byEmployee.set(employeeId,current);
    }

    const rows = employees.map((employee) => {
      const c2c = byEmployee.get(employee.id) || { amount: 0, transactions: 0, reportEndDate: null };
      const c2cTarget = employee.targets.reduce((n,x)=>n+Number(x.c2cTarget||0),0);
      const totalRechargeTarget = employee.targets.reduce((n,x)=>n+Number(x.totalRechargeTarget||0),0);
      // SC has no daily breakdown. Only include monthly SC when the selected range covers that full calendar month.
      const sc = employee.manualMetrics.reduce((n,x)=>n+(fullMonthKeys.has(x.month.toISOString().slice(0,7))?Number(x.scAchieved||0):0),0);
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
    const e=apiError(error,"Failed to load C2C summary."); return NextResponse.json({error:e.error},{status:e.status});
  }
}

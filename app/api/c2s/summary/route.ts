import {apiUser,apiPermission} from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { monthBounds } from "@/lib/month";
import {monthStartsInRange,monthStartUtc} from "@/lib/date-range";
import {dhakaMonth} from "@/lib/business-time";
import {apiError} from "@/lib/http-errors";
import {isLsoComplete} from "@/lib/business-rules";

export const dynamic = "force-dynamic";

function parseDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y,m,d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y,m-1,d));
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(req: NextRequest) {
  if(!(await apiUser(["ADMIN","IT","ACCOUNTS"]))) return NextResponse.json({error:"Unauthorized"},{status:401});
  if(!(await apiPermission("c2s","view"))) return NextResponse.json({error:"Unauthorized"},{status:403});
  try {
    const monthText = req.nextUrl.searchParams.get("month") || dhakaMonth()+"-01";
    const selectedDate = parseDate(req.nextUrl.searchParams.get("date"));
    const {start,end} = monthBounds(monthText);
    const fromDate=parseDate(req.nextUrl.searchParams.get("from"))||start;
    const toRaw=parseDate(req.nextUrl.searchParams.get("to"));
    const rangeEnd=toRaw?new Date(toRaw.getTime()+86400000):end;
    if(rangeEnd<=fromDate) return NextResponse.json({error:"End date must be on or after start date."},{status:400});
    const targetMonths=monthStartsInRange(fromDate,rangeEnd),targetStart=targetMonths[0]||monthStartUtc(fromDate),targetEnd=new Date(Date.UTC((targetMonths.at(-1)||targetStart).getUTCFullYear(),(targetMonths.at(-1)||targetStart).getUTCMonth()+1,1));
    const dayEnd = selectedDate ? new Date(selectedDate.getTime()+86400000) : null;

    const [employees,dailyRows,history,monthRows,monthlySummaries] = await Promise.all([
      prisma.employee.findMany({
        where:{active:true}, orderBy:[{supervisor:{name:"asc"}},{name:"asc"}],
        include:{ supervisor:{select:{name:true}}, _count:{select:{retailers:true}}, targets:{where:{month:{gte:targetStart,lt:targetEnd}}} },
      }),
      selectedDate && dayEnd ? prisma.c2sRecord.findMany({
        where:{date:{gte:selectedDate,lt:dayEnd},amount:{gt:0}},
        select:{amount:true,retailer:{select:{retailerCode:true,retailerName:true,employee:{select:{id:true,name:true,rsoMsisdn:true,supervisor:{select:{name:true}}}}}}},
        orderBy:{amount:"desc"},
      }) : Promise.resolve([]),
      prisma.importBatch.findMany({ where:{type:"C2S"}, orderBy:{uploadedAt:"desc"}, take:10,
        select:{id:true,fileName:true,uploadedAt:true,businessDate:true,totalRows:true,successRows:true,failedRows:true,status:true} }),
      prisma.c2sRecord.findMany({ where:{date:{gte:fromDate,lt:rangeEnd}}, select:{amount:true,date:true,retailer:{select:{id:true,employeeId:true}}} }),
      prisma.c2sMonthlySummary.findMany({where:{month:{gte:targetStart,lt:targetEnd}},select:{month:true,totalAmount:true,transactionCount:true,reportEndDate:true,retailer:{select:{id:true,employeeId:true}}}}),
    ]);

    const amountByEmployee = new Map<string,number>();
    for (const row of monthRows) {
      const eid=row.retailer.employeeId;if(!eid)continue;
      amountByEmployee.set(eid,(amountByEmployee.get(eid)||0)+Number(row.amount));
    }
    const reportEndByEmployee = new Map<string,Date>();
    const byEmployee = new Map<string,{amount:number;transactions:number;lso:number}>();
    for(const summary of monthlySummaries){
      const eid=summary.retailer.employeeId;if(!eid)continue;
      const cur=byEmployee.get(eid)||{amount:amountByEmployee.get(eid)||0,transactions:0,lso:0};
      cur.transactions+=summary.transactionCount;
      if(isLsoComplete(summary.totalAmount,summary.transactionCount))cur.lso++;
      byEmployee.set(eid,cur);
      const old=reportEndByEmployee.get(eid);if(!old||summary.reportEndDate>old)reportEndByEmployee.set(eid,summary.reportEndDate);
    }
    for(const [eid,amount] of amountByEmployee)if(!byEmployee.has(eid))byEmployee.set(eid,{amount,transactions:0,lso:0});

    const rows = employees.map(employee=>{
      const perf = byEmployee.get(employee.id) || {amount:0,transactions:0,lso:0};
const lsoTarget = employee.targets.reduce((n,x)=>n+Number(x.lsoTarget||0),0);
      return {
        employeeId:employee.id, employeeCode:employee.employeeCode, name:employee.name, rsoMsisdn:employee.rsoMsisdn,
        supervisor:employee.supervisor?.name ?? "Unassigned", retailerCount:employee._count.retailers,
        transactionCount:perf.transactions, c2sAmount:perf.amount, lsoTarget, lsoAchieved:perf.lso,
        lsoPercent:lsoTarget ? Number(((perf.lso/lsoTarget)*100).toFixed(1)) : 0,
        reportEndDate:reportEndByEmployee.get(employee.id)?.toISOString().slice(0,10) ?? null,
      };
    });

    const day = dailyRows.map(row=>({ retailerCode:row.retailer.retailerCode,retailerName:row.retailer.retailerName||"",employee:row.retailer.employee?.name||"Unassigned",rsoMsisdn:row.retailer.employee?.rsoMsisdn||"",supervisor:row.retailer.employee?.supervisor?.name||"Unassigned",amount:Number(row.amount) }));
    return NextResponse.json({rows,dailyRows:day,importHistory:history,month:start.toISOString().slice(0,10),range:{from:fromDate.toISOString().slice(0,10),to:new Date(rangeEnd.getTime()-86400000).toISOString().slice(0,10)}});
  } catch (error) {
    console.error(error);
    const e=apiError(error,"Failed to load C2S summary."); return NextResponse.json({error:e.error},{status:e.status});
  }
}

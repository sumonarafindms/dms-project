import {apiUser,apiPermission} from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { monthBounds } from "@/lib/month";
import {monthStartsInRange,monthStartUtc} from "@/lib/date-range";
import {dhakaMonth} from "@/lib/business-time";
import {apiError} from "@/lib/http-errors";
import {lsoCompleteMonthlySummaryWhere} from "@/lib/business-rules";

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

    // Range totals are aggregated in the database rather than summed in memory.
    // LSO is a per-retailer-per-month threshold, so it is filtered in SQL with
    // `lsoCompleteMonthlySummaryWhere` and counted, instead of loading every
    // monthly summary row and testing each one here.
    const [employees,dailyRows,history,retailers,recordGroups,summaryGroups,lsoGroups] = await Promise.all([
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
      prisma.retailer.findMany({ where:{employeeId:{not:null}}, select:{id:true,employeeId:true} }),
      prisma.c2sRecord.groupBy({ by:["retailerId"], where:{date:{gte:fromDate,lt:rangeEnd}}, _sum:{amount:true} }),
      prisma.c2sMonthlySummary.groupBy({
        by:["retailerId"],
        where:{month:{gte:targetStart,lt:targetEnd}},
        _sum:{transactionCount:true},
        _max:{reportEndDate:true},
      }),
      prisma.c2sMonthlySummary.groupBy({
        by:["retailerId"],
        where:{month:{gte:targetStart,lt:targetEnd},...lsoCompleteMonthlySummaryWhere},
        _count:{_all:true},
      }),
    ]);

    const employeeOf = new Map(retailers.map(r=>[r.id,r.employeeId]));
    const reportEndByEmployee = new Map<string,Date>();
    const byEmployee = new Map<string,{amount:number;transactions:number;lso:number}>();
    const bucketFor=(employeeId:string)=>{
      const current=byEmployee.get(employeeId)||{amount:0,transactions:0,lso:0};
      byEmployee.set(employeeId,current);
      return current;
    };

    for(const group of recordGroups){
      const eid=employeeOf.get(group.retailerId);if(!eid)continue;
      bucketFor(eid).amount+=Number(group._sum.amount||0);
    }
    for(const group of summaryGroups){
      const eid=employeeOf.get(group.retailerId);if(!eid)continue;
      bucketFor(eid).transactions+=group._sum.transactionCount||0;
      const latest=group._max.reportEndDate;
      const old=reportEndByEmployee.get(eid);
      if(latest&&(!old||latest>old))reportEndByEmployee.set(eid,latest);
    }
    // One LSO credit per retailer-month that met both thresholds, matching the
    // previous per-summary-row count.
    for(const group of lsoGroups){
      const eid=employeeOf.get(group.retailerId);if(!eid)continue;
      bucketFor(eid).lso+=group._count._all;
    }

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

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { monthBounds } from "@/lib/month";

function parseDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y,m,d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y,m-1,d));
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(req: NextRequest) {
  try {
    const monthText = req.nextUrl.searchParams.get("month") || new Date().toISOString().slice(0,7)+"-01";
    const selectedDate = parseDate(req.nextUrl.searchParams.get("date"));
    const {start,end} = monthBounds(monthText);
    const dayEnd = selectedDate ? new Date(selectedDate.getTime()+86400000) : null;

    const [employees,dailyRows,history,monthRows] = await Promise.all([
      prisma.employee.findMany({
        where:{active:true}, orderBy:[{supervisor:{name:"asc"}},{name:"asc"}],
        include:{ supervisor:{select:{name:true}}, _count:{select:{retailers:true}}, targets:{where:{month:start},take:1} },
      }),
      selectedDate && dayEnd ? prisma.c2sRecord.findMany({
        where:{date:{gte:selectedDate,lt:dayEnd},amount:{gt:0}},
        select:{amount:true,retailer:{select:{retailerCode:true,retailerName:true,employee:{select:{id:true,name:true,rsoMsisdn:true,supervisor:{select:{name:true}}}}}}},
        orderBy:{amount:"desc"},
      }) : Promise.resolve([]),
      prisma.importBatch.findMany({ where:{type:"C2S"}, orderBy:{uploadedAt:"desc"}, take:10,
        select:{id:true,fileName:true,uploadedAt:true,businessDate:true,totalRows:true,successRows:true,failedRows:true,status:true} }),
      prisma.c2sRecord.findMany({ where:{date:{gte:start,lt:end}}, select:{transactionCount:true,amount:true,date:true,retailer:{select:{id:true,employeeId:true}}} }),
    ]);

    const byRetailer = new Map<string,{employeeId:string|null;amount:number;transactions:number}>();
    const reportEndByEmployee = new Map<string,Date>();
    for (const row of monthRows) {
      const rid = row.retailer.id;
      const cur = byRetailer.get(rid) || {employeeId:row.retailer.employeeId,amount:0,transactions:0};
      cur.amount += Number(row.amount); cur.transactions += row.transactionCount; byRetailer.set(rid,cur);
      const eid = row.retailer.employeeId;
      if (eid) { const old=reportEndByEmployee.get(eid); if(!old || row.date>old) reportEndByEmployee.set(eid,row.date); }
    }

    const byEmployee = new Map<string,{amount:number;transactions:number;lso:number}>();
    for (const r of byRetailer.values()) {
      if (!r.employeeId) continue;
      const cur = byEmployee.get(r.employeeId) || {amount:0,transactions:0,lso:0};
      cur.amount += r.amount; cur.transactions += r.transactions;
      if (r.amount >= 500 && r.transactions >= 7) cur.lso += 1;
      byEmployee.set(r.employeeId,cur);
    }

    const rows = employees.map(employee=>{
      const perf = byEmployee.get(employee.id) || {amount:0,transactions:0,lso:0};
      const target = employee.targets[0]; const lsoTarget = Number(target?.lsoTarget ?? 0);
      return {
        employeeId:employee.id, employeeCode:employee.employeeCode, name:employee.name, rsoMsisdn:employee.rsoMsisdn,
        supervisor:employee.supervisor?.name ?? "Unassigned", retailerCount:employee._count.retailers,
        transactionCount:perf.transactions, c2sAmount:perf.amount, lsoTarget, lsoAchieved:perf.lso,
        lsoPercent:lsoTarget ? Number(((perf.lso/lsoTarget)*100).toFixed(1)) : 0,
        reportEndDate:reportEndByEmployee.get(employee.id)?.toISOString().slice(0,10) ?? null,
      };
    });

    const day = dailyRows.map(row=>({ retailerCode:row.retailer.retailerCode,retailerName:row.retailer.retailerName||"",employee:row.retailer.employee?.name||"Unassigned",rsoMsisdn:row.retailer.employee?.rsoMsisdn||"",supervisor:row.retailer.employee?.supervisor?.name||"Unassigned",amount:Number(row.amount) }));
    return NextResponse.json({rows,dailyRows:day,importHistory:history,month:start.toISOString().slice(0,10)});
  } catch (error) {
    console.error(error);
    return NextResponse.json({error:error instanceof Error?error.message:"Failed to load C2S summary"},{status:500});
  }
}

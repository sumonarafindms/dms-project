import {apiUser,apiPermission} from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {apiError} from "@/lib/http-errors";

export async function GET() {
  if(!(await apiUser(["ADMIN","ACCOUNTS"]))) return NextResponse.json({error:"Unauthorized"},{status:401});
  if(!(await apiPermission("ob","view"))) return NextResponse.json({error:"Unauthorized"},{status:403});
  try {
    const [rows,batch] = await Promise.all([
      prisma.obRecord.findMany({
        select:{amount:true,date:true,retailer:{select:{retailerCode:true,retailerName:true,employee:{select:{name:true,rsoMsisdn:true,supervisor:{select:{name:true}}}}}}},
        orderBy:{amount:"desc"},
      }),
      prisma.importBatch.findFirst({where:{type:"OB"},orderBy:{uploadedAt:"desc"},select:{id:true,fileName:true,uploadedAt:true,businessDate:true,totalRows:true,successRows:true,failedRows:true,status:true}}),
    ]);
    const total = rows.reduce((s,r)=>s+Number(r.amount),0);
    return NextResponse.json({
      snapshotDate:batch?.businessDate?.toISOString().slice(0,10) ?? rows[0]?.date.toISOString().slice(0,10) ?? null,
      totalOpeningBalance:total,
      retailerCount:rows.length,
      batch,
      rows:rows.map(r=>({retailerCode:r.retailer.retailerCode,retailerName:r.retailer.retailerName||"",employee:r.retailer.employee?.name||"Unassigned",rsoMsisdn:r.retailer.employee?.rsoMsisdn||"",supervisor:r.retailer.employee?.supervisor?.name||"Unassigned",amount:Number(r.amount)})),
    });
  } catch (error) {
    console.error(error);
    const e=apiError(error,"Failed to load Opening Balance."); return NextResponse.json({error:e.error},{status:e.status});
  }
}

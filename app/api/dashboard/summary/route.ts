import {NextRequest,NextResponse} from "next/server";
import {apiUser} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {monthBounds} from "@/lib/month";
import {isSimSwapProduct} from "@/lib/ga-product";
import {apiError} from "@/lib/http-errors";
import {dhakaMonth} from "@/lib/business-time";

export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=30;

function selectedMonth(value:string|null){
  const text=value&&/^\d{4}-\d{2}$/.test(value)?value:dhakaMonth();
  return monthBounds(`${text}-01T00:00:00.000Z`);
}

export async function GET(req:NextRequest){
  if(!(await apiUser(["ADMIN","IT"])))return NextResponse.json({error:"Unauthorized"},{status:401});
  try{
    const {start,end}=selectedMonth(req.nextUrl.searchParams.get("month"));

    const [employees,gaRows,c2cRows,c2sSummaries]=await Promise.all([
      prisma.employee.findMany({
        where:{active:true},
        select:{
          id:true,employeeCode:true,name:true,rsoMsisdn:true,
          supervisor:{select:{name:true}},
          _count:{select:{retailers:true}},
          targets:{where:{month:start},take:1,select:{gaTarget:true,c2cTarget:true,scTarget:true,totalRechargeTarget:true,ssoTarget:true,lsoTarget:true}},
          manualMetrics:{where:{month:start},take:1,select:{scAchieved:true}},
        },
        orderBy:[{supervisor:{name:"asc"}},{name:"asc"}],
      }),
      prisma.gaActivation.findMany({
        where:{activationDate:{gte:start,lt:end}},
        select:{
          retailerId:true,productCode:true,activationDate:true,
          retailer:{select:{employeeId:true,simSeller:true}},
        },
      }),
      prisma.c2cRecord.findMany({
        where:{date:{gte:start,lt:end}},
        select:{amount:true,retailer:{select:{employeeId:true}}},
      }),
      prisma.c2sMonthlySummary.findMany({
        where:{month:start},
        select:{totalAmount:true,transactionCount:true,retailer:{select:{employeeId:true}}},
      }),
    ]);

    const gaByEmployee=new Map<string,number>();
    const retailerGa=new Map<string,{employeeId:string;count:number;simSeller:boolean}>();
    for(const row of gaRows){
      if(isSimSwapProduct(row.productCode))continue;
      const employeeId=row.retailer.employeeId;
      if(!employeeId)continue;
      gaByEmployee.set(employeeId,(gaByEmployee.get(employeeId)||0)+1);
      const key=`${row.retailerId}|${row.activationDate.toISOString().slice(0,7)}`;
      const current=retailerGa.get(key)||{employeeId,count:0,simSeller:(row.retailer.simSeller||"").trim().toUpperCase()==="Y"};
      current.count++;
      retailerGa.set(key,current);
    }

    const ssoByEmployee=new Map<string,number>();
    for(const row of retailerGa.values()){
      if(row.simSeller&&row.count>=2)ssoByEmployee.set(row.employeeId,(ssoByEmployee.get(row.employeeId)||0)+1);
    }

    const c2cByEmployee=new Map<string,number>();
    for(const row of c2cRows){
      const employeeId=row.retailer.employeeId;
      if(!employeeId)continue;
      c2cByEmployee.set(employeeId,(c2cByEmployee.get(employeeId)||0)+Number(row.amount));
    }

    const lsoByEmployee=new Map<string,number>();
    for(const row of c2sSummaries){
      const employeeId=row.retailer.employeeId;
      if(!employeeId)continue;
      if(Number(row.totalAmount)>=500&&row.transactionCount>=7){
        lsoByEmployee.set(employeeId,(lsoByEmployee.get(employeeId)||0)+1);
      }
    }

    const rows=employees.map(employee=>{
      const target=employee.targets[0],manual=employee.manualMetrics[0];
      const scAchieved=Number(manual?.scAchieved||0);
      const c2cAchieved=c2cByEmployee.get(employee.id)||0;
      return {
        employeeId:employee.id,
        employeeCode:employee.employeeCode,
        name:employee.name,
        supervisor:employee.supervisor?.name||"Unassigned",
        retailerCount:employee._count.retailers,
        gaTarget:target?.gaTarget||0,
        gaAchieved:gaByEmployee.get(employee.id)||0,
        ssoTarget:target?.ssoTarget||0,
        ssoAchieved:ssoByEmployee.get(employee.id)||0,
        c2cTarget:Number(target?.c2cTarget||0),
        c2cAchieved,
        scTarget:Number(target?.scTarget||0),
        scAchieved,
        totalRechargeTarget:Number(target?.totalRechargeTarget||0),
        totalRechargeAchieved:c2cAchieved+scAchieved,
        lsoTarget:target?.lsoTarget||0,
        lsoAchieved:lsoByEmployee.get(employee.id)||0,
      };
    });

    return NextResponse.json(
      {month:start.toISOString().slice(0,7),rows},
      {headers:{"Cache-Control":"no-store, max-age=0"}},
    );
  }catch(error){
    console.error(error);
    const e=apiError(error,"Failed to load dashboard summary.");
    return NextResponse.json({error:e.error},{status:e.status});
  }
}

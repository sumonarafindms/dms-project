import {prisma} from "./prisma";
import {employeePerformance} from "./performance";
import {monthBounds} from "./month";
import {normalizeMonth} from "./drilldown";
import {parseYmd,monthStartsInRange,monthStartUtc} from "./date-range";
import {GA_CLASSIFICATION_SELECT,isLsoComplete,isSsoComplete,isStandardGaActivation,summarizeGaActivations} from "./business-rules";

export async function employeeDetail(employeeId:string,month:string,fromInput?:string,toInput?:string){
 const m=normalizeMonth(fromInput?.slice(0,7)||month), {start,end}=monthBounds(`${m}-01`);
 const rs=parseYmd(fromInput)||start,to=parseYmd(toInput),re=to?new Date(to.getTime()+86400000):end;
 const months=monthStartsInRange(rs,re),targetStart=months[0]||monthStartUtc(rs),last=months.at(-1)||targetStart,targetEnd=new Date(Date.UTC(last.getUTCFullYear(),last.getUTCMonth()+1,1));
 const perf=(await employeePerformance(`${m}-01`,[employeeId],fromInput,toInput))[0];if(!perf)return null;
 const employee=await prisma.employee.findUnique({where:{id:employeeId},include:{supervisor:true}});if(!employee)return null;
 const retailers=await prisma.retailer.findMany({
  where:{employeeId,active:true},
  select:{
   id:true,retailerCode:true,retailerName:true,simSeller:true,category:true,route:true,
   gaActivations:{where:{activationDate:{gte:rs,lt:re}},select:{id:true,activationDate:true,...GA_CLASSIFICATION_SELECT}},
   c2sRecords:{where:{date:{gte:rs,lt:re}},select:{amount:true}},
   c2cRecords:{where:{date:{gte:rs,lt:re}},select:{amount:true}},
   c2sMonthlySummaries:{where:{month:{gte:targetStart,lt:targetEnd}},select:{month:true,totalAmount:true,transactionCount:true}},
   bpAssignments:{where:{active:true},select:{id:true}}
  },orderBy:{retailerCode:"asc"}
 });
 return {employee,perf,retailers:retailers.map(r=>{
  const c2sAmount=r.c2sRecords.reduce((a,x)=>a+Number(x.amount),0),c2sTrx=r.c2sMonthlySummaries.reduce((a,x)=>a+x.transactionCount,0),c2cAmount=r.c2cRecords.reduce((a,x)=>a+Number(x.amount),0);
  // Total GA excludes SIMWAP / EV-SWAP; swaps are reported on their own.
  const breakdown=summarizeGaActivations(r.gaActivations),ga=breakdown.total,simSwap=breakdown.simSwap;
  const gaByMonth=new Map<string,number>();for(const x of r.gaActivations){if(!isStandardGaActivation(x))continue;const k=x.activationDate.toISOString().slice(0,7);gaByMonth.set(k,(gaByMonth.get(k)||0)+1)}
  const sso=[...gaByMonth.values()].some(n=>isSsoComplete(r.simSeller,n));
  const lso=r.c2sMonthlySummaries.some(x=>isLsoComplete(x.totalAmount,x.transactionCount));
  return {...r,ga,simSwap,c2sAmount,c2sTrx,c2cAmount,lso,sso,isBp:r.bpAssignments.length>0}
 })};
}

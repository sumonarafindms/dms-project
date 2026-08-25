import {prisma} from "./prisma";
import {employeePerformance} from "./performance";
import {monthBounds} from "./month";
import {normalizeMonth} from "./drilldown";
export async function employeeDetail(employeeId:string,month:string){
 const m=normalizeMonth(month), {start,end}=monthBounds(`${m}-01`);
 const perf=(await employeePerformance(`${m}-01`,[employeeId]))[0]; if(!perf)return null;
 const employee=await prisma.employee.findUnique({where:{id:employeeId},include:{supervisor:true}});if(!employee)return null;
 const retailers=await prisma.retailer.findMany({where:{employeeId,active:true},select:{id:true,retailerCode:true,retailerName:true,simSeller:true,category:true,route:true,gaActivations:{where:{activationDate:{gte:start,lt:end}},select:{id:true}},c2sRecords:{where:{date:{gte:start,lt:end}},select:{amount:true,transactionCount:true}},c2cRecords:{where:{date:{gte:start,lt:end}},select:{amount:true,transactionCount:true}},bpAssignments:{where:{active:true},select:{id:true}}},orderBy:{retailerCode:"asc"}});
 return {employee,perf,retailers:retailers.map(r=>{const c2sAmount=r.c2sRecords.reduce((a,x)=>a+Number(x.amount),0),c2sTrx=r.c2sRecords.reduce((a,x)=>a+x.transactionCount,0),c2cAmount=r.c2cRecords.reduce((a,x)=>a+Number(x.amount),0),ga=r.gaActivations.length;return {...r,ga,c2sAmount,c2sTrx,c2cAmount,lso:c2sAmount>=500&&c2sTrx>=7,sso:(r.simSeller||"").toUpperCase()==="Y"&&ga>=2,isBp:r.bpAssignments.length>0}})};
}

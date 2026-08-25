import {prisma} from "./prisma";
import {monthBounds} from "./month";

export type EmployeePerformance={employeeId:string;name:string;rsoMsisdn:string;employeeCode:string|null;supervisor:string;retailerCount:number;gaTarget:number;gaAchieved:number;ga150:number;ga300:number;ssoTarget:number;ssoAchieved:number;c2cTarget:number;c2cAchieved:number;scTarget:number;scAchieved:number;totalRechargeTarget:number;totalRechargeAchieved:number;lsoTarget:number;lsoAchieved:number;c2sAmount:number;c2sTransactions:number};
export async function employeePerformance(month:string,employeeIds?:string[],fromInput?:string,toInput?:string){
 const {start,end}=monthBounds(month);
 const parse=(v?:string)=>v&&/^\d{4}-\d{2}-\d{2}$/.test(v)?new Date(`${v}T00:00:00.000Z`):null;
 const rangeStart=parse(fromInput)||start,to=parse(toInput),rangeEnd=to?new Date(to.getTime()+86400000):end;
 const where:any={active:true}; if(employeeIds)where.id={in:employeeIds};
 const [employees,ga,c2c,c2s]=await Promise.all([
  prisma.employee.findMany({where,include:{supervisor:true,_count:{select:{retailers:true}},targets:{where:{month:start},take:1},manualMetrics:{where:{month:start},take:1}}}),
  prisma.gaActivation.findMany({where:{activationDate:{gte:rangeStart,lt:rangeEnd},...(employeeIds?{retailer:{employeeId:{in:employeeIds}}}:{})},select:{retailerId:true,sellingPrice:true,retailer:{select:{employeeId:true,simSeller:true}}}}),
  prisma.c2cRecord.findMany({where:{date:{gte:rangeStart,lt:rangeEnd},...(employeeIds?{retailer:{employeeId:{in:employeeIds}}}:{})},select:{amount:true,transactionCount:true,retailer:{select:{employeeId:true}}}}),
  prisma.c2sRecord.findMany({where:{date:{gte:rangeStart,lt:rangeEnd},...(employeeIds?{retailer:{employeeId:{in:employeeIds}}}:{})},select:{amount:true,transactionCount:true,retailer:{select:{id:true,employeeId:true}}}}),
 ]);
 const gaBy=new Map<string,{t:number,a150:number,a300:number}>(), retailerGa=new Map<string,{eid:string,count:number,eligible:boolean}>();
 for(const x of ga){const eid=x.retailer.employeeId;if(!eid)continue;const g=gaBy.get(eid)||{t:0,a150:0,a300:0};g.t++;Number(x.sellingPrice)===170?g.a150++:g.a300++;gaBy.set(eid,g);const r=retailerGa.get(x.retailerId)||{eid,count:0,eligible:(x.retailer.simSeller||"").trim().toUpperCase()==="Y"};r.count++;retailerGa.set(x.retailerId,r)}
 const sso=new Map<string,number>();for(const r of retailerGa.values())if(r.eligible&&r.count>=2)sso.set(r.eid,(sso.get(r.eid)||0)+1);
 const c2cBy=new Map<string,number>();for(const x of c2c){const eid=x.retailer.employeeId;if(eid)c2cBy.set(eid,(c2cBy.get(eid)||0)+Number(x.amount))}
 const retailerC2s=new Map<string,{eid:string;amount:number;trx:number}>();for(const x of c2s){const eid=x.retailer.employeeId;if(!eid)continue;const r=retailerC2s.get(x.retailer.id)||{eid,amount:0,trx:0};r.amount+=Number(x.amount);r.trx+=x.transactionCount;retailerC2s.set(x.retailer.id,r)}
 const c2sBy=new Map<string,{amount:number,trx:number,lso:number}>();for(const r of retailerC2s.values()){const e=c2sBy.get(r.eid)||{amount:0,trx:0,lso:0};e.amount+=r.amount;e.trx+=r.trx;if(r.amount>=500&&r.trx>=7)e.lso++;c2sBy.set(r.eid,e)}
 return employees.map(e=>{const t=e.targets[0],g=gaBy.get(e.id)||{t:0,a150:0,a300:0},c=c2cBy.get(e.id)||0,s=Number(e.manualMetrics[0]?.scAchieved||0),cs=c2sBy.get(e.id)||{amount:0,trx:0,lso:0};return {employeeId:e.id,name:e.name,rsoMsisdn:e.rsoMsisdn,employeeCode:e.employeeCode,supervisor:e.supervisor?.name||"Unassigned",retailerCount:e._count.retailers,gaTarget:t?.gaTarget||0,gaAchieved:g.t,ga150:g.a150,ga300:g.a300,ssoTarget:t?.ssoTarget||0,ssoAchieved:sso.get(e.id)||0,c2cTarget:Number(t?.c2cTarget||0),c2cAchieved:c,scTarget:Number(t?.scTarget||0),scAchieved:s,totalRechargeTarget:Number(t?.totalRechargeTarget||0),totalRechargeAchieved:c+s,lsoTarget:t?.lsoTarget||0,lsoAchieved:cs.lso,c2sAmount:cs.amount,c2sTransactions:cs.trx} satisfies EmployeePerformance})
}
export function pct(a:number,t:number){return t?Math.round(a/t*100):0}

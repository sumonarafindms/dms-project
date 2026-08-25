import {prisma} from "./prisma";
import {monthBounds} from "./month";
import {parseYmd,monthStartUtc,monthStartsInRange,fullyCoveredMonths} from "./date-range";
import {isSimSwapProduct,isGa170Product,isGa300Product} from "./ga-product";

export type EmployeePerformance={employeeId:string;name:string;rsoMsisdn:string;employeeCode:string|null;supervisor:string;retailerCount:number;gaTarget:number;gaAchieved:number;ga150:number;ga300:number;ssoTarget:number;ssoAchieved:number;c2cTarget:number;c2cAchieved:number;scTarget:number;scAchieved:number;totalRechargeTarget:number;totalRechargeAchieved:number;lsoTarget:number;lsoAchieved:number;c2sAmount:number;c2sTransactions:number};

export async function employeePerformance(month:string,employeeIds?:string[],fromInput?:string,toInput?:string){
 const {start,end}=monthBounds(month);
 const rangeStart=parseYmd(fromInput)||start,to=parseYmd(toInput),rangeEnd=to?new Date(to.getTime()+86400000):end;
 if(rangeEnd<=rangeStart)return [];
 const targetMonths=monthStartsInRange(rangeStart,rangeEnd),firstMonth=targetMonths[0]||monthStartUtc(rangeStart),lastMonth=targetMonths.at(-1)||firstMonth,afterLast=new Date(Date.UTC(lastMonth.getUTCFullYear(),lastMonth.getUTCMonth()+1,1));
 const fullMonthKeys=new Set(fullyCoveredMonths(rangeStart,rangeEnd).map(x=>x.toISOString().slice(0,7)));
 const employeeWhere:any={active:true};if(employeeIds)employeeWhere.id={in:employeeIds};

 const employees=await prisma.employee.findMany({where:employeeWhere,include:{
  supervisor:true,_count:{select:{retailers:true}},
  targets:{where:{month:{gte:firstMonth,lt:afterLast}}},
  manualMetrics:{where:{month:{gte:firstMonth,lt:afterLast}}},
 }});
 if(!employees.length)return [];

 const eids=employees.map(e=>e.id);
 const retailerRefs=await prisma.retailer.findMany({where:{employeeId:{in:eids}},select:{id:true,employeeId:true,simSeller:true}});
 const retailerIds=retailerRefs.map(r=>r.id),retailerMap=new Map(retailerRefs.map(r=>[r.id,r]));
 if(!retailerIds.length){
  return employees.map(e=>{
   const targets=e.targets.reduce((a,t)=>({ga:a.ga+t.gaTarget,c2c:a.c2c+Number(t.c2cTarget),sc:a.sc+Number(t.scTarget),recharge:a.recharge+Number(t.totalRechargeTarget),sso:a.sso+t.ssoTarget,lso:a.lso+t.lsoTarget}),{ga:0,c2c:0,sc:0,recharge:0,sso:0,lso:0});
   const sc=e.manualMetrics.reduce((sum,m)=>sum+(fullMonthKeys.has(m.month.toISOString().slice(0,7))?Number(m.scAchieved||0):0),0);
   return {employeeId:e.id,name:e.name,rsoMsisdn:e.rsoMsisdn,employeeCode:e.employeeCode,supervisor:e.supervisor?.name||"Unassigned",retailerCount:e._count.retailers,gaTarget:targets.ga,gaAchieved:0,ga150:0,ga300:0,ssoTarget:targets.sso,ssoAchieved:0,c2cTarget:targets.c2c,c2cAchieved:0,scTarget:targets.sc,scAchieved:sc,totalRechargeTarget:targets.recharge,totalRechargeAchieved:sc,lsoTarget:targets.lso,lsoAchieved:0,c2sAmount:0,c2sTransactions:0} satisfies EmployeePerformance
  })
 }

 const [gaGroups,c2cGroups,c2sGroups,c2sMonthly]=await Promise.all([
  prisma.gaActivation.groupBy({by:["retailerId","sellingPrice","productCode","activationDate"],where:{retailerId:{in:retailerIds},activationDate:{gte:rangeStart,lt:rangeEnd}},_count:{_all:true}}),
  prisma.c2cRecord.groupBy({by:["retailerId"],where:{retailerId:{in:retailerIds},date:{gte:rangeStart,lt:rangeEnd}},_sum:{amount:true}}),
  prisma.c2sRecord.groupBy({by:["retailerId"],where:{retailerId:{in:retailerIds},date:{gte:rangeStart,lt:rangeEnd}},_sum:{amount:true}}),
  prisma.c2sMonthlySummary.findMany({where:{retailerId:{in:retailerIds},month:{gte:firstMonth,lt:afterLast}},select:{retailerId:true,totalAmount:true,transactionCount:true}}),
 ]);

 const gaBy=new Map<string,{t:number;a150:number;a300:number}>(),retailerGaMonth=new Map<string,{eid:string;count:number;eligible:boolean}>();
 for(const x of gaGroups){
  const rr=retailerMap.get(x.retailerId),eid=rr?.employeeId;if(!eid)continue;
  const count=x._count._all;
  if(isSimSwapProduct(x.productCode))continue;
  const g=gaBy.get(eid)||{t:0,a150:0,a300:0};g.t+=count;
  if(isGa170Product(x.productCode)||(!x.productCode&&Number(x.sellingPrice)===170))g.a150+=count;
  else if(isGa300Product(x.productCode)||!x.productCode)g.a300+=count;
  gaBy.set(eid,g);
  const key=`${x.retailerId}|${x.activationDate.toISOString().slice(0,7)}`,r=retailerGaMonth.get(key)||{eid,count:0,eligible:(rr?.simSeller||"").trim().toUpperCase()==="Y"};r.count+=count;retailerGaMonth.set(key,r);
 }
 const sso=new Map<string,number>();for(const r of retailerGaMonth.values())if(r.eligible&&r.count>=2)sso.set(r.eid,(sso.get(r.eid)||0)+1);

 const c2cBy=new Map<string,number>();for(const x of c2cGroups){const eid=retailerMap.get(x.retailerId)?.employeeId;if(eid)c2cBy.set(eid,(c2cBy.get(eid)||0)+Number(x._sum.amount||0))}
 const c2sAmountBy=new Map<string,number>();for(const x of c2sGroups){const eid=retailerMap.get(x.retailerId)?.employeeId;if(eid)c2sAmountBy.set(eid,(c2sAmountBy.get(eid)||0)+Number(x._sum.amount||0))}
 const c2sBy=new Map<string,{amount:number;trx:number;lso:number}>();
 for(const r of c2sMonthly){
  const eid=retailerMap.get(r.retailerId)?.employeeId;if(!eid)continue;
  const e=c2sBy.get(eid)||{amount:c2sAmountBy.get(eid)||0,trx:0,lso:0};
  e.trx+=r.transactionCount;if(Number(r.totalAmount)>=500&&r.transactionCount>=7)e.lso++;c2sBy.set(eid,e)
 }
 for(const [eid,amount] of c2sAmountBy)if(!c2sBy.has(eid))c2sBy.set(eid,{amount,trx:0,lso:0});

 return employees.map(e=>{
  const targets=e.targets.reduce((a,t)=>({ga:a.ga+t.gaTarget,c2c:a.c2c+Number(t.c2cTarget),sc:a.sc+Number(t.scTarget),recharge:a.recharge+Number(t.totalRechargeTarget),sso:a.sso+t.ssoTarget,lso:a.lso+t.lsoTarget}),{ga:0,c2c:0,sc:0,recharge:0,sso:0,lso:0});
  const sc=e.manualMetrics.reduce((sum,m)=>sum+(fullMonthKeys.has(m.month.toISOString().slice(0,7))?Number(m.scAchieved||0):0),0);
  const g=gaBy.get(e.id)||{t:0,a150:0,a300:0},c=c2cBy.get(e.id)||0,cs=c2sBy.get(e.id)||{amount:0,trx:0,lso:0};
  return {employeeId:e.id,name:e.name,rsoMsisdn:e.rsoMsisdn,employeeCode:e.employeeCode,supervisor:e.supervisor?.name||"Unassigned",retailerCount:e._count.retailers,gaTarget:targets.ga,gaAchieved:g.t,ga150:g.a150,ga300:g.a300,ssoTarget:targets.sso,ssoAchieved:sso.get(e.id)||0,c2cTarget:targets.c2c,c2cAchieved:c,scTarget:targets.sc,scAchieved:sc,totalRechargeTarget:targets.recharge,totalRechargeAchieved:c+sc,lsoTarget:targets.lso,lsoAchieved:cs.lso,c2sAmount:cs.amount,c2sTransactions:cs.trx} satisfies EmployeePerformance
 })
}
export function pct(a:number,t:number){return t?Math.round(a/t*100):0}

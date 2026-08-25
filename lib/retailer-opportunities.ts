import {prisma} from "./prisma";
import {monthBounds} from "./month";
import {normalizeMonth} from "./drilldown";

export type RetailerOpportunity={
  id:string;retailerCode:string;retailerName:string;simSeller:boolean;category:string;route:string;
  employeeId:string|null;employeeName:string;supervisor:string;
  ga:number;c2c:number;c2s:number;c2sTransactions:number;openingBalance:number|null;
  ssoComplete:boolean;lsoComplete:boolean;reasons:string[];priority:number;
};

export async function retailerOpportunities(monthInput:string,employeeIds?:string[],fromInput?:string,toInput?:string){
  const month=normalizeMonth(monthInput); const {start,end}=monthBounds(`${month}-01`);
  const parse=(v?:string)=>v&&/^\d{4}-\d{2}-\d{2}$/.test(v)?new Date(`${v}T00:00:00.000Z`):null;
  const rangeStart=parse(fromInput)||start,to=parse(toInput),rangeEnd=to?new Date(to.getTime()+86400000):end;
  const [retailers,ga,c2c,c2s,ob]=await Promise.all([
    prisma.retailer.findMany({where:{active:true,...(employeeIds?{employeeId:{in:employeeIds}}:{})},select:{id:true,retailerCode:true,retailerName:true,simSeller:true,category:true,route:true,employeeId:true,employee:{select:{name:true,supervisor:{select:{name:true}}}}}}),
    prisma.gaActivation.groupBy({by:["retailerId"],where:{activationDate:{gte:rangeStart,lt:rangeEnd}},_count:{_all:true}}),
    prisma.c2cRecord.groupBy({by:["retailerId"],where:{date:{gte:rangeStart,lt:rangeEnd}},_sum:{amount:true}}),
    prisma.c2sRecord.groupBy({by:["retailerId"],where:{date:{gte:rangeStart,lt:rangeEnd}},_sum:{amount:true,transactionCount:true}}),
    prisma.obRecord.findMany({select:{retailerId:true,amount:true}}),
  ]);
  const gaMap=new Map(ga.map(x=>[x.retailerId,x._count._all]));
  const c2cMap=new Map(c2c.map(x=>[x.retailerId,Number(x._sum.amount||0)]));
  const c2sMap=new Map(c2s.map(x=>[x.retailerId,{amount:Number(x._sum.amount||0),trx:Number(x._sum.transactionCount||0)}]));
  const obMap=new Map(ob.map(x=>[x.retailerId,Number(x.amount)]));
  return retailers.map(r=>{
    const gaCount=gaMap.get(r.id)||0,c2cAmount=c2cMap.get(r.id)||0,cs=c2sMap.get(r.id)||{amount:0,trx:0};
    const simSeller=(r.simSeller||"").trim().toUpperCase()==="Y";
    const ssoComplete=simSeller&&gaCount>=2,lsoComplete=cs.amount>=500&&cs.trx>=7;
    const reasons:string[]=[];
    if(simSeller&&!ssoComplete)reasons.push(`SSO needs ${Math.max(0,2-gaCount)} GA`);
    if(!lsoComplete){
      if(cs.amount<500&&cs.trx<7)reasons.push(`LSO needs ৳${Math.ceil(500-cs.amount)} + ${7-cs.trx} trx`);
      else if(cs.amount<500)reasons.push(`LSO needs ৳${Math.ceil(500-cs.amount)}`);
      else reasons.push(`LSO needs ${7-cs.trx} trx`);
    }
    if(cs.amount===0)reasons.push("No C2S in selected range");
    if(simSeller&&gaCount===0)reasons.push("No GA in selected range");
    const priority=(simSeller&&!ssoComplete?2:0)+(!lsoComplete?2:0)+(cs.amount===0?1:0)+(simSeller&&gaCount===0?1:0);
    return {id:r.id,retailerCode:r.retailerCode,retailerName:r.retailerName||"Unnamed retailer",simSeller,category:r.category||"—",route:r.route||"—",employeeId:r.employeeId,employeeName:r.employee?.name||"Unassigned",supervisor:r.employee?.supervisor?.name||"Unassigned",ga:gaCount,c2c:c2cAmount,c2s:cs.amount,c2sTransactions:cs.trx,openingBalance:obMap.has(r.id)?obMap.get(r.id)!:null,ssoComplete,lsoComplete,reasons,priority} satisfies RetailerOpportunity;
  });
}

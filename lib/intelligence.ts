import {Prisma} from "@prisma/client";
import {prisma} from "./prisma";
import {monthBounds} from "./month";
import type {EmployeePerformance} from "./performance";
import {dhakaTodayYmd} from "./business-time";
import {withStandardGa} from "./business-rules";

export type PaceStatus="Ahead"|"On track"|"Behind"|"No target";
export function monthPace(month:string, now=new Date()){
  const {start,end}=monthBounds(month);
  const totalDays=Math.round((end.getTime()-start.getTime())/86400000);
  const todayUtc=new Date(`${dhakaTodayYmd(now)}T00:00:00.000Z`);
  if(todayUtc<start)return 0;
  if(todayUtc>=end)return 100;
  const elapsed=Math.max(1,Math.min(totalDays,Math.floor((todayUtc.getTime()-start.getTime())/86400000)+1));
  return Math.round(elapsed/totalDays*100);
}
export function paceStatus(achieved:number,target:number,expected:number){
  if(!target)return {status:"No target" as PaceStatus,progress:0,gap:0};
  const progress=Math.round(achieved/target*100);
  const gap=progress-expected;
  const status:PaceStatus=gap>=8?"Ahead":gap>=-5?"On track":"Behind";
  return {status,progress,gap};
}
export function rankRows(rows:EmployeePerformance[],expected:number){
  return rows.map(r=>{
    const recharge=paceStatus(r.totalRechargeAchieved,r.totalRechargeTarget,expected);
    const ga=paceStatus(r.gaAchieved,r.gaTarget,expected);
    const executionTargets=(r.ssoTarget?1:0)+(r.lsoTarget?1:0);
    const ssoProgress=r.ssoTarget?Math.min(100,r.ssoAchieved/r.ssoTarget*100):0;
    const lsoProgress=r.lsoTarget?Math.min(100,r.lsoAchieved/r.lsoTarget*100):0;
    const executionProgress=executionTargets?Math.round((ssoProgress+lsoProgress)/executionTargets):0;
    const score=Math.round((recharge.progress+ga.progress+executionProgress)/3);
    return {...r,pace:recharge.status,score,rechargeProgress:recharge.progress,gaProgress:ga.progress,executionProgress};
  }).sort((a,b)=>b.score-a.score);
}
export async function latestDailySnapshot(employeeIds?:string[]){
  const gaFilter:Prisma.GaActivationWhereInput=withStandardGa(employeeIds?{retailer:{employeeId:{in:employeeIds}}}:{});
  const c2cFilter:Prisma.C2cRecordWhereInput=employeeIds?{retailer:{employeeId:{in:employeeIds}}}:{};
  const [latestGa,latestC2c]=await Promise.all([
    prisma.gaActivation.findFirst({where:gaFilter,orderBy:{activationDate:"desc"},select:{activationDate:true}}),
    prisma.c2cRecord.findFirst({where:c2cFilter,orderBy:{date:"desc"},select:{date:true}}),
  ]);
  const gaDate=latestGa?.activationDate||null,c2cDate=latestC2c?.date||null;
  const [gaRows,c2cRows]=await Promise.all([
    gaDate?prisma.gaActivation.findMany({where:{...gaFilter,activationDate:gaDate},select:{retailer:{select:{employeeId:true}}}}):Promise.resolve([]),
    c2cDate?prisma.c2cRecord.findMany({where:{...c2cFilter,date:c2cDate},select:{amount:true,retailer:{select:{employeeId:true}}}}):Promise.resolve([]),
  ]);
  const gaBy=new Map<string,number>(),c2cBy=new Map<string,number>();
  for(const x of gaRows){const id=x.retailer.employeeId;if(id)gaBy.set(id,(gaBy.get(id)||0)+1)}
  for(const x of c2cRows){const id=x.retailer.employeeId;if(id)c2cBy.set(id,(c2cBy.get(id)||0)+Number(x.amount))}
  return {
    gaDate,c2cDate,
    gaTotal:[...gaBy.values()].reduce((a,b)=>a+b,0),
    c2cTotal:[...c2cBy.values()].reduce((a,b)=>a+b,0),
    gaBy,c2cBy
  };
}

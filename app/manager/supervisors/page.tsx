import {requirePagePermission} from "../../../lib/auth";
import {employeePerformance,pct} from "../../../lib/performance";
import {prisma} from "../../../lib/prisma";
import {FilterForm} from "../../components/DrillUI";
import {normalizeMonth} from "../../../lib/drilldown";
import {managerScope} from "../../../lib/manager-scope";
import {ManagerListCard,ManagerSectionHead} from "../../components/ManagerUI";

export default async function Page({searchParams}:{searchParams:Promise<{q?:string;month?:string;from?:string;to?:string}>}){
 const u=await requirePagePermission(["MANAGER"],"employees"),s=await searchParams,scope=await managerScope(u.id),q=(s.q||"").toLowerCase(),month=normalizeMonth(s.from?.slice(0,7)||s.month);
 const [rows,sups]=await Promise.all([employeePerformance(`${month}-01`,scope.employeeIds,s.from,s.to),prisma.supervisor.findMany({where:{active:true,id:{in:scope.supervisorIds}},select:{id:true,name:true},orderBy:{name:"asc"}})]);
 const by=new Map<string,{rso:number;ret:number;a:number;t:number;ga:number;gaT:number}>();for(const r of rows){const x=by.get(r.supervisor)||{rso:0,ret:0,a:0,t:0,ga:0,gaT:0};x.rso++;x.ret+=r.retailerCount;x.a+=r.totalRechargeAchieved;x.t+=r.totalRechargeTarget;x.ga+=r.gaAchieved;x.gaT+=r.gaTarget;by.set(r.supervisor,x)}
 const filtered=sups.filter(x=>!q||x.name.toLowerCase().includes(q));
 return <main className="page manager-v5-page manager-v5-directory">
  <section className="manager-v5-subhero"><div><div className="manager-v5-kicker">TEAM STRUCTURE</div><h1>Supervisors</h1><p>Monitor only the supervisors assigned to your Manager account and drill into their RSOs.</p></div><div className="manager-v5-subhero-stat"><span>ASSIGNED TEAMS</span><strong>{sups.length}</strong><small>{rows.length} active RSOs</small></div></section>
  <FilterForm q={s.q||""} month={month} from={s.from} to={s.to} dateRange placeholder="Search supervisor"/>
  <section className="manager-v5-section"><ManagerSectionHead eyebrow="ASSIGNED TEAMS" title={`${filtered.length} supervisors`} sub="Overall progress is based on total recharge target."/><div className="manager-v5-list-grid">
   {filtered.map(sup=>{const x=by.get(sup.name)||{rso:0,ret:0,a:0,t:0,ga:0,gaT:0},progress=pct(x.a,x.t);return <ManagerListCard key={sup.id} href={`/manager/supervisors/${sup.id}?month=${month}${s.from?`&from=${s.from}`:""}${s.to?`&to=${s.to}`:""}`} name={sup.name} meta={`${x.rso} RSOs · ${x.ret.toLocaleString()} retailers`} secondary={`GA ${x.ga}/${x.gaT} · Recharge ৳${Math.round(x.a).toLocaleString()}`} progress={progress} status={progress>=80?"On track":progress>=50?"Watch":"Behind"}/>})}
   {!filtered.length&&<div className="manager-v5-empty">No supervisors match this search.</div>}
  </div></section>
 </main>
}
import Link from "next/link";
import {requirePagePermission} from "../../../../lib/auth";
import {prisma} from "../../../../lib/prisma";
import {employeePerformance,pct} from "../../../../lib/performance";
import {normalizeMonth} from "../../../../lib/drilldown";
import {FilterForm} from "../../../components/DrillUI";
import {notFound} from "next/navigation";
import {managerScope} from "../../../../lib/manager-scope";
import {ManagerMetric,ManagerListCard,ManagerSectionHead} from "../../../components/ManagerUI";

export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{month?:string;q?:string;from?:string;to?:string}>}){
 const u=await requirePagePermission(["MANAGER"],"employees"),{id}=await params,s=await searchParams,scope=await managerScope(u.id);if(!scope.supervisorIds.includes(id))notFound();
 const month=normalizeMonth(s.from?.slice(0,7)||s.month),q=(s.q||"").toLowerCase(),sup=await prisma.supervisor.findUnique({where:{id},select:{id:true,name:true,employees:{where:{active:true},select:{id:true}}}});if(!sup)notFound();
 const all=await employeePerformance(`${month}-01`,sup.employees.map(e=>e.id),s.from,s.to),rows=all.filter(r=>!q||`${r.name} ${r.rsoMsisdn} ${r.employeeCode||""}`.toLowerCase().includes(q));
 const sum=(k:keyof typeof all[number])=>all.reduce((a,r)=>a+Number(r[k]||0),0),retailers=sum("retailerCount");
 return <main className="page manager-v5-page manager-v5-team-detail">
  <section className="manager-v5-subhero"><div><Link href="/manager/supervisors" className="manager-v5-back">‹ Supervisors</Link><div className="manager-v5-kicker">SUPERVISOR TEAM</div><h1>{sup.name}</h1><p>{all.length} RSOs · {retailers.toLocaleString()} retailers under this assigned team.</p></div><div className="manager-v5-subhero-stat"><span>RECHARGE</span><strong>{pct(sum("totalRechargeAchieved"),sum("totalRechargeTarget"))}%</strong><small>team target progress</small></div></section>
  <section className="manager-v5-section"><ManagerSectionHead eyebrow="TEAM EXECUTION" title="Performance summary"/><div className="manager-v5-metrics">
   <ManagerMetric label="GA" value={sum("gaAchieved")} target={sum("gaTarget")} icon="sim"/>
   <ManagerMetric label="C2C" value={sum("c2cAchieved")} target={sum("c2cTarget")} icon="wallet" unit="৳"/>
   <ManagerMetric label="Total Recharge" value={sum("totalRechargeAchieved")} target={sum("totalRechargeTarget")} icon="chart" unit="৳"/>
   <ManagerMetric label="LSO" value={sum("lsoAchieved")} target={sum("lsoTarget")} icon="target"/>
  </div></section>
  <FilterForm q={s.q||""} month={month} from={s.from} to={s.to} dateRange placeholder="Search RSO in this team"/>
  <section className="manager-v5-section"><ManagerSectionHead eyebrow="TEAM MEMBERS" title={`${rows.length} RSOs`} sub="Open an RSO for retailer-level drill-down."/><div className="manager-v5-list-grid">
   {rows.sort((a,b)=>pct(b.totalRechargeAchieved,b.totalRechargeTarget)-pct(a.totalRechargeAchieved,a.totalRechargeTarget)).map(r=>{const progress=pct(r.totalRechargeAchieved,r.totalRechargeTarget);return <ManagerListCard key={r.employeeId} href={`/manager/rsos/${r.employeeId}?month=${month}${s.from?`&from=${s.from}`:""}${s.to?`&to=${s.to}`:""}`} name={r.name} meta={`${r.employeeCode||r.rsoMsisdn} · ${r.retailerCount} retailers`} secondary={`GA ${r.gaAchieved}/${r.gaTarget} · LSO ${r.lsoAchieved}/${r.lsoTarget}`} progress={progress} status={progress>=80?"On track":progress>=50?"Watch":"Behind"}/>})}
  </div></section>
 </main>
}
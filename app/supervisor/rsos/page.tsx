import {requirePagePermission} from "../../../lib/auth";
import {prisma} from "../../../lib/prisma";
import {employeePerformance,pct} from "../../../lib/performance";
import {FilterForm} from "../../components/DrillUI";
import {normalizeMonth} from "../../../lib/drilldown";
import {SupervisorRsoCard,SupervisorSection} from "../../components/SupervisorUI";

export default async function Page({searchParams}:{searchParams:Promise<{q?:string;month?:string;from?:string;to?:string}>}){
 const u=await requirePagePermission(["SUPERVISOR"],"employees"),s=await searchParams,q=(s.q||"").toLowerCase(),month=normalizeMonth(s.from?.slice(0,7)||s.month);
 const e=await prisma.employee.findMany({where:{supervisorId:u.supervisorId||"",active:true},select:{id:true}});
 const all=await employeePerformance(`${month}-01`,e.map(x=>x.id),s.from,s.to),rows=all.filter(r=>!q||`${r.name} ${r.employeeCode||""} ${r.rsoMsisdn}`.toLowerCase().includes(q)).sort((a,b)=>pct(b.totalRechargeAchieved,b.totalRechargeTarget)-pct(a.totalRechargeAchieved,a.totalRechargeTarget));
 const strong=all.filter(r=>pct(r.totalRechargeAchieved,r.totalRechargeTarget)>=80).length;
 return <main className="page supervisor-v6-page supervisor-v6-directory">
  <section className="supervisor-v6-subhero"><div><div className="supervisor-v6-kicker">MY FIELD TEAM</div><h1>My RSOs</h1><p>Compare your assigned RSOs and open any team member for retailer-level follow-up.</p></div><div className="supervisor-v6-substat"><span>ON TRACK</span><strong>{strong}</strong><small>of {all.length} active RSOs</small></div></section>
  <FilterForm q={s.q||""} month={month} from={s.from} to={s.to} dateRange placeholder="Search my team"/>
  <section className="supervisor-v6-section"><SupervisorSection eyebrow="TEAM MEMBERS" title={`${rows.length} RSOs`} sub="Sorted by total recharge progress."/><div className="supervisor-v6-rso-grid">
   {rows.map(r=>{const progress=pct(r.totalRechargeAchieved,r.totalRechargeTarget),status=progress>=80?"On track":progress>=50?"Watch":"Behind";return <SupervisorRsoCard key={r.employeeId} href={`/supervisor/rsos/${r.employeeId}?month=${month}${s.from?`&from=${s.from}`:""}${s.to?`&to=${s.to}`:""}`} name={r.name} meta={`${r.employeeCode||r.rsoMsisdn} · ${r.retailerCount} retailers`} ga={`${r.gaAchieved}/${r.gaTarget}`} lso={`${r.lsoAchieved}/${r.lsoTarget}`} recharge={progress} status={status}/>})}
   {!rows.length&&<div className="supervisor-v6-empty">No RSO matches this search.</div>}
  </div></section>
 </main>
}
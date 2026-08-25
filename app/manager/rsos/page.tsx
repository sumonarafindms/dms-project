import {requirePagePermission} from "../../../lib/auth";
import {employeePerformance,pct} from "../../../lib/performance";
import {FilterForm} from "../../components/DrillUI";
import {normalizeMonth} from "../../../lib/drilldown";
import {managerScope} from "../../../lib/manager-scope";
import {ManagerListCard,ManagerSectionHead} from "../../components/ManagerUI";

export default async function Page({searchParams}:{searchParams:Promise<{q?:string;month?:string;from?:string;to?:string}>}){
 const u=await requirePagePermission(["MANAGER"],"performance"),s=await searchParams,scope=await managerScope(u.id),q=(s.q||"").toLowerCase(),month=normalizeMonth(s.from?.slice(0,7)||s.month);
 const all=await employeePerformance(`${month}-01`,scope.employeeIds,s.from,s.to);
 const rows=all.filter(r=>!q||`${r.name} ${r.employeeCode||""} ${r.rsoMsisdn} ${r.supervisor}`.toLowerCase().includes(q)).sort((a,b)=>pct(b.totalRechargeAchieved,b.totalRechargeTarget)-pct(a.totalRechargeAchieved,a.totalRechargeTarget));
 const onTrack=all.filter(r=>pct(r.totalRechargeAchieved,r.totalRechargeTarget)>=80).length;
 return <main className="page manager-v5-page manager-v5-directory">
  <section className="manager-v5-subhero"><div><div className="manager-v5-kicker">FIELD PERFORMANCE</div><h1>RSO Performance</h1><p>Compare assigned RSOs by target execution and open any employee for retailer-level detail.</p></div><div className="manager-v5-subhero-stat"><span>ON TRACK</span><strong>{onTrack}</strong><small>of {all.length} RSOs</small></div></section>
  <FilterForm q={s.q||""} month={month} from={s.from} to={s.to} dateRange placeholder="RSO, code, mobile or supervisor"/>
  <section className="manager-v5-section"><ManagerSectionHead eyebrow="RANKED BY RECHARGE" title={`${rows.length} RSOs`} sub="Highest target progress appears first."/><div className="manager-v5-list-grid">
   {rows.map(r=>{const progress=pct(r.totalRechargeAchieved,r.totalRechargeTarget);return <ManagerListCard key={r.employeeId} href={`/manager/rsos/${r.employeeId}?month=${month}${s.from?`&from=${s.from}`:""}${s.to?`&to=${s.to}`:""}`} name={r.name} meta={`${r.employeeCode||r.rsoMsisdn} · ${r.supervisor}`} secondary={`${r.retailerCount} retailers · GA ${r.gaAchieved}/${r.gaTarget} · LSO ${r.lsoAchieved}/${r.lsoTarget}`} progress={progress} status={progress>=80?"On track":progress>=50?"Watch":"Behind"}/>})}
   {!rows.length&&<div className="manager-v5-empty">No RSOs match this filter.</div>}
  </div></section>
 </main>
}
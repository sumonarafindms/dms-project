import {requirePagePermission} from "../../../lib/auth";
import {normalizeMonth} from "../../../lib/drilldown";
import {retailerOpportunities} from "../../../lib/retailer-opportunities";
import {RoleAttentionList} from "../../components/RoleAttention";
import {managerScope} from "../../../lib/manager-scope";

export default async function Page({searchParams}:{searchParams:Promise<{month?:string;from?:string;to?:string}>}){
 const u=await requirePagePermission(["MANAGER"],"attention"),s=await searchParams,scope=await managerScope(u.id),month=normalizeMonth(s.from?.slice(0,7)||s.month);
 const all=await retailerOpportunities(month,scope.employeeIds,s.from,s.to),rows=all.filter(x=>x.priority>0).sort((a,b)=>b.priority-a.priority||a.c2s-b.c2s);
 const high=rows.filter(x=>x.priority>=3).length,sso=all.filter(x=>x.simSeller&&!x.ssoComplete).length,lso=all.filter(x=>!x.lsoComplete).length;
 const end=s.to||new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).toISOString().slice(0,10);
 return <main className="page manager-v5-page manager-attention-v5">
  <section className="manager-v5-subhero attention"><div><div className="manager-v5-kicker">EXECUTION PRIORITIES</div><h1>Attention Center</h1><p>Focus only on execution gaps inside your assigned Supervisor and RSO teams.</p></div><div className="manager-v5-subhero-stat"><span>HIGH PRIORITY</span><strong>{high}</strong><small>of {rows.length} flagged retailers</small></div></section>
  <form className="manager-v5-date-filter"><label><span>FROM</span><input type="date" name="from" defaultValue={s.from||`${month}-01`}/></label><i>→</i><label><span>TO</span><input type="date" name="to" defaultValue={end}/></label><button className="btn manager-v5-primary">Apply range</button></form>
  <div className="manager-v5-attention-summary"><div><span>SSO PENDING</span><strong>{sso}</strong><small>SIM seller execution</small></div><div><span>LSO PENDING</span><strong>{lso}</strong><small>Retail sales execution</small></div><div><span>FLAGGED</span><strong>{rows.length}</strong><small>Need field follow-up</small></div></div>
  <div className="manager-v5-rule-note"><b>Monthly rule:</b><span>SSO requires 2+ GA for SIM sellers. LSO requires ৳500+ C2S and 7+ source transactions in a single month.</span></div>
  <section className="manager-v5-section"><div className="manager-v5-section-head"><div><span>PRIORITY QUEUE</span><h2>Retailers needing action</h2><p>Highest priority appears first.</p></div></div><div className="manager-v5-attention-list"><RoleAttentionList rows={rows} base="/manager/retailers" query={`?month=${month}${s.from?`&from=${s.from}`:""}${s.to?`&to=${s.to}`:""}`}/></div></section>
 </main>
}
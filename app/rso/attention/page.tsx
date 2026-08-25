import {requirePagePermission} from "../../../lib/auth";
import {normalizeMonth} from "../../../lib/drilldown";
import {retailerOpportunities} from "../../../lib/retailer-opportunities";
import {RoleAttentionList} from "../../components/RoleAttention";
import {RsoSection} from "../../components/RsoUI";

export default async function Page({searchParams}:{searchParams:Promise<{month?:string;from?:string;to?:string}>}){
 const u=await requirePagePermission(["RSO"],"attention"),s=await searchParams,month=normalizeMonth(s.from?.slice(0,7)||s.month);
 const all=u.employeeId?await retailerOpportunities(month,[u.employeeId],s.from,s.to):[],rows=all.filter(x=>x.priority>0).sort((a,b)=>b.priority-a.priority||a.c2s-b.c2s);
 const high=rows.filter(x=>x.priority>=3).length,sso=all.filter(x=>x.simSeller&&!x.ssoComplete).length,lso=all.filter(x=>!x.lsoComplete).length;
 const end=s.to||new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).toISOString().slice(0,10);
 return <main className="page rso-v7-page rso-attention-v7">
  <section className="rso-v7-subhero attention"><div><div className="rso-v7-kicker">MY FIELD PRIORITIES</div><h1>Retailer Focus</h1><p>Open the outlets where a quick visit can move SSO or LSO closer to completion.</p></div><div className="rso-v7-substat"><span>HIGH PRIORITY</span><strong>{high}</strong><small>{rows.length} total flagged</small></div></section>
  <form className="rso-v7-date-filter"><label><span>FROM</span><input type="date" name="from" defaultValue={s.from||`${month}-01`}/></label><i>→</i><label><span>TO</span><input type="date" name="to" defaultValue={end}/></label><button className="btn rso-v7-primary">Apply</button></form>
  <div className="rso-v7-attention-summary"><div><span>SSO PENDING</span><strong>{sso}</strong><small>SIM seller visits</small></div><div><span>LSO PENDING</span><strong>{lso}</strong><small>Sales follow-up</small></div><div><span>FLAGGED</span><strong>{rows.length}</strong><small>Outlet actions</small></div></div>
  <div className="rso-v7-note"><b>Visit tip</b><span>Use each card's reason to decide whether the retailer needs GA activity, C2S amount or more source transactions.</span></div>
  <section className="rso-v7-section"><RsoSection eyebrow="PRIORITY QUEUE" title="Visit these retailers first" sub="Highest priority appears first."/><RoleAttentionList rows={rows} base="/rso/retailers" query={`?month=${month}${s.from?`&from=${s.from}`:""}${s.to?`&to=${s.to}`:""}`}/></section>
 </main>
}
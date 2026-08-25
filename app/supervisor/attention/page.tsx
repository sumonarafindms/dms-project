import {requirePagePermission} from "../../../lib/auth";
import {normalizeMonth} from "../../../lib/drilldown";
import {retailerOpportunities} from "../../../lib/retailer-opportunities";
import {RoleAttentionList} from "../../components/RoleAttention";
import {prisma} from "../../../lib/prisma";

export default async function Page({searchParams}:{searchParams:Promise<{month?:string;from?:string;to?:string}>}){
 const u=await requirePagePermission(["SUPERVISOR"],"attention"),s=await searchParams,month=normalizeMonth(s.from?.slice(0,7)||s.month);
 const ids=u.supervisorId?(await prisma.employee.findMany({where:{supervisorId:u.supervisorId,active:true},select:{id:true}})).map(x=>x.id):[];
 const all=await retailerOpportunities(month,ids,s.from,s.to),rows=all.filter(x=>x.priority>0).sort((a,b)=>b.priority-a.priority||a.c2s-b.c2s);
 const high=rows.filter(x=>x.priority>=3).length,sso=all.filter(x=>x.simSeller&&!x.ssoComplete).length,lso=all.filter(x=>!x.lsoComplete).length;
 const end=s.to||new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).toISOString().slice(0,10);
 return <main className="page supervisor-v6-page supervisor-attention-v6">
  <section className="supervisor-v6-subhero attention"><div><div className="supervisor-v6-kicker">FIELD FOLLOW-UP</div><h1>Team Attention</h1><p>Prioritize retailer gaps inside only the RSO team under your supervision.</p></div><div className="supervisor-v6-substat"><span>HIGH PRIORITY</span><strong>{high}</strong><small>{rows.length} total flagged</small></div></section>
  <form className="supervisor-v6-date-filter"><label><span>FROM</span><input type="date" name="from" defaultValue={s.from||`${month}-01`}/></label><i>→</i><label><span>TO</span><input type="date" name="to" defaultValue={end}/></label><button className="btn supervisor-v6-primary">Apply</button></form>
  <div className="supervisor-v6-attention-summary"><div><span>SSO PENDING</span><strong>{sso}</strong><small>SIM follow-up</small></div><div><span>LSO PENDING</span><strong>{lso}</strong><small>Sales follow-up</small></div><div><span>FLAGGED</span><strong>{rows.length}</strong><small>Retailer actions</small></div></div>
  <div className="supervisor-v6-note"><b>Field rule</b><span>SSO and LSO are evaluated month-by-month. Use the reasons on each retailer card to guide RSO follow-up.</span></div>
  <section className="supervisor-v6-section"><div className="supervisor-v6-section-head"><div><span>PRIORITY QUEUE</span><h2>Retailers needing action</h2></div></div><RoleAttentionList rows={rows} base="/supervisor/retailers" query={`?month=${month}${s.from?`&from=${s.from}`:""}${s.to?`&to=${s.to}`:""}`}/></section>
 </main>
}
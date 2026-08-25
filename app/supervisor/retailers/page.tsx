import {requirePagePermission} from "../../../lib/auth";
import {prisma} from "../../../lib/prisma";
import {normalizeMonth} from "../../../lib/drilldown";
import {retailerOpportunities} from "../../../lib/retailer-opportunities";
import {RetailerSearchView} from "../../components/RetailerOpportunityViews";
import {SupervisorSection} from "../../components/SupervisorUI";

export default async function Page({searchParams}:{searchParams:Promise<{q?:string;month?:string;from?:string;to?:string}>}){
 const u=await requirePagePermission(["SUPERVISOR"],"retailers"),s=await searchParams,month=normalizeMonth(s.from?.slice(0,7)||s.month);
 const ids=u.supervisorId?(await prisma.employee.findMany({where:{supervisorId:u.supervisorId,active:true},select:{id:true}})).map(x=>x.id):[];
 const rows=await retailerOpportunities(month,ids,s.from,s.to),sim=rows.filter(x=>x.simSeller).length,flagged=rows.filter(x=>x.priority>0).length;
 return <main className="page supervisor-v6-page supervisor-retailers-v6">
  <section className="supervisor-v6-subhero retailers"><div><div className="supervisor-v6-kicker">OUTLET NETWORK</div><h1>My Retailers</h1><p>Search every active retailer under your RSO team and review execution status from one mobile-friendly list.</p></div><div className="supervisor-v6-substat"><span>RETAILERS</span><strong>{rows.length}</strong><small>{sim} SIM sellers · {flagged} flagged</small></div></section>
  <section className="supervisor-v6-section"><SupervisorSection eyebrow="RETAILER DIRECTORY" title="Search & review" sub="GA, C2S, SSO and LSO status are shown for the selected dates."/><RetailerSearchView rows={rows} month={month} q={s.q||""} from={s.from} to={s.to} base="/supervisor/retailers"/></section>
 </main>
}
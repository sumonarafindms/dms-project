import {requirePagePermission} from "../../../lib/auth";
import {normalizeMonth} from "../../../lib/drilldown";
import {retailerOpportunities} from "../../../lib/retailer-opportunities";
import {RetailerSearchView} from "../../components/RetailerOpportunityViews";
import {AccountsSection} from "../../components/AccountsUI";

export default async function Page({searchParams}:{searchParams:Promise<{q?:string;month?:string;from?:string;to?:string}>}){
 await requirePagePermission(["ACCOUNTS"],"retailers");const s=await searchParams,month=normalizeMonth(s.from?.slice(0,7)||s.month),rows=await retailerOpportunities(month,undefined,s.from,s.to);
 const sim=rows.filter(x=>x.simSeller).length,flagged=rows.filter(x=>x.priority>0).length;
 return <main className="page accounts-v12-page accounts-retailers-v12">
  <section className="accounts-v12-subhero retailers"><div><div className="accounts-v12-kicker">MASTER LOOKUP</div><h1>Retailer Search</h1><p>Find any active retailer and validate ownership, GA, C2C, C2S, SSO and LSO information.</p></div><div className="accounts-v12-substat"><span>ACTIVE RETAILERS</span><strong>{rows.length}</strong><small>{sim} SIM sellers · {flagged} flagged</small></div></section>
  <section className="accounts-v12-section"><AccountsSection eyebrow="LIVE RETAILER DATA" title="Search & review" sub="Use date range and retailer information to validate field records."/><RetailerSearchView rows={rows} month={month} q={s.q||""} from={s.from} to={s.to} base="/accounts/retailers"/></section>
 </main>
}
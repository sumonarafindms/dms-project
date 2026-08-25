import {requirePagePermission} from "../../../lib/auth";
import {normalizeMonth} from "../../../lib/drilldown";
import {retailerOpportunities} from "../../../lib/retailer-opportunities";
import {AttentionSummary,RetailerSearchView} from "../../components/RetailerOpportunityViews";
import {AccountsSection} from "../../components/AccountsUI";

export default async function Page({searchParams}:{searchParams:Promise<{q?:string;month?:string;from?:string;to?:string}>}){
 await requirePagePermission(["ACCOUNTS"],"attention");const s=await searchParams,month=normalizeMonth(s.from?.slice(0,7)||s.month),all=await retailerOpportunities(month,undefined,s.from,s.to),rows=[...all].sort((a,b)=>b.priority-a.priority||a.c2s-b.c2s);
 const high=rows.filter(x=>x.priority>=3).length,flagged=rows.filter(x=>x.priority>0).length;
 return <main className="page accounts-v12-page accounts-attention-v12">
  <section className="accounts-v12-subhero attention"><div><div className="accounts-v12-kicker">DATA-DRIVEN OPPORTUNITY</div><h1>Retailer Opportunity</h1><p>Use live execution data to identify outlets where SSO or LSO still needs attention.</p></div><div className="accounts-v12-substat"><span>NEEDS REVIEW</span><strong>{flagged}</strong><small>{high} high priority</small></div></section>
  <div className="accounts-v12-rule"><b>Read-only insight</b><span>This page creates no extra records. Opportunity is calculated from the live transaction data.</span></div>
  <section className="accounts-v12-section"><AccountsSection eyebrow="EXECUTION GAPS" title="Opportunity summary"/><AttentionSummary rows={all}/></section>
  <section className="accounts-v12-section"><AccountsSection eyebrow="PRIORITY RETAILERS" title="Search & inspect" sub="Highest execution gaps appear first."/><RetailerSearchView rows={rows} month={month} q={s.q||""} from={s.from} to={s.to} base="/accounts/retailers" attentionOnly/></section>
 </main>
}
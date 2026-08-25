import {requireUser} from "../../../lib/auth";
import {normalizeMonth} from "../../../lib/drilldown";
import {retailerOpportunities} from "../../../lib/retailer-opportunities";

import {AttentionSummary,RetailerSearchView} from "../../components/RetailerOpportunityViews";
export default async function Page({searchParams}:{searchParams:Promise<{q?:string;month?:string;from?:string;to?:string}>}){
 await requireUser(["ADMIN","IT"]);const s=await searchParams,month=normalizeMonth(s.from?.slice(0,7)||s.month),all=await retailerOpportunities(month,undefined,s.from,s.to),rows=[...all].sort((a,b)=>b.priority-a.priority||a.c2s-b.c2s);
 const flagged=all.filter(x=>x.reasons.length).length,high=all.filter(x=>x.priority>=3&&x.reasons.length).length;
 return <main className="page attention-v4-page"><section className="attention-v4-hero"><div><div className="admin-kicker">EXECUTION CONTROL</div><h1>Attention Center</h1><p>Prioritize retailers with unfinished SSO/LSO execution and open the highest-impact gaps first.</p><div className="attention-v4-chips"><span>Month-by-month rules</span><span>Date-range aware</span><span>Priority sorted</span></div></div><div className="attention-v4-score"><span>NEEDS ACTION</span><strong>{flagged}</strong><small>{high} high-priority retailers</small></div></section><div className="attention-v4-note"><b>How this works</b><span>SSO and LSO completion are calculated month-by-month, even when the selected range spans multiple months.</span></div><AttentionSummary rows={all}/><RetailerSearchView rows={rows} month={month} q={s.q||""} from={s.from} to={s.to} base="/admin/retailers" attentionOnly/></main>
}
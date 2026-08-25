import {requirePagePermission} from "../../../lib/auth";
import {normalizeMonth} from "../../../lib/drilldown";
import {retailerOpportunities} from "../../../lib/retailer-opportunities";
import {RetailerSearchView} from "../../components/RetailerOpportunityViews";
import {RsoSection} from "../../components/RsoUI";

export default async function Page({searchParams}:{searchParams:Promise<{q?:string;month?:string;from?:string;to?:string}>}){
 const u=await requirePagePermission(["RSO"],"retailers"),s=await searchParams,month=normalizeMonth(s.from?.slice(0,7)||s.month);
 const rows=u.employeeId?await retailerOpportunities(month,[u.employeeId],s.from,s.to):[],sim=rows.filter(x=>x.simSeller).length,flagged=rows.filter(x=>x.priority>0).length;
 return <main className="page rso-v7-page rso-retailers-v7">
  <section className="rso-v7-subhero retailers"><div><div className="rso-v7-kicker">MY OUTLETS</div><h1>My Retailers</h1><p>Search your own outlet base and see GA, C2S, SSO and LSO status without opening every retailer.</p></div><div className="rso-v7-substat"><span>ASSIGNED</span><strong>{rows.length}</strong><small>{sim} SIM sellers · {flagged} need focus</small></div></section>
  <section className="rso-v7-section"><RsoSection eyebrow="RETAILER DIRECTORY" title="Search & review" sub="Tap any retailer for full sales and activity detail."/><RetailerSearchView rows={rows} month={month} q={s.q||""} from={s.from} to={s.to} base="/rso/retailers"/></section>
 </main>
}
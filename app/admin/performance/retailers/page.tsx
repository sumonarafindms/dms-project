import {requireUser} from "../../../../lib/auth";
import {normalizeMonth} from "../../../../lib/drilldown";
import {retailerOpportunities} from "../../../../lib/retailer-opportunities";
import {PerfHead,PerfSummary} from "../../../components/AdminPerformanceUI";
import {RetailerSearchView} from "../../../components/RetailerOpportunityViews";
export default async function Page({searchParams}:{searchParams:Promise<{q?:string;month?:string;from?:string;to?:string}>}){
 await requireUser(["ADMIN","IT"]);const s=await searchParams,month=normalizeMonth(s.from?.slice(0,7)||s.month),rows=await retailerOpportunities(month,undefined,s.from,s.to),q=(s.q||"").toLowerCase(),filtered=rows.filter((x:any)=>!q||JSON.stringify(x).toLowerCase().includes(q));
 return <main className="page admin-performance"><PerfHead title="Retailer Performance" subtitle="Search and drill into the full retailer base, sales execution and opportunity status." month={month} q={s.q||""} from={s.from} to={s.to} placeholder="Retailer code, name, RSO or route"/><PerfSummary items={[{label:"Retailers",value:filtered.length,sub:"Matching outlets"},{label:"Needs attention",value:filtered.filter((x:any)=>x.priority>0).length,sub:"Execution opportunity"},{label:"SSO Ready",value:filtered.filter((x:any)=>x.ssoComplete).length,sub:"Monthly SSO rule met"},{label:"LSO Ready",value:filtered.filter((x:any)=>x.lsoComplete).length,sub:"Monthly LSO rule met"}]}/><RetailerSearchView rows={filtered} month={month} q="" from={s.from} to={s.to} base="/admin/retailers"/></main>
}

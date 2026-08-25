import {requireUser} from "../../../../lib/auth";
import {normalizeMonth} from "../../../../lib/drilldown";
import {retailerOpportunities} from "../../../../lib/retailer-opportunities";
import {PerfHead,PerfSummary} from "../../../components/AdminPerformanceUI";
import {RetailerSearchView} from "../../../components/RetailerOpportunityViews";
export default async function Page({searchParams}:{searchParams:Promise<{q?:string;month?:string}>}){
 await requireUser(["ADMIN"]);const s=await searchParams,month=normalizeMonth(s.month),rows=await retailerOpportunities(month),q=(s.q||"").toLowerCase(),filtered=rows.filter((x:any)=>!q||JSON.stringify(x).toLowerCase().includes(q));
 return <main className="page admin-performance"><PerfHead title="Retailer Performance" subtitle="Search and drill into the full retailer base, sales execution and opportunity status." month={month} q={s.q||""} placeholder="Retailer code, name, RSO or route"/><PerfSummary items={[{label:"Retailers",value:filtered.length,sub:"Matching outlets"},{label:"Needs attention",value:filtered.filter((x:any)=>x.priority>0).length,sub:"Execution opportunity"},{label:"SSO Ready",value:filtered.filter((x:any)=>x.ga>=2).length,sub:"2+ GA this month"},{label:"LSO Ready",value:filtered.filter((x:any)=>x.c2s>=500&&x.c2sTransactions>=7).length,sub:"Sales threshold met"}]}/><RetailerSearchView rows={filtered} month={month} q="" base="/admin/retailers"/></main>
}

import {requireUser} from "../../../lib/auth";
import {normalizeMonth} from "../../../lib/drilldown";
import {retailerOpportunities} from "../../../lib/retailer-opportunities";
import {PageHead} from "../../components/RoleUI";
import {RetailerSearchView} from "../../components/RetailerOpportunityViews";
export default async function Page({searchParams}:{searchParams:Promise<{q?:string;month?:string;from?:string;to?:string}>}){
 await requireUser(["ADMIN"]);const s=await searchParams,month=normalizeMonth(s.from?.slice(0,7)||s.month),rows=await retailerOpportunities(month,undefined,s.from,s.to);
 return <main className="page"><PageHead eyebrow="Admin" title="Retailer search" subtitle="Search the full retailer base and review exact-date performance."/><RetailerSearchView rows={rows} month={month} q={s.q||""} from={s.from} to={s.to} base="/admin/retailers"/></main>
}
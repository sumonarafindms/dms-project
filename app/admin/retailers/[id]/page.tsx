import {requireUser} from "../../../../lib/auth";
import {retailerMonthDetail,normalizeMonth} from "../../../../lib/drilldown";
import {RetailerDetailView} from "../../../components/DetailViews";
import {notFound} from "next/navigation";
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{month?:string;from?:string;to?:string}>}){
 await requireUser(["ADMIN"]);const {id}=await params,s=await searchParams,month=normalizeMonth(s.from?.slice(0,7)||s.month),d=await retailerMonthDetail(id,month,s.from,s.to);if(!d)notFound();
 return <RetailerDetailView d={d} month={month} backHref={d.retailer.employeeId?`/admin/rsos/${d.retailer.employeeId}?month=${month}${s.from?`&from=${s.from}`:""}${s.to?`&to=${s.to}`:""}`:"/dashboard"}/>
}
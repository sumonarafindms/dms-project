import {requirePagePermission} from "../../../../lib/auth";
import {retailerMonthDetail,normalizeMonth} from "../../../../lib/drilldown";
import {RetailerDetailView} from "../../../components/DetailViews";
import {notFound} from "next/navigation";
import {managerScope} from "../../../../lib/manager-scope";
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{month?:string;from?:string;to?:string}>}){
 const u=await requirePagePermission(["MANAGER"],"retailers"),scope=await managerScope(u.id),{id}=await params,s=await searchParams,month=normalizeMonth(s.from?.slice(0,7)||s.month),d=await retailerMonthDetail(id,month,s.from,s.to);
 if(!d||!d.retailer.employeeId||!scope.employeeIds.includes(d.retailer.employeeId))notFound();
 return <RetailerDetailView d={d} month={month} backHref={`/manager/rsos/${d.retailer.employeeId}?month=${month}${s.from?`&from=${s.from}`:""}${s.to?`&to=${s.to}`:""}`}/>
}
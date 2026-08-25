import {requireUser} from "../../../../lib/auth";
import {employeeDetail} from "../../../../lib/employee-detail";
import {normalizeMonth} from "../../../../lib/drilldown";
import {EmployeeDetailView} from "../../../components/EmployeeDetailView";
import {notFound} from "next/navigation";
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{month?:string;q?:string;from?:string;to?:string}>}){
 await requireUser(["ADMIN","IT"]);const {id}=await params,s=await searchParams,month=normalizeMonth(s.from?.slice(0,7)||s.month),d=await employeeDetail(id,month,s.from,s.to);if(!d)notFound();
 return <EmployeeDetailView d={d} month={month} q={s.q||""} from={s.from} to={s.to} basePath="/admin" backHref="/admin/performance/rsos"/>
}
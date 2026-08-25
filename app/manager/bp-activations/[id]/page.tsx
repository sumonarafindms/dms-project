import {requirePagePermission} from "../../../../lib/auth";
import {BpActivationDetailView} from "../../../components/BpActivationViews";
import {managerScope} from "../../../../lib/manager-scope";
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{month?:string;q?:string;from?:string;to?:string}>}){
 const u=await requirePagePermission(["MANAGER"],"bp"),scope=await managerScope(u.id),p=await params,s=await searchParams;
 return <BpActivationDetailView user={{...u,managerSupervisorIds:scope.supervisorIds}} id={p.id} backHref="/manager/bp-activations" month={s.month} q={s.q} from={s.from} to={s.to} eyebrow="Manager · BP"/>
}
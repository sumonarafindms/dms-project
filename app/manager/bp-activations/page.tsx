import {requirePagePermission} from "../../../lib/auth";
import {BpActivationListView} from "../../components/BpActivationViews";
import {managerScope} from "../../../lib/manager-scope";
export default async function Page({searchParams}:{searchParams:Promise<{month?:string;q?:string;from?:string;to?:string}>}){
 const u=await requirePagePermission(["MANAGER"],"bp"),s=await searchParams,scope=await managerScope(u.id);
 return <BpActivationListView user={{...u,managerSupervisorIds:scope.supervisorIds}} basePath="/manager/bp-activations" month={s.month} q={s.q} from={s.from} to={s.to} eyebrow="Manager"/>
}
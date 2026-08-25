import {requireUser} from "../../../../lib/auth";
import {BpActivationDetailView} from "../../../components/BpActivationViews";
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{month?:string;q?:string}>}){const u=await requireUser(["MANAGER"]),p=await params,s=await searchParams;return <BpActivationDetailView user={u} id={p.id} backHref="/manager/bp-activations" month={s.month} q={s.q} eyebrow="Manager · BP"/>}

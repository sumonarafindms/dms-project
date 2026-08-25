import {requireUser} from "../../../../../lib/auth";
import {BpActivationDetailView} from "../../../../components/BpActivationViews";
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{month?:string;q?:string}>}){const u=await requireUser(["RSO"]),p=await params,s=await searchParams;return <BpActivationDetailView user={u} id={p.id} backHref="/rso/bp/activations" month={s.month} q={s.q} eyebrow="RSO · BP"/>}

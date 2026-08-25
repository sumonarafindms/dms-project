import {requireUser} from "../../../lib/auth";
import {BpActivationListView} from "../../components/BpActivationViews";
export default async function Page({searchParams}:{searchParams:Promise<{month?:string;q?:string}>}){const u=await requireUser(["MANAGER"]),s=await searchParams;return <BpActivationListView user={u} basePath="/manager/bp-activations" month={s.month} q={s.q} eyebrow="Manager"/>}

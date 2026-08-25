import {requirePagePermission} from "../../../../lib/auth";
import {BpActivationListView} from "../../../components/BpActivationViews";
export default async function Page({searchParams}:{searchParams:Promise<{month?:string;q?:string;from?:string;to?:string}>}){const u=await requirePagePermission(["RSO"],"bp"),s=await searchParams;return <BpActivationListView user={u} basePath="/rso/bp/activations" month={s.month} q={s.q} from={s.from} to={s.to} eyebrow="RSO · My BP"/>}

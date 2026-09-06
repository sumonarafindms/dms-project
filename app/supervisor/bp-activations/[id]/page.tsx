import { requirePagePermission } from "../../../../lib/auth";
import { BpActivationDetailView } from "../../../components/BpActivationViews";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string; from?: string; to?: string }>;
}) {
  const u = await requirePagePermission(["SUPERVISOR"], "bp"),
    p = await params,
    s = await searchParams;
  return (
    <BpActivationDetailView
      user={u}
      id={p.id}
      backHref="/supervisor/bp-activations"
      month={s.month}
      from={s.from}
      to={s.to}
    />
  );
}

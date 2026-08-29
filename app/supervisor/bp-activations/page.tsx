import { requirePagePermission } from "../../../lib/auth";
import { BpActivationListView } from "../../components/BpActivationViews";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; q?: string; from?: string; to?: string; sort?: string }>;
}) {
  const u = await requirePagePermission(["SUPERVISOR"], "bp"),
    s = await searchParams;
  return (
    <BpActivationListView
      user={u}
      basePath="/supervisor/bp-activations"
      month={s.month}
      q={s.q}
      from={s.from}
      to={s.to}
      sort={s.sort}
      eyebrow="Supervisor"
    />
  );
}

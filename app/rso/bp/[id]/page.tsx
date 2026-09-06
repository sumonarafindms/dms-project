import { requirePagePermission } from "../../../../lib/auth";
import { BpActivationDetailView } from "../../../components/BpActivationViews";

/**
 * One Business Partner's record: how many, and on which days.
 *
 * Reached by tapping a BP on /rso/bp, which is now the RSO's only BP menu.
 * It used to live at /rso/bp/activations/[id], behind a second menu entry that
 * listed the same partners over again.
 *
 * The view is shared with the supervisor, manager and admin routes — only
 * `backHref` differs — so the date-by-date "Daily GA" breakdown the owner asked
 * for is the same one every role already reads.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string; from?: string; to?: string }>;
}) {
  const u = await requirePagePermission(["RSO"], "bp"),
    p = await params,
    s = await searchParams;
  return <BpActivationDetailView user={u} id={p.id} backHref="/rso/bp" month={s.month} from={s.from} to={s.to} />;
}

import { redirect } from "next/navigation";
import { requirePagePermission } from "../../../lib/auth";

/**
 * /admin/performance is an entry point, not a page: it forwards to the RSO
 * view. The query string goes with it.
 *
 * It used to redirect to a bare "/admin/performance/rsos", so arriving here
 * with ?month=2026-08 (from a bookmark, a shared link, or any "back to
 * Performance" link built from the current URL) silently landed on the current
 * month instead. The period a link carries is the whole reason the link was
 * shared.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePagePermission(["ADMIN", "IT"], "performance");
  const s = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(s)) {
    if (typeof v === "string") q.set(k, v);
    else if (Array.isArray(v) && v[0] !== undefined) q.set(k, v[0]);
  }
  redirect(`/admin/performance/rsos${q.size ? `?${q}` : ""}`);
}

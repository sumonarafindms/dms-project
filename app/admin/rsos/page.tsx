import { redirect } from "next/navigation";
import { requirePagePermission } from "../../../lib/auth";

/**
 * `/admin/rsos` is an entry point, not a page.
 *
 * The RSO DETAIL lives at `/admin/rsos/[id]` and the RSO LIST at
 * `/admin/performance/rsos` — an asymmetry nobody chose, and one the v183
 * navigation map flagged as the most likely place a future "back to the list"
 * link would break. Nothing links to the bare path today, but the detail page
 * beneath it is linked from four screens, so anyone who trims the id off the
 * address bar, or writes `/admin/rsos` from memory, got a 404 from a path that
 * plainly names a real thing.
 *
 * The same shape as `/admin/performance/page.tsx`, including carrying the
 * query string: the period a link holds is the whole reason it was shared.
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

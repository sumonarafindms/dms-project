import { requirePagePermission } from "../../../lib/auth";
import { normalizeMonth } from "../../../lib/drilldown";
import { retailerOpportunities } from "../../../lib/retailer-opportunities";
import { RoleAttentionView } from "../../components/RoleAttention";

/**
 * The RSO's own worklist.
 *
 * Everything below the scope query is shared with the supervisor and manager
 * attention centres — see RoleAttentionView. This page's whole job is deciding
 * WHICH retailers are in scope and how the screen is worded.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; from?: string; to?: string; q?: string; sort?: string; page?: string }>;
}) {
  const u = await requirePagePermission(["RSO"], "attention"),
    s = await searchParams,
    month = normalizeMonth(s.from?.slice(0, 7) || s.month);
  const all = u.employeeId ? await retailerOpportunities(month, [u.employeeId], s.from, s.to) : [];

  return (
    <RoleAttentionView
      all={all}
      base="/rso/retailers"
      month={month}
      from={s.from}
      to={s.to}
      q={s.q}
      sort={s.sort}
      page={s.page}
      title="Retailer Focus"
      subtitle="Outlets where a visit can move SSO or LSO closer to completion."
      sectionSub="Highest priority first. Search or reorder to plan a route."
    />
  );
}

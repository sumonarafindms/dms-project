import { requirePagePermission } from "../../../lib/auth";
import { normalizeMonth } from "../../../lib/drilldown";
import { retailerOpportunities } from "../../../lib/retailer-opportunities";
import { RoleAttentionView } from "../../components/RoleAttention";
import { PageNotice } from "../../components/Kit";

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
  /*
   * An unmapped login used to fall through to the list with an empty array,
   * which rendered a green "No attention items — execution rules are complete
   * for this scope". The scope was the empty set. It is a mapping problem, and
   * it is now said out loud rather than congratulated.
   */
  if (!u.employeeId)
    return (
      <PageNotice
        title="Account not mapped"
        subtitle="Ask Admin to link this login to an RSO employee record."
        hint="Until then this page has no retailers to show you — that is not the same as having no work outstanding."
      />
    );
  const all = await retailerOpportunities(month, [u.employeeId], s.from, s.to);

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
      emptyScope={{
        title: "No retailers assigned",
        hint: "Nothing is mapped to you for this period, so there is nothing to compare against the rules. Ask Admin to check your retailer mapping.",
      }}
    />
  );
}

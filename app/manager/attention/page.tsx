import { requirePagePermission } from "../../../lib/auth";
import { normalizeMonth } from "../../../lib/drilldown";
import { retailerOpportunities } from "../../../lib/retailer-opportunities";
import { RoleAttentionView } from "../../components/RoleAttention";
import { managerScope } from "../../../lib/manager-scope";

/**
 * The manager's attention centre.
 *
 * Scope is every RSO under their assigned supervisors — the widest of the
 * three, and the one that most needed paging. The page below it is shared with
 * the RSO and supervisor centres. See RoleAttentionView.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; from?: string; to?: string; q?: string; sort?: string; page?: string }>;
}) {
  const u = await requirePagePermission(["MANAGER"], "attention"),
    s = await searchParams,
    scope = await managerScope(u.id),
    month = normalizeMonth(s.from?.slice(0, 7) || s.month);
  const all = await retailerOpportunities(month, scope.employeeIds, s.from, s.to);

  return (
    <RoleAttentionView
      all={all}
      base="/manager/retailers"
      month={month}
      from={s.from}
      to={s.to}
      q={s.q}
      sort={s.sort}
      page={s.page}
      title="Attention Center"
      subtitle="Execution gaps inside your assigned Supervisor and RSO teams only."
      sectionSub="SSO needs 2+ GA for SIM sellers; LSO needs ৳500+ C2S and 7+ transactions in one month."
    />
  );
}

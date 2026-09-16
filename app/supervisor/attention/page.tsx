import { requirePagePermission } from "../../../lib/auth";
import { normalizeMonth } from "../../../lib/drilldown";
import { retailerOpportunities } from "../../../lib/retailer-opportunities";
import { RoleAttentionView } from "../../components/RoleAttention";
import { PageNotice } from "../../components/Kit";
import { prisma } from "../../../lib/prisma";

/**
 * The supervisor's team worklist.
 *
 * Scope is their own RSOs; the page below it is shared with the RSO and
 * manager attention centres. See RoleAttentionView.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; from?: string; to?: string; q?: string; sort?: string; page?: string }>;
}) {
  const u = await requirePagePermission(["SUPERVISOR"], "attention"),
    s = await searchParams,
    month = normalizeMonth(s.from?.slice(0, 7) || s.month);
  const ids = u.supervisorId
    ? (
        await prisma.employee.findMany({ where: { supervisorId: u.supervisorId, active: true }, select: { id: true } })
      ).map((x) => x.id)
    : [];
  // Same reasoning as /rso/attention: an empty scope is not an all-clear.
  if (!u.supervisorId)
    return (
      <PageNotice
        title="Account not mapped"
        subtitle="Ask Admin to link this login to a supervisor record."
        hint="Until then this page has no team to show you — that is not the same as having no work outstanding."
      />
    );
  const all = await retailerOpportunities(month, ids, s.from, s.to);

  return (
    <RoleAttentionView
      all={all}
      base="/supervisor/retailers"
      month={month}
      from={s.from}
      to={s.to}
      q={s.q}
      sort={s.sort}
      page={s.page}
      title="Team Attention"
      subtitle="Retailer gaps inside your own RSO team only."
      sectionSub="SSO and LSO are evaluated month by month; each row names the gap."
      emptyScope={
        ids.length
          ? {
              title: "No retailers in your team",
              hint: "Your RSOs have no retailers mapped to them for this period, so there is nothing to compare against the rules.",
            }
          : {
              title: "No RSOs in your team",
              hint: "No active RSO is assigned to you, so this page has nothing in scope. Ask Admin to assign your team.",
            }
      }
    />
  );
}

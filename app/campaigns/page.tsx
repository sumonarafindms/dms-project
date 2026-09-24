/**
 * Campaigns — the list, for every role.
 *
 * One route rather than one per role. The writers (Admin, IT, Manager) get a
 * "New campaign" button and the others do not; everybody sees the same cards,
 * because a campaign's headline figure is the distribution's figure whoever is
 * looking at it. What differs is the DETAIL page, where each level sees its own
 * slice.
 */

import { requirePagePermission } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { dhakaTodayYmd } from "../../lib/business-time";
import { campaignRuleOrder } from "../../lib/campaign-list";
import { campaignLineFor, campaignOutletLine, campaignReport } from "../../lib/campaign-data";
import { viewerScope, scopeFilter } from "../../lib/feature-scope";
import { Card, EmptyState, PageHeader, SectionHead, LinkBtn } from "../components/Kit";
import { Icon } from "../components/icons";
import { CampaignCard } from "../components/CampaignViews";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const user = await requirePagePermission(["ADMIN", "IT", "MANAGER", "SUPERVISOR", "RSO", "BP"], "campaigns");
  const scope = await viewerScope(user);
  const today = dhakaTodayYmd();

  const rows = await prisma.campaign.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      scope: true,
      totalTarget: true,
      perEmployeeTarget: true,
      active: true,
      targets: { select: { employeeId: true, target: true } },
    },
    orderBy: [{ startDate: "desc" }],
  });

  /*
   * Every campaign's figures, in parallel.
   *
   * Each report is its own set of queries, so this is N campaigns' worth of
   * work on one page. It is bounded by how many campaigns are ACTIVE, which is
   * a handful — and the alternative, a single query that groups by campaign,
   * cannot apply the BP ledger, which is day-by-day and per assignment.
   */
  const reports = await Promise.all(rows.map((r) => campaignReport(r, scopeFilter(scope), today)));
  const ordered = campaignRuleOrder(reports);
  /*
   * The field reads its own figure first.
   *
   * An RSO seeing the distribution's 67,398 above their own 25 reads as if
   * they were far ahead of a target they have barely started. `mine` moves
   * their line into the headline and the company total into the footer.
   */
  const isField = user.role === "RSO" || user.role === "BP";
  const mineOf = (r: (typeof reports)[number]) =>
    isField && scope.selfEmployeeId
      ? (campaignLineFor(r, scope.selfEmployeeId)?.progress ?? null)
      : // v200: a BP leads with its own outlet's figure, not a holder RSO's target.
        user.role === "BP" && scope.selfRetailerId
        ? (campaignOutletLine(r, scope.selfRetailerId)?.progress ?? null)
        : undefined;

  const running = ordered.filter((r) => r.phase === "RUNNING");
  const upcoming = ordered.filter((r) => r.phase === "UPCOMING");
  const ended = ordered.filter((r) => r.phase === "ENDED");

  return (
    <main className="page">
      <PageHeader
        title="Campaigns"
        subtitle="A SIM target with a start and an end. Monthly targets live on Targets / SC."
        action={
          scope.canWrite ? (
            <LinkBtn href="/campaigns/new">
              <Icon name="target" /> New campaign
            </LinkBtn>
          ) : undefined
        }
      />

      {!ordered.length ? (
        <Card padded>
          <EmptyState
            title="No campaigns yet"
            hint={
              scope.canWrite
                ? "Create one to give the field a target with a deadline — a total for the whole distribution, or a number each."
                : "When one is set up you will see your own target here."
            }
            icon={<Icon name="target" />}
          />
        </Card>
      ) : null}

      {running.length ? (
        <>
          <SectionHead title="Running now" sub={`${running.length} campaign${running.length === 1 ? "" : "s"}`} />
          <div className="cmp-grid">
            {running.map((r) => (
              <CampaignCard key={r.campaign.id} report={r} href={`/campaigns/${r.campaign.id}`} mine={mineOf(r)} />
            ))}
          </div>
        </>
      ) : null}

      {upcoming.length ? (
        <>
          <SectionHead title="Starting soon" />
          <div className="cmp-grid">
            {upcoming.map((r) => (
              <CampaignCard key={r.campaign.id} report={r} href={`/campaigns/${r.campaign.id}`} mine={mineOf(r)} />
            ))}
          </div>
        </>
      ) : null}

      {ended.length ? (
        <>
          <SectionHead title="Finished" sub="Kept so the numbers can be read back." />
          <div className="cmp-grid">
            {ended.map((r) => (
              <CampaignCard key={r.campaign.id} report={r} href={`/campaigns/${r.campaign.id}`} mine={mineOf(r)} />
            ))}
          </div>
        </>
      ) : null}
    </main>
  );
}

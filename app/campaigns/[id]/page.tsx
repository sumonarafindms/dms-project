/**
 * One campaign, at whatever level the reader belongs to.
 *
 * The same route for five roles. What changes is the SCOPE — which RSOs the
 * tables hold — and what is put at the top: an RSO or BP opens this to find
 * out how many more SIMs they need, so that is the first thing on their
 * screen. A manager opens it to find out which team is behind.
 */

import { notFound } from "next/navigation";
import { requirePagePermission } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { dhakaTodayYmd } from "../../../lib/business-time";
import { campaignLineFor, campaignOutletLine, campaignReport } from "../../../lib/campaign-data";
import { scopeFilter, viewerScope } from "../../../lib/feature-scope";
import { CAMPAIGN_SCOPE_LABEL } from "../../../lib/campaign";
import { AppLink as Link } from "../../components/AppLink";
import { Card, EmptyState, LinkBtn, PageHeader, SectionHead } from "../../components/Kit";
import { Icon } from "../../components/icons";
import {
  CampaignDistributionNote,
  CampaignMine,
  CampaignPhaseBadge,
  CampaignSummary,
  campaignWindowLabel,
} from "../../components/CampaignViews";
import { CampaignLevels } from "../../components/CampaignLevels";

export const dynamic = "force-dynamic";

export default async function CampaignDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission(["ADMIN", "IT", "MANAGER", "SUPERVISOR", "RSO", "BP"], "campaigns");
  const { id } = await params;
  const row = await prisma.campaign.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      scope: true,
      totalTarget: true,
      perEmployeeTarget: true,
      active: true,
      note: true,
      targets: { select: { employeeId: true, target: true } },
    },
  });
  if (!row) notFound();

  const scope = await viewerScope(user);
  const report = await campaignReport(row, scopeFilter(scope), dhakaTodayYmd());
  // v200: a BP reads its OUTLET's figure; it is not an employee and has no row of its own.
  const mine = scope.selfEmployeeId
    ? campaignLineFor(report, scope.selfEmployeeId)
    : user.role === "BP" && scope.selfRetailerId
      ? campaignOutletLine(report, scope.selfRetailerId)
      : null;
  const isField = user.role === "RSO" || user.role === "BP";

  return (
    <main className="page">
      <Link href="/campaigns" className="kit-detail-back no-print">
        <Icon name="arrow" /> Back to Campaigns
      </Link>
      <PageHeader
        title={report.campaign.name}
        subtitle={`${campaignWindowLabel(report.campaign)} • ${CAMPAIGN_SCOPE_LABEL[report.campaign.scope]}`}
        action={
          <span className="cmp-head-actions">
            <CampaignPhaseBadge phase={report.phase} />
            {scope.canWrite ? (
              <LinkBtn href={`/campaigns/${row.id}/edit`} variant="secondary">
                <Icon name="edit" /> Edit
              </LinkBtn>
            ) : null}
          </span>
        }
      />

      {row.note ? (
        <div className="kit-note is-info" role="status">
          <Icon name="info" />
          <span>{row.note}</span>
        </div>
      ) : null}

      {/*
        The field's own line goes ABOVE the distribution's, because it is the
        question they came to answer. Everyone else reads the total first.
      */}
      {isField ? (
        <>
          <SectionHead title="Your number" />
          <CampaignMine row={mine} label={user.role === "BP" ? "Your outlet" : "You"} />
          <SectionHead title="The whole distribution" sub="For context — this is everyone together." />
        </>
      ) : (
        <SectionHead title="The whole distribution" />
      )}
      <CampaignSummary report={report} />

      {report.unattributed > 0 ? (
        <div className="kit-note is-warn" role="status">
          <Icon name="alert" />
          <span>
            {report.unattributed.toLocaleString("en-US")} SIM
            {report.unattributed === 1 ? "" : "s"} in this window came from outlets with no RSO on them. They are in the
            total above and in nobody&apos;s row below.
          </span>
        </div>
      ) : null}

      {report.campaign.scope === "DISTRIBUTION" ? (
        <CampaignDistributionNote />
      ) : scope.employeeIds !== null && scope.employeeIds.length === 0 ? (
        <Card padded>
          <EmptyState
            title="No team assigned to you yet"
            hint="An administrator assigns the supervisors a manager looks after, and the RSOs a supervisor looks after."
            icon={<Icon name="users" />}
          />
        </Card>
      ) : user.role === "BP" ? null : (
        <CampaignLevels
          supervisors={report.supervisors}
          employees={report.employees}
          /* A supervisor and the field have one team between them, so the
             supervisor tab would be a single row repeating the total above. */
          showSupervisors={user.role !== "SUPERVISOR" && !isField}
        />
      )}
    </main>
  );
}

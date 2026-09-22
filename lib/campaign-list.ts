/**
 * Ordering campaigns for a reader, which is not the order a database returns.
 *
 * `startDate desc` puts next month's campaign above the one running today.
 * What a reader wants first is what is happening NOW, then what is coming, then
 * what is over — and inside each of those, the one closest to its deadline
 * first, because that is the one that needs attention.
 */

import { campaignPhase, type CampaignPhase, type CampaignRule } from "./campaign";

const PHASE_RANK: Record<CampaignPhase, number> = { RUNNING: 0, UPCOMING: 1, ENDED: 2 };

export function campaignRuleOrder<T extends { campaign: CampaignRule; phase: CampaignPhase }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const phase = PHASE_RANK[a.phase] - PHASE_RANK[b.phase];
    if (phase !== 0) return phase;
    // Running and upcoming: soonest deadline first. Ended: most recent first.
    if (a.phase === "ENDED") return b.campaign.endDate.localeCompare(a.campaign.endDate);
    return a.campaign.endDate.localeCompare(b.campaign.endDate);
  });
}

export { campaignPhase };

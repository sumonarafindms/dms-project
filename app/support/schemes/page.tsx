/**
 * Every Sim Support offer, newest day first.
 *
 * One row per day, because the offer is per day and the unique key is the date.
 * Saving an offer for a day that already has one replaces it, which is how the
 * operator thinks about it — so there is no "duplicate day" state to show.
 */

import { requirePagePermission } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { dhakaTodayYmd } from "../../../lib/business-time";
import { SCHEME_SELECT, schemeRule } from "../../../lib/sim-support-data";
import { SPLIT_TIERS, SUPPORT_TIER_LABEL, isSplit, ladderSlabs, schemeIsEmpty } from "../../../lib/sim-support";
import { AppLink as Link } from "../../components/AppLink";
import { Badge, Card, EmptyState, PageHeader, LinkBtn } from "../../components/Kit";
import { Icon } from "../../components/icons";
import { dayLabel } from "../../components/SupportViews";

export const dynamic = "force-dynamic";

export default async function SupportSchemes() {
  await requirePagePermission(["ADMIN", "IT", "MANAGER"], "support");
  const today = dhakaTodayYmd();
  const rows = await prisma.supportScheme.findMany({
    select: SCHEME_SELECT,
    orderBy: { date: "desc" },
    take: 120,
  });

  return (
    <main className="page">
      <Link href="/support" className="kit-detail-back no-print">
        <Icon name="arrow" /> Back to Sim Support
      </Link>
      <PageHeader
        title="Support offers"
        subtitle="One offer per day. Most days have none."
        action={
          <LinkBtn href="/support/schemes/new">
            <Icon name="target" /> New offer
          </LinkBtn>
        }
      />

      {!rows.length ? (
        <Card padded>
          <EmptyState
            title="No offers set yet"
            hint="Create one for a day and every RSO and BP will see what that day's SIMs are worth."
            icon={<Icon name="target" />}
          />
        </Card>
      ) : (
        <div className="cmp-grid">
          {rows.map((r) => {
            const ymd = r.date.toISOString().slice(0, 10);
            const rule = schemeRule(r);
            const split = isSplit(rule);
            const target = Number(r.dailyTarget) || 0;
            const sso = Number(r.ssoRatePerSim) || 0;
            return (
              <Link key={r.id} href={`/support/schemes/${r.id}/edit`} className="kit-card is-clickable cmp-card">
                <div className="cmp-card-head">
                  <div>
                    <strong className="cmp-card-name">{r.name || dayLabel(ymd)}</strong>
                    <span className="kit-hint is-xs">{r.name ? dayLabel(ymd) : " "}</span>
                  </div>
                  {/* Three states, and they are different: off, today, or just a day. */}
                  {!r.active ? (
                    <Badge tone="inactive">Off</Badge>
                  ) : ymd === today ? (
                    <Badge tone="active">Today</Badge>
                  ) : (
                    <Badge tone="neutral">{ymd > today ? "Upcoming" : "Past"}</Badge>
                  )}
                </div>
                {target > 0 ? (
                  <span className="sup-target is-sm">
                    <Icon name="target" /> Target {target.toLocaleString("en-US")}+ GA
                  </span>
                ) : null}
                <div className={`sup-mini-ladders${split ? " is-split" : ""}`}>
                  {(split ? [...SPLIT_TIERS] : (["ALL"] as const)).map((tier) => {
                    const slabs = ladderSlabs(rule, tier);
                    return (
                      <div key={tier}>
                        {split ? <strong>{SUPPORT_TIER_LABEL[tier]}</strong> : null}
                        <ul className="sup-slabs is-compact">
                          {slabs.map((s) => (
                            <li key={s.minSims}>
                              <span>
                                {s.minSims.toLocaleString("en-US")} GA ➜ ৳{s.ratePerSim.toLocaleString("en-US")}
                              </span>
                            </li>
                          ))}
                          {!slabs.length ? <li className="is-muted">No steps</li> : null}
                        </ul>
                      </div>
                    );
                  })}
                </div>
                <div className="cmp-card-foot">
                  <span>
                    {sso > 0
                      ? `SSO offer ৳${sso.toLocaleString("en-US")} per SIM`
                      : schemeIsEmpty(rule)
                        ? "Pays nothing"
                        : "No SSO offer"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}

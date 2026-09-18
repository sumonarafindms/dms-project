/**
 * RSO home — migrated to the role-UI kit.
 *
 * Follows the RSO demo: an overall performance card, the target-vs-achievement
 * KPI grid, clickable Quick Status counts, and a team snapshot.
 *
 * The Quick Status tiles deep-link into the SSO and LSO worklists **already
 * filtered to Pending**, which is what the demo specifies — a count you can
 * click straight through to the work it represents.
 *
 * The "retailers to visit first" list is kept from the previous version: it is
 * the one thing on this page that tells an RSO where to go next, and the demo
 * has no equivalent (Rule 4).
 */

import Link from "next/link";
import { requirePagePermission } from "../../lib/auth";
import { employeePerformance } from "../../lib/performance";
import { prisma } from "../../lib/prisma";
import { latestDailySnapshot } from "../../lib/intelligence";
import { dailyFeedItems, dailyFeedNote } from "../../lib/feed-day";
import { bpShareNote } from "../../lib/bp-rollup";
import { fmtNumber } from "../../lib/format";
import { dhakaMonth } from "../../lib/business-time";
import { pacing } from "../../lib/pacing";
import { retailerOpportunities } from "../../lib/retailer-opportunities";
import {
  Card,
  ComparisonSection,
  EmptyState,
  PageNotice,
  KpiCard,
  PageHeader,
  Row,
  SectionHead,
  StatPill,
  StatusTile,
  SummaryStrip,
  FeedNote,
} from "../components/Kit";
import { Icon } from "../components/icons";
import { performanceComparison } from "../../lib/comparison-data";
import { parseComparisonKind } from "../../lib/comparison";

export const dynamic = "force-dynamic";

export default async function RSO({ searchParams }: { searchParams: Promise<{ compare?: string }> }) {
  const u = await requirePagePermission(["RSO"], "dashboard");
  if (!u.employeeId)
    return <PageNotice title="Account not mapped" subtitle="Ask Admin to link this login to an RSO employee record." />;

  const monthKey = dhakaMonth();
  const month = `${monthKey}-01`;
  /*
   * The comparison joins this batch instead of following it.
   *
   * It used to be awaited after the four above had returned, so the page waited
   * for two rounds of database work where one would do. Nothing it needs comes
   * from them — only `compareKind`, which is read from the URL, and
   * `searchParams` is a promise that resolves without touching the database.
   *
   * Locally this is invisible; in production the database is remote and every
   * wait is a network round trip. See lib/performance.ts.
   */
  const sp = await searchParams;
  const compareKind = parseComparisonKind(sp.compare);
  const [perf, daily, retailers, bpCount, comparison] = await Promise.all([
    employeePerformance(month, [u.employeeId]),
    latestDailySnapshot([u.employeeId]),
    retailerOpportunities(monthKey, [u.employeeId]),
    // count, not findFirst: an RSO may hold several BPs, and the tile below
    // reports how many. `findFirst` made three of them read as one.
    prisma.bpAssignment.count({ where: { employeeId: u.employeeId, active: true } }),
    performanceComparison(compareKind, [u.employeeId]),
  ]);
  const r = perf[0];
  /*
   * `employeePerformance` only returns ACTIVE employees, so a deactivated —
   * or deleted — record lands here. This used to `return null`, which renders
   * a completely blank page: no heading, no message, and on a phone no way
   * back, because the shell's chrome is part of the page that did not render.
   * The RSO saw a white screen and had nothing to tell anyone except "it
   * stopped working".
   *
   * The reason is looked up rather than guessed, because "your record was
   * switched off" and "your login points at a record that is not there" send
   * the person to different people.
   */
  if (!r) {
    const record = await prisma.employee.findUnique({
      where: { id: u.employeeId },
      select: { active: true },
    });
    return record ? (
      <PageNotice
        title="Your employee record is inactive"
        subtitle="Ask Admin to reactivate it."
        hint="Targets, retailers and daily figures stay exactly as they are — they reappear as soon as the record is switched back on."
      />
    ) : (
      <PageNotice
        title="Employee record not found"
        subtitle="This login points at an RSO record that no longer exists."
        hint="Ask Admin to link it to a current RSO employee record."
      />
    );
  }

  // The clock is read ONCE here, on the server, and the same instant is used
  // for every card — otherwise five cards could straddle a Dhaka midnight and
  // disagree about how many days are left.
  const now = new Date();
  const paceFor = (target: number, achieved: number) => pacing(target, achieved, monthKey, now);
  const pace = paceFor(r.gaTarget, r.gaAchieved);

  // Same rules as the worklists, so the counts on this page and the counts on
  // /rso/sso and /rso/lso can never disagree.
  const sellers = retailers.filter((x) => x.simSeller);
  const ssoPending = sellers.filter((x) => !x.ssoComplete).length;
  const lsoPending = retailers.filter((x) => !x.lsoComplete).length;
  const focus = retailers.filter((x) => x.priority > 0).sort((a, b) => b.priority - a.priority);

  return (
    <main className="page">
      <PageHeader title={`Hello, ${u.displayName}`} subtitle={`${monthKey} · Your monthly progress`} />

      <SummaryStrip
        items={[
          ...dailyFeedItems(daily),
          { label: "My Retailers", value: fmtNumber(r.retailerCount) },
          { label: "Need Focus", value: fmtNumber(focus.length), tone: focus.length ? "amber" : "brand" },
        ]}
      />
      <FeedNote note={dailyFeedNote(daily)} />

      <SectionHead
        title="Target vs Achievement"
        sub={
          pace.window.phase === "current"
            ? `${pace.window.daysRemaining} day${pace.window.daysRemaining === 1 ? "" : "s"} left this month. Projections are estimates from your current rate, not promises.`
            : "Your monthly targets at a glance."
        }
      />
      {/* Which accounting these cards use, said once, where they are read.
          See bpShareNote — without it the GA card reads 470 on a page whose
          own pills describe a territory credited with 485. */}
      <FeedNote note={bpShareNote(r.bp)} />
      <div className="kit-kpi-grid kit-mb-20">
        <KpiCard
          label="GA"
          achieved={r.gaAchieved}
          target={r.gaTarget}
          pace={paceFor(r.gaTarget, r.gaAchieved)}
          tiers={{ total: r.gaAchieved, ga170: r.ga170, ga300: r.ga300 }}
        />
        <KpiCard label="SSO" achieved={r.ssoAchieved} target={r.ssoTarget} pace={paceFor(r.ssoTarget, r.ssoAchieved)} />
        <KpiCard label="LSO" achieved={r.lsoAchieved} target={r.lsoTarget} pace={paceFor(r.lsoTarget, r.lsoAchieved)} />
        <KpiCard
          label="C2C"
          achieved={r.c2cAchieved}
          target={r.c2cTarget}
          unit="৳"
          pace={paceFor(r.c2cTarget, r.c2cAchieved)}
        />
        <KpiCard
          label="Recharge"
          achieved={r.totalRechargeAchieved}
          target={r.totalRechargeTarget}
          unit="৳"
          pace={paceFor(r.totalRechargeTarget, r.totalRechargeAchieved)}
        />
      </div>

      <ComparisonSection
        metrics={comparison.metrics}
        kind={compareKind}
        control={{ mode: "link", hrefFor: (k) => `/rso?compare=${k}` }}
      />

      <SectionHead
        title="Quick status"
        sub="Tap a count to open the work behind it. These count OUTLETS in your base — including any you also hold as a BP — so they can differ from the target cards above, which count only your own share."
      />
      <div className="kit-status-tiles kit-mb-20">
        <StatusTile href={`/rso/sso?month=${monthKey}&status=pending`} count={ssoPending} label="SSO Pending" />
        <StatusTile href={`/rso/lso?month=${monthKey}&status=pending`} count={lsoPending} label="LSO Pending" />
        <StatusTile
          href="/rso/bp"
          count={bpCount}
          label={bpCount === 1 ? "My BP" : "My BPs"}
          tone={bpCount ? "brand" : "rose"}
        />
      </div>

      {/* "Team snapshot" was borrowed from the supervisor's page. An RSO has
          no team; they have an outlet base, and that is what these count. */}
      <SectionHead title="Your outlet base" />
      <Card className="kit-mb-20" padded>
        <div className="kit-pill-grid">
          <StatPill value={r.retailerCount} label="Retailers" />
          <StatPill value={sellers.length} label="SIM Sellers" />
          <StatPill value={sellers.length - ssoPending} label="Outlets at SSO" />
          <StatPill value={retailers.length - lsoPending} label="Outlets at LSO" />
        </div>
      </Card>

      <SectionHead
        title="Retailers to visit first"
        sub="Largest SSO and LSO gaps in your own retailer base."
        link={<Link href="/rso/attention">See all →</Link>}
      />
      <Card padded>
        {focus.length ? (
          <div className="kit-rows">
            {focus.slice(0, 5).map((x) => (
              <Row
                key={x.id}
                icon={<Icon name="shop" />}
                title={x.retailerName}
                sub={x.retailerCode}
                // The GA count, not a percentage: this list mixes SSO and LSO
                // gaps, and a percentage against the SSO threshold would be
                // meaningless for a retailer whose problem is LSO.
                value={x.ga}
                valueSub={x.reasons[0] ?? "Follow up"}
                tiers={x.gaTiers}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            positive
            title="No urgent retailer gaps"
            hint="Every monthly retailer rule is on track this month."
            icon={<Icon name="check" />}
          />
        )}
      </Card>
    </main>
  );
}

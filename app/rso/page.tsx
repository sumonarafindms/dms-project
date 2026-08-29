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
import { dhakaMonth } from "../../lib/business-time";
import { pacing } from "../../lib/pacing";
import { retailerOpportunities } from "../../lib/retailer-opportunities";
import {
  Card,
  ComparisonCard,
  EmptyState,
  KpiCard,
  PageHeader,
  Row,
  SectionHead,
  StatPill,
  StatusTile,
  SummaryStrip,
} from "../components/Kit";
import { Icon } from "../components/icons";
import { performanceComparison } from "../../lib/comparison-data";
import type { ComparisonKind } from "../../lib/comparison";

export const dynamic = "force-dynamic";

export default async function RSO({ searchParams }: { searchParams: Promise<{ compare?: string }> }) {
  const u = await requirePagePermission(["RSO"], "dashboard");
  if (!u.employeeId)
    return (
      <main className="page">
        <PageHeader title="Account not mapped" subtitle="Ask Admin to link this login to an RSO employee record." />
        <Card>
          <EmptyState title="Account not mapped" icon={<Icon name="alert" />} />
        </Card>
      </main>
    );

  const monthKey = dhakaMonth();
  const month = `${monthKey}-01`;
  const [perf, daily, retailers, bp] = await Promise.all([
    employeePerformance(month, [u.employeeId]),
    latestDailySnapshot([u.employeeId]),
    retailerOpportunities(monthKey, [u.employeeId]),
    prisma.bpAssignment.findFirst({
      where: { employeeId: u.employeeId, active: true },
      select: { id: true, retailer: { select: { retailerCode: true, retailerName: true } } },
    }),
  ]);
  const r = perf[0];
  if (!r) return null;

  // "day" unless asked otherwise. An unknown value falls back rather than
  // throwing, because this arrives from the URL.
  const sp = await searchParams;
  const compareKind: ComparisonKind = sp.compare === "week" || sp.compare === "month" ? sp.compare : "day";
  const comparison = await performanceComparison(compareKind, [u.employeeId]);

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
          { label: "Latest GA", value: daily.gaTotal.toLocaleString(), tone: "teal" },
          { label: "Latest C2C", value: `৳${Math.round(daily.c2cTotal).toLocaleString()}` },
          { label: "My Retailers", value: r.retailerCount.toLocaleString() },
          { label: "Need Focus", value: focus.length.toLocaleString(), tone: focus.length ? "amber" : "teal" },
        ]}
      />

      <SectionHead
        title="Target vs Achievement"
        sub={
          pace.window.phase === "current"
            ? `${pace.window.daysRemaining} day${pace.window.daysRemaining === 1 ? "" : "s"} left this month. Projections are estimates from your current rate, not promises.`
            : "Your monthly targets at a glance."
        }
      />
      <div className="kit-kpi-grid kit-mb-20">
        <KpiCard label="GA" achieved={r.gaAchieved} target={r.gaTarget} pace={paceFor(r.gaTarget, r.gaAchieved)} />
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

      <SectionHead
        title="Compared with the previous period"
        sub="Each figure names the two dates it was measured between, because the feeds do not always arrive together."
        link={
          <span className="kit-period-switch">
            {(["day", "week", "month"] as const).map((k) => (
              <Link
                key={k}
                href={`/rso?compare=${k}`}
                className={`kit-btn size-sm ${k === compareKind ? "is-primary" : "is-ghost"}`}
              >
                {k === "day" ? "Day" : k === "week" ? "Week" : "Month"}
              </Link>
            ))}
          </span>
        }
      />
      <div className="kit-card-grid kit-mb-20">
        {comparison.metrics.map((m) => (
          <ComparisonCard key={m.metric} item={m} />
        ))}
      </div>

      <SectionHead title="Quick status" sub="Tap a count to open the work behind it." />
      <div className="kit-status-tiles kit-mb-20">
        <StatusTile href={`/rso/sso?month=${monthKey}&status=pending`} count={ssoPending} label="SSO Pending" />
        <StatusTile href={`/rso/lso?month=${monthKey}&status=pending`} count={lsoPending} label="LSO Pending" />
        <StatusTile href="/rso/bp" count={bp ? 1 : 0} label="My BP" tone={bp ? "teal" : "rose"} />
      </div>

      <SectionHead title="Team snapshot" />
      <Card className="kit-mb-20" padded>
        <div className="kit-pill-grid">
          <StatPill value={r.retailerCount} label="Retailers" />
          <StatPill value={sellers.length} label="SIM Sellers" />
          <StatPill value={sellers.length - ssoPending} label="SSO Complete" />
          <StatPill value={retailers.length - lsoPending} label="LSO Complete" />
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

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
import { retailerOpportunities } from "../../lib/retailer-opportunities";
import {
  Card,
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

export const dynamic = "force-dynamic";

export default async function RSO() {
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

      <SectionHead title="Target vs Achievement" sub="Your monthly targets at a glance." />
      <div className="kit-kpi-grid" style={{ marginBottom: "1.25rem" }}>
        <KpiCard label="GA" achieved={r.gaAchieved} target={r.gaTarget} />
        <KpiCard label="SSO" achieved={r.ssoAchieved} target={r.ssoTarget} />
        <KpiCard label="LSO" achieved={r.lsoAchieved} target={r.lsoTarget} />
        <KpiCard label="C2C" achieved={r.c2cAchieved} target={r.c2cTarget} unit="৳" />
        <KpiCard label="Recharge" achieved={r.totalRechargeAchieved} target={r.totalRechargeTarget} unit="৳" />
      </div>

      <SectionHead title="Quick status" sub="Tap a count to open the work behind it." />
      <div className="kit-status-tiles" style={{ marginBottom: "1.25rem" }}>
        <StatusTile href={`/rso/sso?month=${monthKey}&status=pending`} count={ssoPending} label="SSO Pending" />
        <StatusTile href={`/rso/lso?month=${monthKey}&status=pending`} count={lsoPending} label="LSO Pending" />
        <StatusTile href="/rso/bp" count={bp ? 1 : 0} label="My BP" tone={bp ? "teal" : "rose"} />
      </div>

      <SectionHead title="Team snapshot" />
      <Card padded style={{ marginBottom: "1.25rem" }}>
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

/**
 * Supervisor home — migrated to the role-UI kit.
 *
 * Follows the supervisor demo: team KPIs, the RSO card grid, and the Low
 * Performance RSO alert the demo calls for.
 *
 * "Low performance" is a subset of THIS supervisor's own RSOs, never a
 * company-wide list, and it uses the shared achievement band rather than a
 * local cutoff — so the same RSO is labelled identically here, on the manager
 * pages and in the Reporting Center.
 */

import Link from "next/link";
import { requirePagePermission } from "../../lib/auth";
import { employeePerformance } from "../../lib/performance";
import { retailerOpportunities } from "../../lib/retailer-opportunities";
import { prisma } from "../../lib/prisma";
import { latestDailySnapshot, monthPace } from "../../lib/intelligence";
import { dhakaMonth } from "../../lib/business-time";
import { pacing } from "../../lib/pacing";
import { ACHIEVEMENT_ON_TRACK_PERCENT, targetPercent as pct } from "../../lib/achievement";
import {
  Card,
  ComparisonSection,
  EmptyState,
  EntityCard,
  KpiCard,
  PageHeader,
  SectionHead,
  StatusTile,
  SummaryStrip,
  Tile,
} from "../components/Kit";
import { Icon } from "../components/icons";
import { performanceComparison } from "../../lib/comparison-data";
import { teamTotals } from "../../lib/bp-rollup";
import { parseComparisonKind } from "../../lib/comparison";

export const dynamic = "force-dynamic";

export default async function Supervisor({ searchParams }: { searchParams: Promise<{ compare?: string }> }) {
  const u = await requirePagePermission(["SUPERVISOR"], "dashboard");
  const ids = u.supervisorId
    ? (
        await prisma.employee.findMany({
          where: { supervisorId: u.supervisorId, active: true },
          select: { id: true },
        })
      ).map((v) => v.id)
    : [];

  const monthKey = dhakaMonth();
  const month = `${monthKey}-01`;
  const [rows, attentionRows, daily] = await Promise.all([
    employeePerformance(month, ids),
    retailerOpportunities(monthKey, ids),
    latestDailySnapshot(ids),
  ]);

  const sp = await searchParams;
  const compareKind = parseComparisonKind(sp.compare);
  const comparison = await performanceComparison(compareKind, ids);

  const attention = attentionRows.filter((x) => x.priority > 0).length;
  const retailers = rows.reduce((a, r) => a + r.retailerCount, 0);
  const expected = monthPace(month);
  // teamTotals, not a plain sum of the rows: a supervisor is responsible for
  // the whole territory, and each RSO row now excludes its BPs. Summing the
  // rows directly would quietly drop every BP's SIMs and recharge from the
  // team figure. See lib/bp-rollup.ts.
  const team = teamTotals(rows);
  // One clock read for the whole page, so four cards cannot straddle a Dhaka
  // midnight and disagree about how many days are left.
  const now = new Date();
  const paceFor = (targetKey: keyof typeof team, achievedKey: keyof typeof team) =>
    pacing(team[targetKey], team[achievedKey], monthKey, now);

  // Shared band, not a local number — see lib/achievement.ts.
  const lowPerformers = rows
    .filter(
      (r) =>
        r.totalRechargeTarget > 0 && pct(r.totalRechargeAchieved, r.totalRechargeTarget) < ACHIEVEMENT_ON_TRACK_PERCENT,
    )
    .sort(
      (a, b) =>
        pct(a.totalRechargeAchieved, a.totalRechargeTarget) - pct(b.totalRechargeAchieved, b.totalRechargeTarget),
    );

  const ranked = [...rows].sort(
    (a, b) => pct(b.totalRechargeAchieved, b.totalRechargeTarget) - pct(a.totalRechargeAchieved, a.totalRechargeTarget),
  );

  return (
    <main className="page">
      <PageHeader title={`Hello, ${u.displayName}`} subtitle={`${monthKey} · ${expected}% of the month elapsed`} />

      <SummaryStrip
        items={[
          { label: "My RSOs", value: rows.length.toLocaleString() },
          { label: "Retailers", value: retailers.toLocaleString() },
          { label: "Latest GA", value: daily.gaTotal.toLocaleString(), tone: "teal" },
          { label: "Latest C2C", value: `৳${Math.round(daily.c2cTotal).toLocaleString()}` },
        ]}
      />

      <SectionHead
        title="Team targets"
        sub={`Expected pace is ${expected}% for this month. Projections are estimates from the team's current rate.`}
      />
      <div className="kit-kpi-grid kit-mb-20">
        <KpiCard
          label="GA"
          achieved={team.gaAchieved}
          target={team.gaTarget}
          pace={paceFor("gaTarget", "gaAchieved")}
        />
        <KpiCard
          label="SSO"
          achieved={team.ssoAchieved}
          target={team.ssoTarget}
          pace={paceFor("ssoTarget", "ssoAchieved")}
        />
        <KpiCard
          label="LSO"
          achieved={team.lsoAchieved}
          target={team.lsoTarget}
          pace={paceFor("lsoTarget", "lsoAchieved")}
        />
        <KpiCard
          label="C2C"
          achieved={team.c2cAchieved}
          target={team.c2cTarget}
          unit="৳"
          pace={paceFor("c2cTarget", "c2cAchieved")}
        />
      </div>

      <ComparisonSection
        metrics={comparison.metrics}
        kind={compareKind}
        control={{ mode: "link", hrefFor: (k) => `/supervisor?compare=${k}` }}
      />

      <SectionHead title="Needs attention" sub="Tap a count to open the work behind it." />
      <div className="kit-status-tiles kit-mb-20">
        <StatusTile href="/supervisor/attention" count={attention} label="Retailer follow-ups" />
        <StatusTile
          href="/supervisor/rsos"
          count={lowPerformers.length}
          label="Low performing RSO"
          tone={lowPerformers.length ? "rose" : "teal"}
        />
        <StatusTile href="/supervisor/bp-activations" count={rows.length} label="Team members" tone="teal" />
      </div>

      {lowPerformers.length > 0 && (
        <>
          <SectionHead
            title="Low performing RSOs"
            sub={`Below ${ACHIEVEMENT_ON_TRACK_PERCENT}% of recharge target.`}
            link={<Link href="/supervisor/rsos">View all →</Link>}
          />
          <div className="kit-card-grid kit-mb-20">
            {lowPerformers.slice(0, 3).map((r) => (
              <EntityCard
                key={r.employeeId}
                href={`/supervisor/rsos/${r.employeeId}?month=${monthKey}`}
                eyebrow="RSO"
                name={r.name}
                code={`${r.employeeCode || r.rsoMsisdn} · ${r.retailerCount} retailers`}
                percent={pct(r.totalRechargeAchieved, r.totalRechargeTarget)}
                metrics={[
                  { label: "GA", achieved: r.gaAchieved, target: r.gaTarget },
                  { label: "Recharge", achieved: r.totalRechargeAchieved, target: r.totalRechargeTarget, unit: "৳" },
                ]}
              />
            ))}
          </div>
        </>
      )}

      <SectionHead
        title="My RSO team"
        sub="Ranked by total recharge progress."
        link={<Link href="/supervisor/rsos">View all →</Link>}
      />
      {ranked.length ? (
        <div className="kit-card-grid kit-mb-20">
          {ranked.slice(0, 6).map((r) => (
            <EntityCard
              key={r.employeeId}
              href={`/supervisor/rsos/${r.employeeId}?month=${monthKey}`}
              eyebrow="RSO"
              name={r.name}
              code={`${r.employeeCode || r.rsoMsisdn} · ${r.retailerCount} retailers`}
              percent={pct(r.totalRechargeAchieved, r.totalRechargeTarget)}
              metrics={[
                { label: "GA", achieved: r.gaAchieved, target: r.gaTarget },
                { label: "LSO", achieved: r.lsoAchieved, target: r.lsoTarget },
              ]}
            />
          ))}
        </div>
      ) : (
        <Card className="kit-mb-20">
          <EmptyState
            title="No RSOs assigned"
            hint="Ask Admin to assign RSOs to your supervisor record."
            icon={<Icon name="users" />}
          />
        </Card>
      )}

      <SectionHead title="Field tools" />
      <div className="kit-card-grid">
        <Tile
          href="/supervisor/attention"
          icon={<Icon name="target" />}
          title="Attention Queue"
          sub={`${attention} retailer follow-ups`}
        />
        <Tile
          href="/supervisor/retailers"
          icon={<Icon name="shop" />}
          title="Retailers"
          sub={`${retailers.toLocaleString()} assigned outlets`}
        />
        <Tile
          admin
          href="/supervisor/bp-activations"
          icon={<Icon name="sim" />}
          title="BP Activations"
          sub="SIM activation monitoring"
        />
      </div>
    </main>
  );
}

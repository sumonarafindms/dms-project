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
import { employeePerformance, pct } from "../../lib/performance";
import { retailerOpportunities } from "../../lib/retailer-opportunities";
import { prisma } from "../../lib/prisma";
import { latestDailySnapshot, monthPace } from "../../lib/intelligence";
import { dhakaMonth } from "../../lib/business-time";
import { ACHIEVEMENT_ON_TRACK_PERCENT } from "../../lib/achievement";
import {
  Card,
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

export const dynamic = "force-dynamic";

export default async function Supervisor() {
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

  const attention = attentionRows.filter((x) => x.priority > 0).length;
  const retailers = rows.reduce((a, r) => a + r.retailerCount, 0);
  const expected = monthPace(month);
  const sum = (k: keyof (typeof rows)[number]) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);

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

      <SectionHead title="Team targets" sub={`Expected pace is ${expected}% for this month.`} />
      <div className="kit-kpi-grid" style={{ marginBottom: "1.25rem" }}>
        <KpiCard label="GA" achieved={sum("gaAchieved")} target={sum("gaTarget")} />
        <KpiCard label="SSO" achieved={sum("ssoAchieved")} target={sum("ssoTarget")} />
        <KpiCard label="LSO" achieved={sum("lsoAchieved")} target={sum("lsoTarget")} />
        <KpiCard label="C2C" achieved={sum("c2cAchieved")} target={sum("c2cTarget")} unit="৳" />
      </div>

      <SectionHead title="Needs attention" sub="Tap a count to open the work behind it." />
      <div className="kit-status-tiles" style={{ marginBottom: "1.25rem" }}>
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
          <div className="kit-card-grid" style={{ marginBottom: "1.25rem" }}>
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
        <div className="kit-card-grid" style={{ marginBottom: "1.25rem" }}>
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
        <Card style={{ marginBottom: "1.25rem" }}>
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

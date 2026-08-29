/**
 * Manager home — migrated to the role-UI kit.
 *
 * Follows the manager demo: team KPIs, supervisor cards, RSO ranking and the
 * monitoring tools. Everything is scoped through managerScope(), so a manager
 * only ever sees the supervisors assigned to them.
 *
 * Supervisor cards carry BOTH verdicts because they answer different
 * questions: the ring shows how much of the target is done, the footer shows
 * whether that is enough for how far into the month we are. A supervisor at
 * 40% on the 12th is ahead; the same 40% on the 28th is behind.
 */

import Link from "next/link";
import { requirePagePermission } from "../../lib/auth";
import { employeePerformance, pct } from "../../lib/performance";
import { prisma } from "../../lib/prisma";
import { retailerOpportunities } from "../../lib/retailer-opportunities";
import { latestDailySnapshot, monthPace } from "../../lib/intelligence";
import { managerScope } from "../../lib/manager-scope";
import { dhakaMonth } from "../../lib/business-time";
import { pacing } from "../../lib/pacing";
import { ACHIEVEMENT_ON_TRACK_PERCENT, paceBand } from "../../lib/achievement";
import {
  Badge,
  Card,
  ComparisonCard,
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
import type { ComparisonKind } from "../../lib/comparison";

export const dynamic = "force-dynamic";

export default async function Manager({ searchParams }: { searchParams: Promise<{ compare?: string }> }) {
  const u = await requirePagePermission(["MANAGER"], "dashboard");
  const scope = await managerScope(u.id);
  const monthKey = dhakaMonth();
  const month = `${monthKey}-01`;

  const [rows, attentionRows, supervisors, daily] = await Promise.all([
    employeePerformance(month, scope.employeeIds),
    retailerOpportunities(monthKey, scope.employeeIds),
    prisma.supervisor.findMany({
      where: { active: true, id: { in: scope.supervisorIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    latestDailySnapshot(scope.employeeIds),
  ]);

  const attention = attentionRows.filter((x) => x.priority > 0).length;
  const retailers = rows.reduce((a, r) => a + r.retailerCount, 0);
  const sp = await searchParams;
  const compareKind: ComparisonKind = sp.compare === "week" || sp.compare === "month" ? sp.compare : "day";
  const comparison = await performanceComparison(compareKind, scope.employeeIds);

  const expected = monthPace(month);
  const sum = (k: keyof (typeof rows)[number]) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);
  // One clock read for the whole page — four cards each calling new Date()
  // could straddle a Dhaka midnight and disagree about the days left.
  const now = new Date();
  const paceFor = (targetKey: keyof (typeof rows)[number], achievedKey: keyof (typeof rows)[number]) =>
    pacing(sum(targetKey), sum(achievedKey), monthKey, now);

  // Roll RSO rows up to their supervisor. Supervisors hold no targets of their
  // own, so a supervisor's target is the sum of their RSOs'.
  const supBy = new Map<
    string,
    {
      id: string;
      name: string;
      rsos: number;
      retailers: number;
      achieved: number;
      target: number;
      ga: number;
      gaTarget: number;
    }
  >();
  for (const s of supervisors)
    supBy.set(s.name, { id: s.id, name: s.name, rsos: 0, retailers: 0, achieved: 0, target: 0, ga: 0, gaTarget: 0 });
  for (const r of rows) {
    const x = supBy.get(r.supervisor);
    if (!x) continue;
    x.rsos++;
    x.retailers += r.retailerCount;
    x.achieved += r.totalRechargeAchieved;
    x.target += r.totalRechargeTarget;
    x.ga += r.gaAchieved;
    x.gaTarget += r.gaTarget;
  }
  const supRows = [...supBy.values()].sort((a, b) => pct(b.achieved, b.target) - pct(a.achieved, a.target));

  const ranked = [...rows].sort(
    (a, b) => pct(b.totalRechargeAchieved, b.totalRechargeTarget) - pct(a.totalRechargeAchieved, a.totalRechargeTarget),
  );

  return (
    <main className="page">
      <PageHeader title={`Hello, ${u.displayName}`} subtitle={`${monthKey} · ${expected}% of the month elapsed`} />

      <SummaryStrip
        items={[
          { label: "Assigned Teams", value: supervisors.length.toLocaleString() },
          { label: "RSOs", value: rows.length.toLocaleString() },
          { label: "Retailers", value: retailers.toLocaleString() },
          { label: "Latest GA", value: daily.gaTotal.toLocaleString(), tone: "teal" },
        ]}
      />

      <SectionHead
        title="Target progress"
        sub={`Expected pace is ${expected}% for the current month. Projections are estimates from the current rate.`}
      />
      <div className="kit-kpi-grid kit-mb-20">
        <KpiCard
          label="GA"
          achieved={sum("gaAchieved")}
          target={sum("gaTarget")}
          pace={paceFor("gaTarget", "gaAchieved")}
        />
        <KpiCard
          label="LSO"
          achieved={sum("lsoAchieved")}
          target={sum("lsoTarget")}
          pace={paceFor("lsoTarget", "lsoAchieved")}
        />
        <KpiCard
          label="C2C"
          achieved={sum("c2cAchieved")}
          target={sum("c2cTarget")}
          unit="৳"
          pace={paceFor("c2cTarget", "c2cAchieved")}
        />
        <KpiCard
          label="Total Recharge"
          achieved={sum("totalRechargeAchieved")}
          target={sum("totalRechargeTarget")}
          unit="৳"
          pace={paceFor("totalRechargeTarget", "totalRechargeAchieved")}
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
                href={`/manager?compare=${k}`}
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

      <SectionHead title="Needs attention" sub="Tap a count to open the work behind it." />
      <div className="kit-status-tiles kit-mb-20">
        <StatusTile href="/manager/attention" count={attention} label="Retailers to review" />
        <StatusTile
          href="/manager/rsos"
          count={
            ranked.filter(
              (r) =>
                r.totalRechargeTarget > 0 &&
                pct(r.totalRechargeAchieved, r.totalRechargeTarget) < ACHIEVEMENT_ON_TRACK_PERCENT,
            ).length
          }
          label="RSO behind target"
          tone="rose"
        />
        <StatusTile href="/manager/supervisors" count={supervisors.length} label="Assigned teams" tone="teal" />
      </div>

      <SectionHead
        title="Supervisor performance"
        sub="Recharge execution across your assigned teams."
        link={<Link href="/manager/supervisors">View all →</Link>}
      />
      {supRows.length ? (
        <div className="kit-card-grid kit-mb-20">
          {supRows.slice(0, 6).map((x) => {
            const progress = pct(x.achieved, x.target);
            return (
              <EntityCard
                key={x.id}
                href={`/manager/supervisors/${x.id}?month=${monthKey}`}
                eyebrow="Supervisor"
                name={x.name}
                code={`${x.rsos} RSOs · ${x.retailers.toLocaleString()} retailers`}
                percent={progress}
                metrics={[
                  { label: "GA", achieved: x.ga, target: x.gaTarget },
                  { label: "Recharge", achieved: x.achieved, target: x.target, unit: "৳" },
                ]}
                footer={
                  <div className="kit-entity-foot">
                    <span>Against {expected}% expected pace</span>
                    <Badge tone={paceBand(progress, expected) === "Behind" ? "behind" : "complete"}>
                      {paceBand(progress, expected)}
                    </Badge>
                  </div>
                }
              />
            );
          })}
        </div>
      ) : (
        <Card className="kit-mb-20">
          <EmptyState
            title="No supervisors assigned"
            hint="Ask Admin to assign supervisors to your manager account."
            icon={<Icon name="users" />}
          />
        </Card>
      )}

      <SectionHead
        title="RSO ranking"
        sub="Highest recharge execution first."
        link={<Link href="/manager/rsos">All RSOs →</Link>}
      />
      <div className="kit-card-grid kit-mb-20">
        {ranked.slice(0, 6).map((r) => (
          <EntityCard
            key={r.employeeId}
            href={`/manager/rsos/${r.employeeId}?month=${monthKey}`}
            eyebrow="RSO"
            name={r.name}
            code={`${r.employeeCode || r.rsoMsisdn} · ${r.supervisor}`}
            percent={pct(r.totalRechargeAchieved, r.totalRechargeTarget)}
            metrics={[
              { label: "GA", achieved: r.gaAchieved, target: r.gaTarget },
              { label: "LSO", achieved: r.lsoAchieved, target: r.lsoTarget },
            ]}
          />
        ))}
      </div>

      <SectionHead title="Monitoring tools" />
      <div className="kit-card-grid">
        <Tile
          href="/manager/attention"
          icon={<Icon name="target" />}
          title="Attention Center"
          sub={`${attention} retailers need review`}
        />
        <Tile
          href="/manager/supervisors"
          icon={<Icon name="users" />}
          title="Supervisors"
          sub="Assigned team overview"
        />
        <Tile
          admin
          href="/manager/bp-activations"
          icon={<Icon name="sim" />}
          title="BP Activations"
          sub="SIM activation monitoring"
        />
      </div>
    </main>
  );
}

"use client";

/**
 * Admin / IT dashboard — migrated to the role-UI kit.
 *
 * The admin demo's landing screen: month selector, KPI row, supervisor
 * performance, an attention watchlist and the administration shortcuts.
 *
 * This is a client component because the month selector refetches without a
 * navigation. That is also why it imports bands from lib/achievement rather
 * than lib/business-rules — the latter pulls in @prisma/client, which must
 * never reach the browser bundle.
 */

import { AppLink as Link } from "../components/AppLink";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/icons";
import { fmtNumber } from "../../lib/format";
import { dhakaMonth } from "../../lib/business-time";
import { ACHIEVEMENT_ON_TRACK_PERCENT, ACHIEVEMENT_WATCH_PERCENT } from "../../lib/achievement";
import { pacing } from "../../lib/pacing";
import type { ComparisonKind } from "../../lib/comparison";
import type { MetricComparison } from "../../lib/comparison-data";
import { groupSizes, groupTotals, teamTotals } from "../../lib/bp-rollup";
import type { BpPortion } from "../../lib/bp-rollup";
import {
  Card,
  ComparisonSection,
  EmptyState,
  KpiCard,
  MetricBar,
  PageHeader,
  Row,
  SectionHead,
  Skeleton,
  StatPill,
  StatusTile,
  SummaryStrip,
  Tile,
} from "../components/Kit";
import { apiFetch } from "@/lib/api-client";
import {
  emptySupervisorTarget,
  sumSupervisorTargets,
  targetFor,
  withSupervisorTarget,
  type SupervisorTarget,
} from "../../lib/supervisor-target";

type ApiRow = {
  employeeId: string;
  employeeCode?: string | null;
  name: string;
  supervisorId: string | null;
  supervisor: string;
  retailerCount: number;
  gaTarget: number;
  gaAchieved: number;
  ga170: number;
  ga300: number;
  ssoTarget: number;
  ssoAchieved: number;
  c2cTarget: number;
  c2cAchieved: number;
  scTarget: number;
  scAchieved: number;
  totalRechargeTarget: number;
  totalRechargeAchieved: number;
  lsoTarget: number;
  lsoAchieved: number;
  /** The BP share, already excluded from every field above. */
  bp: BpPortion;
};

/*
 * `fmtNumber`, not a local `Intl.NumberFormat("en-BD", …)`.
 *
 * This page had its own formatter pinned to a different locale from the rest of
 * the app, so the same figure was grouped `1,23,456` here and `123,456`
 * everywhere else. v169 pinned every figure in the product to one locale for
 * exactly this reason; the guard it added looks for a bare `toLocaleString()`
 * and an explicit `Intl.NumberFormat` slipped under it.
 */
const fmt = (n: number) => fmtNumber(Math.round(n));
const pct = (a: number, t: number) => (t ? Math.round((a / t) * 100) : 0);

export default function Dashboard() {
  const [month, setMonth] = useState(() => dhakaMonth());
  // Held in state, not read on every render: the month above is derived from
  // the clock the same way, and pinning one instant keeps the two consistent
  // and stops the pacing figures shifting when the month picker re-renders.
  const [nowIso] = useState(() => new Date().toISOString());
  const [rows, setRows] = useState<ApiRow[]>([]);
  /** The supervisors' own targets for the selected month, keyed by id. */
  const [supTargets, setSupTargets] = useState<Map<string, SupervisorTarget>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // The period comparison is its own concern: it is company-wide and anchored
  // on the latest day each feed actually has, so it does NOT depend on the
  // reporting month above and must not be refetched when the month changes.
  const [compareKind, setCompareKind] = useState<ComparisonKind>("day");
  const [comparison, setComparison] = useState<MetricComparison[]>([]);
  const [comparisonLoading, setComparisonLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      const res = await apiFetch<{
        rows?: ApiRow[];
        supervisorTargets?: (SupervisorTarget & { supervisorId: string })[];
      }>(`/api/dashboard/summary?month=${month}&_=${Date.now()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!active) return;
      setLoading(false);
      // A deliberate abort (the month changed) reports an empty message, which
      // must not be painted over the dashboard as an error.
      if (!res.ok) return void (res.message && setError(res.message));
      setRows(res.data.rows || []);
      setSupTargets(
        new Map((res.data.supervisorTargets || []).map((t) => [t.supervisorId, { ...emptySupervisorTarget(), ...t }])),
      );
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [month]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    (async () => {
      setComparisonLoading(true);
      const res = await apiFetch<{ metrics?: MetricComparison[] }>(`/api/dashboard/comparison?kind=${compareKind}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!active) return;
      setComparisonLoading(false);
      // Deliberately not routed into the page-level `error` banner. A failed
      // comparison must not make the KPI row above it look broken, and an empty
      // metric list already renders as "no data uploaded yet".
      setComparison(res.ok ? res.data.metrics || [] : []);
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [compareKind]);

  /*
   * COMPANY totals, so Business Partners count.
   *
   * `teamTotals` rather than a reduce over the rows: each row now carries only
   * what its RSO did, with the BP share held aside in `row.bp`. Summing the
   * rows here would silently drop every BP's SIMs and recharge from the
   * company figure — see lib/bp-rollup.ts.
   */
  /*
   * The company target is the supervisors' own targets added up.
   *
   * v181: once a supervisor's target is a number somebody chose, the company's
   * has to be the sum of those, or this page's headline row and the supervisor
   * section below it would be built from two different things and never
   * reconcile. The ACHIEVED side is unchanged — `teamTotals` over the rows,
   * Business Partners included, shared outlets counted once.
   */
  const companyTarget = useMemo(() => sumSupervisorTargets(supTargets.values()), [supTargets]);
  const totals = useMemo(() => withSupervisorTarget(teamTotals(rows), companyTarget), [rows, companyTarget]);

  /*
   * Composite score: recharge, GA and the SSO/LSO execution pair, weighted
   * equally. One number for "is this RSO keeping up overall".
   *
   * Only the parts that HAVE a target count, and an RSO with no target at all
   * gets no score rather than a zero.
   *
   * It used to average all four regardless. `targetPercent` returns 0 against
   * a target of zero — correctly, there is no percentage of nothing — so an
   * RSO nobody had set a target for scored 0 and went straight to the top of
   * a list headed "Lowest composite execution scores first". Six of them sat
   * there with "GA 0% · Recharge 0%" beside real GA figures in the thousands,
   * above every RSO who genuinely was behind. The dashboard already counts
   * those people, on its own "No target set" tile, which is where they belong.
   */
  const scored = useMemo(
    () =>
      rows
        .map((r) => {
          const parts: number[] = [];
          if (r.totalRechargeTarget > 0) parts.push(pct(r.totalRechargeAchieved, r.totalRechargeTarget));
          if (r.gaTarget > 0) parts.push(pct(r.gaAchieved, r.gaTarget));
          const execution: number[] = [];
          if (r.ssoTarget > 0) execution.push(pct(r.ssoAchieved, r.ssoTarget));
          if (r.lsoTarget > 0) execution.push(pct(r.lsoAchieved, r.lsoTarget));
          if (execution.length) parts.push(Math.round(execution.reduce((a, b) => a + b, 0) / execution.length));
          return {
            ...r,
            // null, not 0: "we cannot say" is a different answer from "nought".
            score: parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null,
            recharge: r.totalRechargeTarget > 0 ? pct(r.totalRechargeAchieved, r.totalRechargeTarget) : null,
            ga: r.gaTarget > 0 ? pct(r.gaAchieved, r.gaTarget) : null,
          };
        })
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
    [rows],
  );

  const supervisors = useMemo(() => {
    const map = new Map<
      string,
      { name: string; rsos: number; retailers: number; achieved: number; target: number; ga: number; gaTarget: number }
    >();
    /*
     * groupTotals, not a reduce over withBp(). One Business Partner can be
     * held by two RSOs on the same team, and `withBp()` gives each of them the
     * whole outlet by design — so summing them into a bucket counted its GA
     * and its target twice, on the company's own dashboard.
     */
    // Grouped by id rather than by name: two supervisors sharing a name used
    // to share one card here, and there is now a per-id target to attach.
    const totals = groupTotals(rows, (r) => r.supervisorId);
    const sizes = groupSizes(rows, (r) => r.supervisorId);
    const nameOf = new Map(rows.map((r) => [r.supervisorId, r.supervisor]));
    for (const [supervisorId, raw] of totals) {
      const t = withSupervisorTarget(raw, targetFor(supTargets, supervisorId));
      map.set(supervisorId ?? "", {
        name: nameOf.get(supervisorId) || "Unassigned",
        rsos: sizes.get(supervisorId) ?? 0,
        retailers: t.retailerCount,
        achieved: t.totalRechargeAchieved,
        target: t.totalRechargeTarget,
        ga: t.gaAchieved,
        gaTarget: t.gaTarget,
      });
    }
    return [...map.values()].sort((a, b) => pct(b.achieved, b.target) - pct(a.achieved, a.target));
  }, [rows, supTargets]);

  // Every tally below counts only the RSOs that can be scored at all.
  const behind = scored.filter((r) => r.score !== null && r.score < ACHIEVEMENT_WATCH_PERCENT).length;
  const onTrack = scored.filter((r) => r.score !== null && r.score >= ACHIEVEMENT_ON_TRACK_PERCENT).length;
  const targetReady = rows.filter(
    (r) => r.gaTarget || r.c2cTarget || r.totalRechargeTarget || r.ssoTarget || r.lsoTarget,
  ).length;
  const targetCoverage = rows.length ? Math.round((targetReady / rows.length) * 100) : 0;
  const watchlist = [...scored]
    .filter((r): r is (typeof scored)[number] & { score: number } => r.score !== null)
    .filter((r) => r.score < ACHIEVEMENT_ON_TRACK_PERCENT)
    .sort((a, b) => a.score - b.score);
  const firstLoad = loading && rows.length === 0;

  // The dashboard shows whichever month the picker selects, so pacing handles
  // a past or future month on its own; there is no from/to here, so the view
  // is always a whole month.
  const paceFor = (target: number, achieved: number) => pacing(target, achieved, month, new Date(nowIso));

  return (
    <main className="page">
      <PageHeader
        title="Performance Dashboard"
        subtitle={`${month} · Month-to-date operational snapshot`}
        action={
          <div className="kit-report-dates no-print kit-mb-0">
            <label className="kit-field">
              <span>Reporting month</span>
              <input
                className="kit-input"
                type="month"
                value={month}
                onChange={(e) => e.target.value && setMonth(e.target.value)}
              />
            </label>
          </div>
        }
      />

      {error && (
        <div className="kit-note is-warn" role="status">
          <Icon name="alert" />
          <span>Dashboard could not refresh — {error}</span>
        </div>
      )}

      {firstLoad ? (
        <div className="kit-summary-strip">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} padded>
              <Skeleton className="kit-skel-num" />
            </Card>
          ))}
        </div>
      ) : (
        <SummaryStrip
          items={[
            { label: "Field Force", value: fmt(rows.length) },
            { label: "Retailers", value: fmt(totals.retailerCount) },
            { label: "On Track", value: fmt(onTrack), tone: "brand" },
            { label: "Target Coverage", value: `${targetCoverage}%` },
          ]}
        />
      )}

      <SectionHead title="Monthly targets" sub="Company-wide completion for the selected month." />
      <div className="kit-kpi-grid kit-mb-20">
        <KpiCard
          label="GA"
          achieved={totals.gaAchieved}
          target={totals.gaTarget}
          pace={paceFor(totals.gaTarget, totals.gaAchieved)}
        />
        <KpiCard
          label="SSO"
          achieved={totals.ssoAchieved}
          target={totals.ssoTarget}
          pace={paceFor(totals.ssoTarget, totals.ssoAchieved)}
        />
        <KpiCard
          label="LSO"
          achieved={totals.lsoAchieved}
          target={totals.lsoTarget}
          pace={paceFor(totals.lsoTarget, totals.lsoAchieved)}
        />
        <KpiCard
          label="Total Recharge"
          achieved={totals.totalRechargeAchieved}
          target={totals.totalRechargeTarget}
          unit="৳"
          pace={paceFor(totals.totalRechargeTarget, totals.totalRechargeAchieved)}
        />
      </div>

      <ComparisonSection
        metrics={comparison}
        kind={compareKind}
        control={{ mode: "select", onSelect: setCompareKind }}
        loading={comparisonLoading}
      />

      <SectionHead title="Needs attention" sub="Tap a count to open the work behind it." />
      <div className="kit-status-tiles kit-mb-20">
        <StatusTile
          href="/admin/attention"
          count={behind}
          label={`RSO below ${ACHIEVEMENT_WATCH_PERCENT} composite score`}
          tone="rose"
        />
        <StatusTile href="/admin/performance/rsos" count={watchlist.length} label="Below target" />
        <StatusTile href="/targets" count={rows.length - targetReady} label="No target set" tone="amber" />
      </div>

      <SectionHead
        title="Supervisor performance"
        sub="Recharge and GA progress by team."
        link={<Link href={`/admin/performance/supervisors?month=${month}`}>View all →</Link>}
      />
      <Card className="kit-mb-20" padded>
        {supervisors.length ? (
          <div className="kit-rows">
            {supervisors.slice(0, 6).map((x) => (
              <div key={x.name} className="kit-row">
                <span className="kit-row-icon" aria-hidden="true">
                  {x.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="kit-row-main">
                  <strong>{x.name}</strong>
                  <span>
                    {x.rsos} RSOs · {fmt(x.retailers)} retailers
                  </span>
                  <div className="kit-stack-6 kit-mt-8">
                    <MetricBar label="Recharge" achieved={x.achieved} target={x.target} unit="৳" />
                    <MetricBar label="GA" achieved={x.ga} target={x.gaTarget} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No supervisor data available"
            hint="Import a data feed, or check that employees have supervisors assigned."
            icon={<Icon name="users" />}
          />
        )}
      </Card>

      <SectionHead
        title="Attention watchlist"
        sub="Lowest composite execution scores first."
        link={<Link href="/admin/attention">Open list →</Link>}
      />
      <Card className="kit-mb-20" padded>
        {watchlist.length ? (
          <div className="kit-rows">
            {watchlist.slice(0, 6).map((r) => (
              <Row
                key={r.employeeId}
                icon={<Icon name="chart" />}
                title={r.name}
                sub={`${r.supervisor} · GA ${r.ga === null ? "no target" : `${r.ga}%`} · Recharge ${
                  r.recharge === null ? "no target" : `${r.recharge}%`
                }`}
                value={r.score}
                valueSub="score"
              />
            ))}
          </div>
        ) : (
          <EmptyState
            positive
            title="No priority risks"
            hint={`Every scored RSO is at ${ACHIEVEMENT_ON_TRACK_PERCENT}+ this month.`}
            icon={<Icon name="check" />}
          />
        )}
      </Card>

      <SectionHead title="Team snapshot" />
      <Card className="kit-mb-20" padded>
        <div className="kit-pill-grid">
          <StatPill value={fmt(rows.length)} label="Active RSO" />
          <StatPill value={fmt(supervisors.length)} label="Supervisors" />
          <StatPill value={fmt(totals.retailerCount)} label="Retailers" />
          <StatPill value={`${targetCoverage}%`} label="Target Coverage" />
        </div>
      </Card>

      <SectionHead title="Quick reports" sub="The daily workspaces you use most." />
      <div className="kit-card-grid kit-mb-20">
        <Tile href="/ga" icon={<Icon name="sim" />} title="GA & SSO" sub="Activations and SIM swap" />
        <Tile href="/c2c" icon={<Icon name="wallet" />} title="C2C Recharge" sub="Stock lifting performance" />
        <Tile href="/c2s" icon={<Icon name="chart" />} title="C2S & LSO" sub="Retail sales execution" />
        <Tile href="/ob" icon={<Icon name="balance" />} title="Opening Balance" sub="Latest balance snapshot" />
      </div>

      <SectionHead title="Administration" sub="Common management tools." />
      <div className="kit-card-grid">
        <Tile
          admin
          href="/admin/users"
          icon={<Icon name="users" />}
          title="Login Accounts"
          sub="Create and manage logins"
        />
        <Tile
          admin
          href="/admin/permissions"
          icon={<Icon name="shield" />}
          title="Permissions"
          sub="Module-level access"
        />
        <Tile admin href="/admin/audit" icon={<Icon name="chart" />} title="Activity Log" sub="Who did what, when" />
        <Tile admin href="/targets" icon={<Icon name="target" />} title="Targets" sub="Monthly RSO and BP targets" />
      </div>
    </main>
  );
}

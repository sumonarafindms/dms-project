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

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/icons";
import { dhakaMonth } from "../../lib/business-time";
import { ACHIEVEMENT_ON_TRACK_PERCENT, ACHIEVEMENT_WATCH_PERCENT } from "../../lib/achievement";
import { pacing } from "../../lib/pacing";
import type { ComparisonKind } from "../../lib/comparison";
import type { MetricComparison } from "../../lib/comparison-data";
import { teamTotals, withBp } from "../../lib/bp-rollup";
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

type ApiRow = {
  employeeId: string;
  employeeCode?: string | null;
  name: string;
  supervisor: string;
  retailerCount: number;
  gaTarget: number;
  gaAchieved: number;
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

const fmt = (n: number) => new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(n);
const pct = (a: number, t: number) => (t ? Math.round((a / t) * 100) : 0);

export default function Dashboard() {
  const [month, setMonth] = useState(() => dhakaMonth());
  // Held in state, not read on every render: the month above is derived from
  // the clock the same way, and pinning one instant keeps the two consistent
  // and stops the pacing figures shifting when the month picker re-renders.
  const [nowIso] = useState(() => new Date().toISOString());
  const [rows, setRows] = useState<ApiRow[]>([]);
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
      try {
        const res = await fetch(`/api/dashboard/summary?month=${month}&_=${Date.now()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load dashboard");
        if (active) setRows(data.rows || []);
      } catch (e) {
        if (active && !(e instanceof DOMException && e.name === "AbortError"))
          setError(e instanceof Error ? e.message : "Could not load dashboard");
      } finally {
        if (active) setLoading(false);
      }
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
      try {
        const res = await fetch(`/api/dashboard/comparison?kind=${compareKind}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load the comparison");
        if (active) setComparison(data.metrics || []);
      } catch (e) {
        // Deliberately not routed into the page-level `error` banner. A failed
        // comparison must not make the KPI row above it look broken, and an
        // empty metric list already renders as "no data uploaded yet".
        if (active && !(e instanceof DOMException && e.name === "AbortError")) setComparison([]);
      } finally {
        if (active) setComparisonLoading(false);
      }
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
  const totals = useMemo(() => teamTotals(rows), [rows]);

  // Composite score: recharge, GA and the SSO/LSO execution pair, weighted
  // equally. One number for "is this RSO keeping up overall".
  const scored = useMemo(
    () =>
      rows
        .map((r) => {
          const recharge = pct(r.totalRechargeAchieved, r.totalRechargeTarget);
          const ga = pct(r.gaAchieved, r.gaTarget);
          const execution = Math.round((pct(r.ssoAchieved, r.ssoTarget) + pct(r.lsoAchieved, r.lsoTarget)) / 2);
          return { ...r, score: Math.round((recharge + ga + execution) / 3), recharge, ga };
        })
        .sort((a, b) => b.score - a.score),
    [rows],
  );

  const supervisors = useMemo(() => {
    const map = new Map<
      string,
      { name: string; rsos: number; retailers: number; achieved: number; target: number; ga: number; gaTarget: number }
    >();
    for (const r of rows) {
      const x = map.get(r.supervisor) || {
        name: r.supervisor,
        rsos: 0,
        retailers: 0,
        achieved: 0,
        target: 0,
        ga: 0,
        gaTarget: 0,
      };
      // withBp: a supervisor's team includes their RSOs' Business Partners.
      const t = withBp(r);
      x.rsos++;
      x.retailers += t.retailerCount;
      x.achieved += t.totalRechargeAchieved;
      x.target += t.totalRechargeTarget;
      x.ga += t.gaAchieved;
      x.gaTarget += t.gaTarget;
      map.set(r.supervisor, x);
    }
    return [...map.values()].sort((a, b) => pct(b.achieved, b.target) - pct(a.achieved, a.target));
  }, [rows]);

  const behind = scored.filter((r) => r.score < ACHIEVEMENT_WATCH_PERCENT).length;
  const onTrack = scored.filter((r) => r.score >= ACHIEVEMENT_ON_TRACK_PERCENT).length;
  const targetReady = rows.filter(
    (r) => r.gaTarget || r.c2cTarget || r.totalRechargeTarget || r.ssoTarget || r.lsoTarget,
  ).length;
  const targetCoverage = rows.length ? Math.round((targetReady / rows.length) * 100) : 0;
  const watchlist = [...scored].filter((r) => r.score < ACHIEVEMENT_ON_TRACK_PERCENT).sort((a, b) => a.score - b.score);
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
            { label: "On Track", value: fmt(onTrack), tone: "teal" },
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
                sub={`${r.supervisor} · GA ${r.ga}% · Recharge ${r.recharge}%`}
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

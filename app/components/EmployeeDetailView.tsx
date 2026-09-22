"use client";

import type { GaTiers } from "../../lib/ga-category";

/**
 * RSO detail — migrated to the role-UI kit.
 *
 * A client component so the retailer search below filters instantly: the rows
 * are already here, and typing must not re-run the page on the server.
 *
 * Shared by `/admin/rsos/[id]`, `/manager/rsos/[id]` and
 * `/supervisor/rsos/[id]`. `basePath` and `backHref` are what differ between
 * the three, so the caller decides where the retailer links and the back link
 * go rather than this component inferring a role.
 */

import { useMemo } from "react";
import { AppLink as Link } from "./AppLink";
import { ListControls, useListControls } from "./ListControls";
import { matchesTokens } from "../../lib/text-search";
import { Icon } from "./icons";
import { Card, EmptyState, KpiCard, PageHeader, Row, SectionHead, SummaryStrip } from "./Kit";
import { againstTarget, NO_TARGET_MARK, targetPercent as pct } from "../../lib/achievement";
import { activeSort, applySort, byNumberAsc, byNumberDesc, byText, sortOptions, type SortSpec } from "../../lib/sort";
import { pacingForView } from "../../lib/pacing";

type Perf = {
  retailerCount: number;
  totalRetailerCount: number;
  ssoAchieved: number;
  ssoTarget: number;
  lsoAchieved: number;
  lsoTarget: number;
  gaAchieved: number;
  gaTarget: number;
  ga170: number;
  ga300: number;
  c2cAchieved: number;
  c2cTarget: number;
  totalRechargeAchieved: number;
  totalRechargeTarget: number;
};
type RetailerRow = {
  id: string;
  retailerCode: string;
  retailerName?: string | null;
  category?: string | null;
  route?: string | null;
  isBp?: boolean;
  simSeller?: string | null;
  /** SIM seller with at least two standard GA this month — lib/business-rules.ts. */
  sso: boolean;
  /** False for a deactivated outlet that still traded inside the period. */
  active?: boolean;
  ga: number;
  gaTiers: GaTiers;
  lso: boolean;
  c2cAmount: number;
};
const outlet = (r: RetailerRow) => r.retailerName || r.retailerCode;

const SORTS: SortSpec<RetailerRow>[] = [
  { value: "ga-desc", label: "GA — high to low", compare: byNumberDesc((r) => r.ga, outlet) },
  { value: "ga-asc", label: "GA — low to high", compare: byNumberAsc((r) => r.ga, outlet) },
  { value: "c2c-desc", label: "C2C — high to low", compare: byNumberDesc((r) => r.c2cAmount, outlet) },
  { value: "c2c-asc", label: "C2C — low to high", compare: byNumberAsc((r) => r.c2cAmount, outlet) },
  /*
   * The two execution verdicts, both orderable.
   *
   * Only LSO was here, although every row already carried its SSO verdict and
   * the list prints both — so an RSO could ask "which of my outlets still owe
   * me an LSO" and had no way to ask the same question about SSO, which is the
   * one with a two-SIM threshold they can actually close today.
   */
  {
    value: "sso-pending",
    label: "SSO pending first",
    compare: (a, b) => Number(a.sso) - Number(b.sso) || byText(outlet(a), outlet(b)),
  },
  {
    value: "lso-pending",
    label: "LSO pending first",
    compare: (a, b) => Number(a.lso) - Number(b.lso) || byText(outlet(a), outlet(b)),
  },
  { value: "name-asc", label: "Retailer name — A to Z", compare: (a, b) => byText(outlet(a), outlet(b)) },
  { value: "code-asc", label: "Retailer code — A to Z", compare: (a, b) => byText(a.retailerCode, b.retailerCode) },
  {
    value: "route-asc",
    label: "Route — A to Z",
    compare: (a, b) => byText(a.route || "", b.route || "") || byText(outlet(a), outlet(b)),
  },
];

type EmployeeDetail = {
  employee: {
    name: string;
    employeeCode?: string | null;
    rsoMsisdn: string;
    supervisor?: { name?: string | null } | null;
  };
  perf: Perf;
  retailers: RetailerRow[];
};

export function EmployeeDetailView({
  d,
  month,
  basePath,
  backHref,
  from,
  to,
  nowIso,
}: {
  d: EmployeeDetail;
  month: string;
  basePath: string;
  backHref: string;
  /*
   * No `q` or `sort` here on purpose.
   *
   * Both were props once, both were documented "Ignored — kept so callers
   * compile", and three pages went on passing them. The list narrows and
   * reorders in the browser (`useListControls` below), so a caller supplying
   * either was writing a value into a prop that never reached anything.
   *
   * "Kept so callers compile" is how a signature starts lying: the type says
   * the option exists, the doc says it does not work, and nobody reads the doc.
   */
  from?: string;
  to?: string;
  /**
   * The server's clock, as an ISO string.
   *
   * This is a client component, so it renders once on the server for the
   * initial HTML and again in the browser on hydration. Calling `new Date()`
   * here would read two different clocks, and across a Dhaka midnight the two
   * renders would disagree about how many days are left — a hydration
   * mismatch. The parent page passes one instant and both renders use it.
   */
  nowIso?: string;
}) {
  const p = d.perf;
  const now = nowIso ? new Date(nowIso) : undefined;
  // pacingForView returns null when from/to narrow the view below a whole
  // month, because "22 days left" would then describe something other than
  // the figures on screen.
  const paceFor = (target: number, achieved: number) =>
    now ? (pacingForView(target, achieved, month, { from, to, now }) ?? undefined) : undefined;
  const { query, setQuery, deferredQuery, sort, setSort } = useListControls(SORTS[0].value);
  const filtered = useMemo(
    () =>
      applySort(
        d.retailers.filter((r) =>
          matchesTokens(
            `${r.retailerCode} ${r.retailerName || ""} ${r.category || ""} ${r.route || ""}`.toLowerCase(),
            deferredQuery,
          ),
        ),
        SORTS,
        sort,
      ),
    [d.retailers, deferredQuery, sort],
  );
  const range = `month=${month}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`;

  return (
    <main className="page">
      <Link href={backHref} className="kit-detail-back">
        <Icon name="arrow" /> Back
      </Link>
      <PageHeader
        title={d.employee.name}
        subtitle={`${d.employee.employeeCode || d.employee.rsoMsisdn} · ${d.employee.supervisor?.name || "Unassigned supervisor"}`}
      />

      <SummaryStrip
        items={[
          // Active retailers, matching the list below. The count used to
          // include deactivated outlets, so the header and the list disagreed.
          {
            label: p.totalRetailerCount > p.retailerCount ? "Active retailers" : "Retailers",
            value: p.retailerCount.toLocaleString("en-US"),
          },
          {
            label: `SSO · ${p.ssoTarget > 0 ? `${pct(p.ssoAchieved, p.ssoTarget)}%` : NO_TARGET_MARK}`,
            value: againstTarget(p.ssoAchieved, p.ssoTarget),
            tone: "brand",
          },
          {
            label: `LSO · ${p.lsoTarget > 0 ? `${pct(p.lsoAchieved, p.lsoTarget)}%` : NO_TARGET_MARK}`,
            value: againstTarget(p.lsoAchieved, p.lsoTarget),
          },
        ]}
      />

      <SectionHead title="Target progress" sub="For the selected date range." />
      <div className="kit-kpi-grid kit-mb-20">
        <KpiCard
          label="GA"
          achieved={p.gaAchieved}
          target={p.gaTarget}
          pace={paceFor(p.gaTarget, p.gaAchieved)}
          tiers={{ total: p.gaAchieved, ga170: p.ga170, ga300: p.ga300 }}
        />
        <KpiCard
          label="C2C"
          achieved={Math.round(p.c2cAchieved)}
          target={Math.round(p.c2cTarget)}
          unit="৳"
          pace={paceFor(p.c2cTarget, p.c2cAchieved)}
        />
        <KpiCard
          label="Total Recharge"
          achieved={Math.round(p.totalRechargeAchieved)}
          target={Math.round(p.totalRechargeTarget)}
          unit="৳"
          pace={paceFor(p.totalRechargeTarget, p.totalRechargeAchieved)}
        />
      </div>

      <ListControls
        query={query}
        onQuery={setQuery}
        placeholder="Search this RSO's retailers"
        sort={sortOptions(SORTS)}
        sortValue={sort}
        onSort={setSort}
        month={month}
        from={from}
        to={to}
        resultCount={filtered.length}
        resultNoun="retailer"
      />

      <SectionHead
        title={`${filtered.length} ${filtered.length === 1 ? "retailer" : "retailers"}`}
        sub={`${filtered.length === d.retailers.length ? "All assigned outlets" : `Filtered from ${d.retailers.length}`} · sorted by ${activeSort(SORTS, sort).label}.`}
      />
      <Card padded>
        {filtered.length ? (
          <div className="kit-rows">
            {filtered.map((r) => (
              <Row
                key={r.id}
                href={`${basePath}/retailers/${r.id}?${range}`}
                avatar={r.retailerName || r.retailerCode}
                title={r.retailerName || r.retailerCode}
                sub={`${r.retailerCode}${r.active === false ? " · Inactive" : ""}${r.isBp ? " · BP" : ""}${(r.simSeller || "").toUpperCase() === "Y" ? " · SIM Seller" : ""}`}
                detail={
                  <>
                    {/* Both verdicts, because the list can now be ordered by
                        either and a row ordered by something it does not show
                        is a list nobody can read. SSO applies to SIM sellers
                        only, so a non-seller says so rather than reading as a
                        failure. */}
                    <span className={r.sso ? "is-ok" : "is-warn"}>
                      {(r.simSeller || "").toUpperCase() === "Y"
                        ? r.sso
                          ? "SSO complete"
                          : "SSO pending"
                        : "Not a SIM seller"}
                    </span>
                    {" · "}
                    <span className={r.lso ? "is-ok" : "is-warn"}>{r.lso ? "LSO complete" : "LSO pending"}</span>
                    {` · ৳${Math.round(r.c2cAmount).toLocaleString("en-US")} C2C`}
                  </>
                }
                value={r.ga}
                valueSub="GA"
                tiers={r.gaTiers}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title={!d.retailers.length ? "No retailers assigned" : `No retailer matches “${query.trim()}”`}
            hint={d.retailers.length ? "Clear the search to see the whole list." : undefined}
            icon={<Icon name="search" />}
          />
        )}
      </Card>
    </main>
  );
}

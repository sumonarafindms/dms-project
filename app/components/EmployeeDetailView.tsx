/**
 * RSO detail — migrated to the role-UI kit.
 *
 * Shared by `/admin/rsos/[id]`, `/manager/rsos/[id]` and
 * `/supervisor/rsos/[id]`. `basePath` and `backHref` are what differ between
 * the three, so the caller decides where the retailer links and the back link
 * go rather than this component inferring a role.
 */

import Link from "next/link";
import { FilterForm } from "./DrillUI";
import { Icon } from "./icons";
import { Card, EmptyState, KpiCard, PageHeader, Row, SectionHead, SummaryStrip } from "./Kit";
import { pct } from "../../lib/performance";

type Perf = {
  retailerCount: number;
  ssoAchieved: number;
  ssoTarget: number;
  lsoAchieved: number;
  lsoTarget: number;
  gaAchieved: number;
  gaTarget: number;
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
  ga: number;
  lso: boolean;
  c2cAmount: number;
};
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
  q = "",
  from,
  to,
}: {
  d: EmployeeDetail;
  month: string;
  basePath: string;
  backHref: string;
  q?: string;
  from?: string;
  to?: string;
}) {
  const p = d.perf;
  const needle = q.toLowerCase();
  const filtered = d.retailers.filter(
    (r) =>
      !q ||
      `${r.retailerCode} ${r.retailerName || ""} ${r.category || ""} ${r.route || ""}`.toLowerCase().includes(needle),
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
          { label: "Retailers", value: p.retailerCount.toLocaleString() },
          {
            label: `SSO · ${pct(p.ssoAchieved, p.ssoTarget)}%`,
            value: `${p.ssoAchieved}/${p.ssoTarget}`,
            tone: "teal",
          },
          { label: `LSO · ${pct(p.lsoAchieved, p.lsoTarget)}%`, value: `${p.lsoAchieved}/${p.lsoTarget}` },
        ]}
      />

      <SectionHead title="Target progress" sub="For the selected date range." />
      <div className="kit-kpi-grid" style={{ marginBottom: "1.25rem" }}>
        <KpiCard label="GA" achieved={p.gaAchieved} target={p.gaTarget} />
        <KpiCard label="C2C" achieved={Math.round(p.c2cAchieved)} target={Math.round(p.c2cTarget)} unit="৳" />
        <KpiCard
          label="Total Recharge"
          achieved={Math.round(p.totalRechargeAchieved)}
          target={Math.round(p.totalRechargeTarget)}
          unit="৳"
        />
      </div>

      <FilterForm q={q} month={month} from={from} to={to} dateRange placeholder="Search this RSO's retailers" />

      <SectionHead
        title={`${filtered.length} ${filtered.length === 1 ? "retailer" : "retailers"}`}
        sub={filtered.length === d.retailers.length ? "All assigned outlets." : `Filtered from ${d.retailers.length}.`}
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
                sub={`${r.retailerCode}${r.isBp ? " · BP" : ""}${(r.simSeller || "").toUpperCase() === "Y" ? " · SIM Seller" : ""}`}
                detail={
                  <>
                    <span className={r.lso ? "is-ok" : "is-warn"}>{r.lso ? "LSO complete" : "LSO pending"}</span>
                    {` · ৳${Math.round(r.c2cAmount).toLocaleString()} C2C`}
                  </>
                }
                value={r.ga}
                valueSub="GA"
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title={d.retailers.length ? "No retailer matches that search" : "No retailers assigned"}
            hint={d.retailers.length ? "Try another code, name, category or route." : undefined}
            icon={<Icon name="search" />}
          />
        )}
      </Card>
    </main>
  );
}

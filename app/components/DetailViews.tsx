/**
 * Retailer profile — migrated to the role-UI kit.
 *
 * Shared by the admin, RSO, supervisor, manager and accounts detail routes;
 * `backHref` is what differs between them, so the caller decides where "back"
 * goes rather than this component guessing from a role.
 *
 * SIM_SWAP is shown beside GA and never inside it: a swap is a replacement,
 * not an activation, and adding the two would inflate every GA figure in the
 * app (lib/business-rules.ts withStandardGa is the server-side half of the
 * same rule).
 */

import Link from "next/link";
import { Icon } from "./icons";
import { Badge, Card, EmptyState, PageHeader, Row, SectionHead, SummaryStrip } from "./Kit";

/** Prisma returns money as Decimal; every caller here may hand us Decimal,
    number or string, so one coercion covers all three. */
type Numeric = number | string | { toString(): string };
const num = (v: Numeric | null | undefined) => Number(v?.toString() ?? 0);
const money = (n: Numeric) => `৳${Math.round(num(n)).toLocaleString()}`;

type GaRow = {
  simNo: string;
  activationDate: Date;
  activationTime?: string | null;
  sellingPrice: Numeric;
  category?: string;
  productCode?: string | null;
};

type RetailerDetail = {
  retailer: {
    retailerCode: string;
    retailerName?: string | null;
    simSeller?: string | null;
    route?: string | null;
    category?: string | null;
    iTopUpNumber?: string | null;
    iTopUpSrNumber?: string | null;
    employeeId?: string | null;
    employee?: { name?: string | null; rsoMsisdn?: string | null; supervisor?: { name?: string | null } | null } | null;
  };
  bp?: unknown;
  gaTotal: number;
  ga150: number;
  ga300: number;
  simSwap: number;
  c2cAmount: number;
  c2cTrx: number;
  c2sAmount: number;
  c2sTrx: number;
  ob?: { amount: Numeric } | null;
  ssoComplete: boolean;
  lsoComplete: boolean;
  ga: GaRow[];
  c2c: { date: Date; amount: Numeric }[];
  c2s: { date: Date; amount: Numeric }[];
};

export function RetailerDetailView({ d, month, backHref }: { d: RetailerDetail; month: string; backHref: string }) {
  const r = d.retailer,
    simSeller = (r.simSeller || "").toUpperCase() === "Y";
  const recharge = [
    ...d.c2c.map((x) => ({ type: "C2C", date: x.date, amount: num(x.amount) })),
    ...d.c2s.map((x) => ({ type: "C2S", date: x.date, amount: num(x.amount) })),
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 24);

  return (
    <main className="page">
      <Link href={backHref} className="kit-detail-back">
        <Icon name="arrow" /> Back
      </Link>

      <PageHeader
        title={r.retailerName || r.retailerCode}
        subtitle={`${r.retailerCode} · ${r.route || "No route"} · ${r.category || "No category"} · ${month}`}
        action={
          <div className="kit-row-actions">
            <Badge tone={simSeller ? "active" : "neutral"}>{simSeller ? "SIM Seller" : "Regular Retailer"}</Badge>
            <Badge tone={d.bp ? "active" : "neutral"}>{d.bp ? "Active BP" : "Normal Outlet"}</Badge>
          </div>
        }
      />

      <SummaryStrip
        items={[
          { label: "RSO", value: r.employee?.name || "Unassigned" },
          { label: "Supervisor", value: r.employee?.supervisor?.name || "—" },
          { label: "RSO MSISDN", value: r.employee?.rsoMsisdn || r.iTopUpSrNumber || "—" },
          { label: "iTopUp", value: r.iTopUpNumber || "—" },
        ]}
      />

      <SectionHead title="Period totals" sub="Everything below is for the selected date range." />
      {/* Five figures: 3-up leaves one gap on the second row, 4-up leaves three. */}
      <div className="kit-card-grid kit-mb-20">
        <Figure label="GA Total" value={d.gaTotal} sub={`${d.ga150} × 170 · ${d.ga300} × 300`} />
        <Figure label="SIM Swap" value={d.simSwap} sub="Replacement · not counted in GA" />
        <Figure label="C2C" value={money(d.c2cAmount)} sub={`${d.c2cTrx} transactions`} />
        <Figure label="C2S" value={money(d.c2sAmount)} sub={`${d.c2sTrx} transactions`} />
        <Figure label="Opening Balance" value={d.ob ? money(d.ob.amount) : "—"} sub="Latest snapshot" />
      </div>

      <SectionHead title="Execution status" />
      <div className="kit-pair kit-mb-20">
        <Card padded>
          <span className="kit-label">SSO status</span>
          <strong className={statusClass(simSeller, d.ssoComplete)}>
            {simSeller ? (d.ssoComplete ? "Completed" : "Pending") : "Not applicable"}
          </strong>
          <span className="kit-figure-sub">
            {simSeller ? `${d.gaTotal} standard GA in selected range` : "Retailer is not marked SIM seller"}
          </span>
        </Card>
        <Card padded>
          <span className="kit-label">LSO status</span>
          <strong className={d.lsoComplete ? "is-ok" : "is-warn"}>{d.lsoComplete ? "Completed" : "Pending"}</strong>
          <span className="kit-figure-sub">
            {money(d.c2sAmount)} · {d.c2sTrx} transactions
          </span>
        </Card>
      </div>

      <SectionHead title="Recent GA" sub={`${d.gaTotal} activations in this period.`} />
      <Card className="kit-mb-20" padded>
        {d.ga.length ? (
          <div className="kit-rows">
            {d.ga.slice(0, 20).map((x) => (
              <Row
                key={x.simNo}
                icon={<Icon name={x.category === "SIM_SWAP" ? "phone" : "sim"} />}
                title={x.simNo}
                sub={`${x.activationDate.toISOString().slice(0, 10)}${x.activationTime ? ` · ${x.activationTime}` : ""}`}
                value={`৳${num(x.sellingPrice)}`}
                valueSub={gaRowLabel(x)}
              />
            ))}
          </div>
        ) : (
          <EmptyState title="No GA in this period" icon={<Icon name="sim" />} />
        )}
      </Card>

      <SectionHead title="Recent recharge" sub={`${recharge.length} C2C and C2S entries.`} />
      <Card padded>
        {recharge.length ? (
          <div className="kit-rows">
            {recharge.map((x, idx) => (
              <Row
                key={`${x.type}-${x.date.getTime()}-${idx}`}
                icon={<Icon name={x.type === "C2C" ? "wallet" : "chart"} />}
                title={`${x.type} transaction`}
                sub={`${x.date.toISOString().slice(0, 10)} · daily amount`}
                value={money(x.amount)}
              />
            ))}
          </div>
        ) : (
          <EmptyState title="No recharge activity in this period" icon={<Icon name="wallet" />} />
        )}
      </Card>
    </main>
  );
}

function statusClass(applicable: boolean, complete: boolean) {
  if (!applicable) return "is-muted";
  return complete ? "is-ok" : "is-warn";
}

function Figure({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <Card padded>
      <span className="kit-label">{label}</span>
      <strong className="kit-figure">{value}</strong>
      <span className="kit-figure-sub">{sub}</span>
    </Card>
  );
}

function gaRowLabel(row: { category?: string; productCode?: string | null }) {
  if (row.category === "SIM_SWAP") return row.productCode || "Replacement";
  if (row.category === "GA_170") return "170 pack";
  if (row.category === "GA_300") return "300 pack";
  return row.productCode || "Not counted";
}

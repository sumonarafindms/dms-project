import { requireUser } from "../../../../../lib/auth";
import { bpAssignmentDetail } from "../../../../../lib/bp-activations";
import { normalizeMonth } from "../../../../../lib/drilldown";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, EmptyState, MetricBar, PageHeader, Row, SectionHead, SummaryStrip } from "../../../../components/Kit";
import { Icon } from "../../../../components/icons";
import { FilterForm } from "../../../../components/DrillUI";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string; from?: string; to?: string }>;
}) {
  const u = await requireUser(["ADMIN", "IT"]),
    { id } = await params,
    s = await searchParams,
    month = normalizeMonth(s.from?.slice(0, 7) || s.month),
    d = await bpAssignmentDetail(u, id, month, undefined, s.from, s.to);
  if (!d) notFound();
  const a = d.assignment;
  return (
    <main className="page">
      <Link href="/admin/performance/bps" className="kit-detail-back">
        <Icon name="arrow" /> BP Performance
      </Link>
      <PageHeader
        title={a.retailer.retailerName || a.retailer.retailerCode}
        subtitle={`${a.retailer.retailerCode} · RSO ${a.employee.name} · ${a.employee.supervisor?.name || "No supervisor"}`}
      />
      <div className="no-print" style={{ marginBottom: "1rem" }}>
        <FilterForm month={month} from={s.from} to={s.to} dateRange showMonth placeholder="" />
      </div>
      <SummaryStrip
        items={[
          { label: "GA Target", value: a.gaTarget.toLocaleString() },
          { label: "GA Achieved", value: d.total.toLocaleString(), tone: "teal" },
          { label: "GA Remaining", value: Math.max(0, a.gaTarget - d.total).toLocaleString(), tone: "amber" },
          // Shown, never added: a replacement SIM is not a new activation.
          { label: "SIM Swap", value: d.simSwap.toLocaleString() },
        ]}
      />
      <Card padded style={{ marginBottom: "1.25rem" }}>
        <MetricBar label="Selected-range GA progress" achieved={d.total} target={a.gaTarget} />
        <p style={{ fontSize: "0.75rem", color: "var(--color-slate-400)", marginTop: "0.5rem" }}>
          170 GA {d.total150} · 300 GA {d.total300} · SIM swap {d.simSwap} (excluded from achievement)
        </p>
      </Card>
      <SectionHead title="Recent SIM activations" sub={`${Math.min(d.rows.length, 100)} of ${d.rows.length} shown.`} />
      <Card padded>
        {d.rows.length ? (
          <div className="kit-rows">
            {d.rows.slice(0, 100).map((x) => (
              <Row
                key={x.simNo}
                icon={<Icon name="sim" />}
                title={`SIM ${x.simNo}`}
                sub={`${x.activationDate.toISOString().slice(0, 10)}${x.activationTime ? ` · ${x.activationTime}` : ""}`}
                value={`৳${Number(x.sellingPrice)}`}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No activations in this period"
            hint="Widen the date range, or check the GA feed on the Upload Center."
            icon={<Icon name="sim" />}
          />
        )}
      </Card>
    </main>
  );
}

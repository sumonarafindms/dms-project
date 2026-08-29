/**
 * BP activation history — migrated to the role-UI kit.
 *
 * The demo's Activation screen: a period summary, then the day-by-day list.
 * The real page additionally breaks GA down into 170 / 300 / SIM swap, which
 * a BP needs in order to reconcile their own sales, so those are kept.
 *
 * The three headline counts are computed in the database against the shared
 * GA rules, not by counting the 300-row display slice — otherwise a BP with
 * more than 300 activations would see a total that shrank to fit the page.
 */

import { requirePagePermission } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { monthBounds } from "../../../lib/month";
import { normalizeMonth } from "../../../lib/drilldown";
import { parseYmd, monthStartsInRange } from "../../../lib/date-range";
import { classifyGaActivation, withGa170, withGa300, withSimSwap, withStandardGa } from "../../../lib/business-rules";
import { targetPercent } from "../../../lib/achievement";
import { FilterForm } from "../../components/DrillUI";
import { Card, EmptyState, MetricBar, PageHeader, Row, SectionHead, SummaryStrip } from "../../components/Kit";
import { Icon } from "../../components/icons";

export const dynamic = "force-dynamic";

function Notice({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <main className="page">
      <PageHeader title={title} subtitle={subtitle} />
      <Card>
        <EmptyState title={title} hint={subtitle} icon={<Icon name="alert" />} />
      </Card>
    </main>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; q?: string; from?: string; to?: string }>;
}) {
  const u = await requirePagePermission(["BP"], "ga");
  if (!u.bpRetailerId)
    return <Notice title="BP code not assigned" subtitle="Ask Admin to link this login to an active BP retailer." />;

  const s = await searchParams;
  const month = normalizeMonth(s.from?.slice(0, 7) || s.month);
  const q = (s.q || "").trim();
  const { start, end } = monthBounds(`${month}-01`);
  const rs = parseYmd(s.from) || start;
  const to = parseYmd(s.to);
  const re = to ? new Date(to.getTime() + 86400000) : end;

  const [retailer, a] = await Promise.all([
    prisma.retailer.findUnique({
      where: { id: u.bpRetailerId },
      select: { retailerCode: true, retailerName: true },
    }),
    prisma.bpAssignment.findFirst({
      where: { retailerId: u.bpRetailerId, active: true },
      include: {
        monthlyTargets: {
          where: {
            month: {
              gte: new Date(Date.UTC(rs.getUTCFullYear(), rs.getUTCMonth(), 1)),
              lt: new Date(Date.UTC(re.getUTCFullYear(), re.getUTCMonth() + 1, 1)),
            },
          },
        },
      },
    }),
  ]);
  if (!a) return <Notice title="No active BP assignment" subtitle="Ask Admin to assign your BP retailer code." />;

  // Clipped to the assignment, so a BP never sees activations from before they
  // held the code.
  const effectiveStart = a.startDate > rs ? a.startDate : rs;
  const aEnd = a.endDate ? new Date(a.endDate.getTime() + 86400000) : re;
  const effectiveEnd = aEnd < re ? aEnd : re;

  const rangeWhere = { retailerId: u.bpRetailerId, activationDate: { gte: effectiveStart, lt: effectiveEnd } };
  const where = { ...rangeWhere, ...(q ? { simNo: { contains: q, mode: "insensitive" as const } } : {}) };

  const [rows, total, ga150, ga300, simSwap] = await Promise.all([
    prisma.gaActivation.findMany({
      where,
      orderBy: [{ activationDate: "desc" }, { activationTime: "desc" }],
      take: 300,
      select: { simNo: true, sellingPrice: true, productCode: true, activationDate: true, activationTime: true },
    }),
    prisma.gaActivation.count({ where: withStandardGa(rangeWhere) }),
    prisma.gaActivation.count({ where: withGa170(rangeWhere) }),
    prisma.gaActivation.count({ where: withGa300(rangeWhere) }),
    prisma.gaActivation.count({ where: withSimSwap(rangeWhere) }),
  ]);

  const targetByMonth = new Map(a.monthlyTargets.map((x) => [x.month.toISOString().slice(0, 7), x.gaTarget]));
  const target = monthStartsInRange(effectiveStart, effectiveEnd).reduce(
    (n, m) => n + (targetByMonth.get(m.toISOString().slice(0, 7)) ?? a.gaTarget ?? 0),
    0,
  );

  return (
    <main className="page">
      <PageHeader
        title="Activation Details"
        subtitle={`${retailer?.retailerCode || ""} · ${retailer?.retailerName || "Your BP retailer"}`}
      />

      <SummaryStrip
        items={[
          { label: "Total GA", value: total.toLocaleString(), tone: "teal" },
          { label: "170 GA", value: ga150.toLocaleString() },
          { label: "300 GA", value: ga300.toLocaleString() },
          // Shown, but deliberately outside the GA total — a swap replaces a
          // SIM, it does not add a subscriber.
          { label: "SIM Swap", value: simSwap.toLocaleString(), tone: "amber" },
        ]}
      />

      {target > 0 && (
        <Card padded style={{ marginBottom: "1rem" }}>
          <MetricBar label="Target progress" achieved={total} target={target} />
          <p style={{ fontSize: "0.75rem", color: "var(--color-slate-400)", marginTop: "0.5rem" }}>
            {Math.max(0, target - total).toLocaleString()} remaining · {targetPercent(total, target)}% achieved
          </p>
        </Card>
      )}

      <div className="no-print" style={{ marginBottom: "1rem" }}>
        <FilterForm q={q} month={month} from={s.from} to={s.to} dateRange placeholder="Search SIM serial" />
      </div>

      <SectionHead
        title="SIM activations"
        sub="Only records inside your BP assignment and the selected date range."
        link={<span className="kit-label">{rows.length} shown</span>}
      />
      <Card padded>
        {rows.length ? (
          <div className="kit-rows">
            {rows.map((x) => {
              const category = classifyGaActivation(x);
              return (
                <Row
                  key={x.simNo}
                  icon={<Icon name="sim" />}
                  title={`SIM ${x.simNo}`}
                  sub={`${x.activationDate.toISOString().slice(0, 10)}${x.activationTime ? ` · ${x.activationTime}` : ""}`}
                  value={`৳${Number(x.sellingPrice)}`}
                  valueSub={
                    category === "GA_170"
                      ? "170 GA"
                      : category === "GA_300"
                        ? "300 GA"
                        : category === "SIM_SWAP"
                          ? "SIM swap"
                          : "Not counted"
                  }
                />
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No GA found"
            hint="Change the date range or the SIM search."
            icon={<Icon name="search" />}
          />
        )}
      </Card>
    </main>
  );
}

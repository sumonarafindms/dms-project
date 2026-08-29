/**
 * BP home — migrated to the role-UI kit.
 *
 * Follows the BP demo's shape: a centred monthly-target ring, the today /
 * this-month pair, recent activity, and one action into the full history.
 *
 * The demo has no equivalent of the RSO and Supervisor cards, but the real
 * page has always shown them and a BP needs to know who to call, so they are
 * kept and expressed in the kit's vocabulary rather than dropped (Rule 4).
 *
 * All GA figures are standard GA only — SIM swaps are counted and displayed
 * separately on the sales page, never folded into the target.
 */

import { requirePagePermission } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { monthBounds } from "../../lib/month";
import { dhakaMonth, dhakaTodayYmd } from "../../lib/business-time";
import { classifyGaActivation, withStandardGa } from "../../lib/business-rules";
import { targetPercent } from "../../lib/achievement";
import { pacing } from "../../lib/pacing";
import { Btn, Card, EmptyState, HeroRing, PaceFoot, PageHeader, Row, SectionHead, StatPill } from "../components/Kit";
import { Icon } from "../components/icons";
import Link from "next/link";

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

export default async function BP() {
  const u = await requirePagePermission(["BP"], "dashboard");
  if (!u.bpRetailerId)
    return (
      <Notice title="BP code not assigned" subtitle="Ask Admin to link this login to an active BP retailer code." />
    );

  const monthText = `${dhakaMonth()}-01`;
  const { start, end } = monthBounds(monthText);
  const dayStart = new Date(`${dhakaTodayYmd()}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 86400000);

  const [retailer, assignment] = await Promise.all([
    prisma.retailer.findUnique({
      where: { id: u.bpRetailerId },
      select: {
        retailerCode: true,
        retailerName: true,
        employee: { select: { name: true, rsoMsisdn: true, supervisor: { select: { name: true } } } },
      },
    }),
    prisma.bpAssignment.findFirst({
      where: { retailerId: u.bpRetailerId, active: true },
      include: { monthlyTargets: { where: { month: start }, take: 1 } },
    }),
  ]);

  if (!retailer) return <Notice title="Retailer not found" subtitle="The BP retailer mapping needs to be updated." />;
  if (!assignment)
    return <Notice title="No active BP assignment" subtitle="Ask Admin to assign this retailer as an active BP." />;

  // A BP only owns the days its assignment actually covers, so the month and
  // today windows are clipped to it. Without this a newly assigned BP would be
  // credited with activations from before they held the code.
  const effectiveStart = assignment.startDate > start ? assignment.startDate : start;
  const assignmentEnd = assignment.endDate ? new Date(assignment.endDate.getTime() + 86400000) : end;
  const effectiveEnd = assignmentEnd < end ? assignmentEnd : end;
  const todayStart = dayStart > effectiveStart ? dayStart : effectiveStart;
  const todayEnd = dayEnd < effectiveEnd ? dayEnd : effectiveEnd;

  const [monthlyGa, todayGa, recent] = await Promise.all([
    prisma.gaActivation.count({
      where: withStandardGa({ retailerId: u.bpRetailerId, activationDate: { gte: effectiveStart, lt: effectiveEnd } }),
    }),
    todayStart < todayEnd
      ? prisma.gaActivation.count({
          where: withStandardGa({ retailerId: u.bpRetailerId, activationDate: { gte: todayStart, lt: todayEnd } }),
        })
      : Promise.resolve(0),
    prisma.gaActivation.findMany({
      where: { retailerId: u.bpRetailerId, activationDate: { gte: effectiveStart, lt: effectiveEnd } },
      orderBy: [{ activationDate: "desc" }, { activationTime: "desc" }],
      take: 5,
      select: { simNo: true, sellingPrice: true, productCode: true, activationDate: true, activationTime: true },
    }),
  ]);

  const target = assignment.monthlyTargets[0]?.gaTarget ?? assignment.gaTarget ?? 0;
  const remaining = Math.max(0, target - monthlyGa);
  // A BP's whole question is "how many more today", so the pacing line matters
  // more here than anywhere else in the app.
  const pace = pacing(target, monthlyGa, monthText);

  return (
    <main className="page">
      <PageHeader
        title={`Hello, ${u.displayName}`}
        subtitle={`${retailer.retailerCode} · ${retailer.retailerName || "BP retailer"}`}
      />

      <HeroRing
        label="Monthly Target"
        percent={targetPercent(monthlyGa, target)}
        figures={[
          { label: "Target", value: target || "—" },
          { label: "Activated", value: monthlyGa, tone: "teal" },
          { label: "Remaining", value: target ? remaining : "—", tone: "amber" },
        ]}
      />

      {pace.status !== "No target" && (
        <Card className="kit-mt-16" padded>
          <PaceFoot pace={pace} />
        </Card>
      )}

      <div className="kit-pair kit-my-16">
        <Card padded>
          <strong>{todayGa}</strong>
          <span>Today&apos;s Activation</span>
        </Card>
        <Card padded>
          <strong>{monthlyGa}</strong>
          <span>This Month Activation</span>
        </Card>
      </div>

      <SectionHead title="My team" sub="Who to contact about this BP code." />
      {/* StatPill is a slate-50 tile, which is nearly the page background —
          in the demos it always sits inside a card, so it does here too. */}
      <Card className="kit-mb-20" padded>
        <div className="kit-pill-grid">
          <StatPill value={retailer.employee?.name || "—"} label="RSO" />
          <StatPill value={retailer.employee?.rsoMsisdn || "Not assigned"} label="RSO Mobile" />
          <StatPill value={retailer.employee?.supervisor?.name || "—"} label="Supervisor" />
          <StatPill value={target ? `${remaining}` : "—"} label="GA Remaining" />
        </div>
      </Card>

      <SectionHead
        title="Recent activity"
        sub="Latest SIM activations inside your assignment."
        link={<Link href="/bp/sales">View all →</Link>}
      />
      <Card padded>
        {recent.length ? (
          <div className="kit-rows">
            {recent.map((x) => {
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
                      ? "170"
                      : category === "GA_300"
                        ? "300"
                        : category === "SIM_SWAP"
                          ? "SWAP"
                          : "—"
                  }
                />
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No activations yet"
            hint="Your latest SIM sales will appear here."
            icon={<Icon name="sim" />}
          />
        )}
      </Card>

      <div className="kit-mt-20">
        <Link href="/bp/sales">
          <Btn size="lg" block>
            View Activation History <Icon name="arrow" />
          </Btn>
        </Link>
      </div>
    </main>
  );
}

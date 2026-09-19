import { bpDisplayName } from "../../../lib/bp-name";
import Link from "next/link";
import { requirePagePermission } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { monthBounds } from "../../../lib/month";
import { dhakaMonth } from "../../../lib/business-time";
import { standardGaByAssignment } from "../../../lib/bp-activations";
import { Badge, Card, EmptyState, MetricBar, PageHeader, Row, SectionHead } from "../../components/Kit";
import { Icon } from "../../components/icons";
import { targetPercent } from "../../../lib/achievement";
import { addTiers, noTiers } from "../../../lib/ga-category";

/**
 * My BPs — every Business Partner this RSO holds.
 *
 * It used to be "My BP", singular: one `findFirst` on the RSO's active
 * assignments, so an RSO with three BPs saw one, chosen arbitrarily by the
 * database, and the other two were invisible to the person who works them.
 *
 * That was a consequence of v139, which allowed several BPs per RSO but left
 * this consumer behind — the same half-finished shape the v132 audit kept
 * finding. The page is a list now.
 *
 * GA comes from `standardGaByAssignment`, which is ONE grouped query for all of
 * the assignments and respects each one's own date window. A count per BP would
 * have been a query per BP.
 */
export default async function Page() {
  const u = await requirePagePermission(["RSO"], "bp");
  if (!u.employeeId)
    return (
      <main className="page">
        <PageHeader title="Account not mapped" subtitle="Ask Admin to link this login to an RSO employee." />
        <Card>
          <EmptyState title="Account not mapped" icon={<Icon name="alert" />} />
        </Card>
      </main>
    );

  const month = dhakaMonth() + "-01",
    { start, end } = monthBounds(month);
  const [active, history] = await Promise.all([
    prisma.bpAssignment.findMany({
      where: { employeeId: u.employeeId, active: true },
      orderBy: { startDate: "desc" },
      include: {
        retailer: {
          select: {
            retailerCode: true,
            retailerName: true,
            bpName: true,
            bpUser: { select: { displayName: true, mobileNumber: true, active: true, role: true } },
          },
        },
        monthlyTargets: { where: { month: start }, take: 1 },
      },
    }),
    prisma.bpAssignment.findMany({
      where: { employeeId: u.employeeId, active: false },
      orderBy: { endDate: "desc" },
      take: 8,
      include: { retailer: { select: { retailerCode: true, retailerName: true, bpName: true } } },
    }),
  ]);

  // One query for every assignment's GA, clipped to each one's own window.
  const gaByAssignment = await standardGaByAssignment(active, start, end);

  const totals = active.reduce(
    (a, x) => {
      const target = x.monthlyTargets[0]?.gaTarget ?? x.gaTarget;
      return { target: a.target + target, achieved: addTiers(a.achieved, gaByAssignment.get(x.id) ?? noTiers()) };
    },
    { target: 0, achieved: noTiers() },
  );

  const historySection = (
    <div className="kit-mt-20">
      <SectionHead
        title="Previous BP codes"
        sub={`${history.length} ended assignment${history.length === 1 ? "" : "s"}`}
      />
      <Card padded>
        {history.length ? (
          <div className="kit-rows">
            {history.map((h) => (
              <Row
                key={h.id}
                icon={<Icon name="users" />}
                title={bpDisplayName(h.retailer)}
                sub={h.retailer.retailerCode}
                value={h.startDate.toISOString().slice(0, 10)}
                valueSub={`to ${h.endDate?.toISOString().slice(0, 10) || "ended"}`}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No previous BP codes"
            hint="Nothing has been ended under this RSO."
            icon={<Icon name="users" />}
          />
        )}
      </Card>
    </div>
  );

  if (!active.length)
    return (
      <main className="page">
        <PageHeader title="No active BP" subtitle="Admin has not assigned a BP retailer code under your RSO." />
        {historySection}
      </main>
    );

  return (
    <main className="page">
      <PageHeader
        title={active.length === 1 ? "My BP" : `My BPs (${active.length})`}
        subtitle={`${dhakaMonth()} · GA ${totals.achieved.total} of ${totals.target || "no"} target${
          totals.target === 1 ? "" : "s"
        } across ${active.length} assignment${active.length === 1 ? "" : "s"}`}
        action={<Badge tone="active">{active.length} active</Badge>}
      />

      <div className="kit-stack-12">
        {active.map((a) => {
          const target = a.monthlyTargets[0]?.gaTarget ?? a.gaTarget;
          const ga = gaByAssignment.get(a.id) ?? noTiers();
          const login = a.retailer.bpUser?.active && a.retailer.bpUser.role === "BP" ? a.retailer.bpUser : null;
          return (
            /*
             * The card IS the link, because "how many did this BP do, and
             * when?" is one question with two halves. The monthly figure lives
             * here; the day-by-day record lives one tap away at /rso/bp/[id].
             *
             * It used to be neither: the cards were inert and the dates sat
             * behind a second menu entry that re-listed the same partners.
             *
             * `month` is carried so the detail opens on the period the reader
             * was already looking at rather than resetting to today's.
             */
            <Link
              key={a.id}
              href={`/rso/bp/${a.id}?month=${dhakaMonth()}`}
              className="kit-card kit-card-p is-clickable"
              aria-label={`${bpDisplayName(a.retailer)} — daily activation record`}
            >
              <div className="kit-row-between">
                {/* kit-entity-main, not kit-readiness-head: the latter belongs
                    to the Data Readiness grid, and borrowing a class named for
                    another screen is how a design system loses its meaning. */}
                <div className="kit-entity-main">
                  <strong>{bpDisplayName(a.retailer)}</strong>
                  <span>
                    {a.retailer.retailerCode} · since {a.startDate.toISOString().slice(0, 10)}
                  </span>
                </div>
                <Badge tone={targetPercent(ga.total, target) >= 100 ? "achieved" : "active"}>
                  {target ? `${targetPercent(ga.total, target)}%` : "No target"}
                </Badge>
              </div>

              <div className="kit-mt-8">
                <MetricBar label="Monthly GA" achieved={ga.total} target={target} tiers={ga} />
              </div>

              <p className="kit-hint is-xs kit-mt-6">
                {/* The login matters to an RSO: without one the BP cannot see
                    their own screen, and the RSO is the person who notices. */}
                {login
                  ? `Login: ${login.displayName}${login.mobileNumber ? ` · ${login.mobileNumber}` : ""}`
                  : "No login created yet"}
              </p>
              <p className="kit-hint is-xs kit-mt-6">Tap for this BP&rsquo;s day-by-day record →</p>
            </Link>
          );
        })}
      </div>

      {historySection}
    </main>
  );
}

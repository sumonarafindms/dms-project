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

import { bpDisplayName } from "../../lib/bp-name";
import { requirePagePermission } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { monthBounds } from "../../lib/month";
import { classifyGaActivation, gaCategoryLabel, withStandardGa } from "../../lib/business-rules";
import { addTier, noTiers, type GaTiers } from "../../lib/ga-category";
import { currentGa170Tariff } from "../../lib/ga-tariff";
import type { Prisma } from "@prisma/client";
import { targetPercent } from "../../lib/achievement";
import { pacing } from "../../lib/pacing";
import {
  Btn,
  Card,
  EmptyState,
  FeedNote,
  HeroRing,
  PaceFoot,
  PageHeader,
  PageNotice as Notice,
  TierLine,
  Row,
  SectionHead,
  StatPill,
} from "../components/Kit";
import { Icon } from "../components/icons";
import { latestGaDay } from "../../lib/intelligence";
import { businessDayBounds, dhakaMonth, dhakaYesterdayYmd } from "../../lib/business-time";
import { feedDay, feedDayLabel, stalenessNote } from "../../lib/feed-day";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function BP() {
  const u = await requirePagePermission(["BP"], "dashboard");
  if (!u.bpRetailerId)
    return (
      <Notice title="BP code not assigned" subtitle="Ask Admin to link this login to an active BP retailer code." />
    );

  const monthText = `${dhakaMonth()}-01`;
  const { start, end } = monthBounds(monthText);

  /*
   * The daily tile is anchored on the newest day the GA FEED has, not on
   * today.
   *
   * It used to count today in Dhaka, and `lib/readiness-data.ts` already
   * states why that could not work: GA, C2C, C2S and OB are uploaded for the
   * PREVIOUS day, so today is never expected to have data. The card therefore
   * read "Today's Activation: 0" for most of every working day, and a BP had
   * no way to tell that apart from having genuinely sold nothing. It is the
   * same defect as the role homes' "Latest GA", arriving from the other side.
   */
  const [retailer, assignment, gaDayYmd] = await Promise.all([
    prisma.retailer.findUnique({
      where: { id: u.bpRetailerId },
      select: {
        retailerCode: true,
        retailerName: true,
        bpName: true,
        employee: { select: { name: true, rsoMsisdn: true, supervisor: { select: { name: true } } } },
      },
    }),
    prisma.bpAssignment.findFirst({
      where: { retailerId: u.bpRetailerId, active: true },
      include: { monthlyTargets: { where: { month: start }, take: 1 } },
    }),
    latestGaDay(),
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
  // The feed's day, clipped to the assignment the same way the month is: a BP
  // is not credited with activations from before they held the code.
  const gaDayBounds = gaDayYmd ? businessDayBounds(gaDayYmd) : null;
  const dayStart = gaDayBounds && gaDayBounds.start > effectiveStart ? gaDayBounds.start : effectiveStart;
  const dayEnd = gaDayBounds && gaDayBounds.end < effectiveEnd ? gaDayBounds.end : effectiveEnd;
  const dayInWindow = Boolean(gaDayBounds) && dayStart < dayEnd;

  /*
   * The month and the day are GROUPED rather than counted, so each comes back
   * with its 170/300 split in the query that was already being run.
   *
   * The owner's request is that every GA block says how many 170 SIMs and how
   * many 300 — this is the BP's whole screen, so it is the one that matters
   * most. A BP knowing which pack is moving is the point of the feature.
   */
  const [monthGroups, dayGroups, recent] = await Promise.all([
    prisma.gaActivation.groupBy({
      by: ["productCode", "sellingPrice"],
      where: withStandardGa({ retailerId: u.bpRetailerId, activationDate: { gte: effectiveStart, lt: effectiveEnd } }),
      _count: { _all: true },
    }),
    dayInWindow
      ? prisma.gaActivation.groupBy({
          by: ["productCode", "sellingPrice"],
          where: withStandardGa({ retailerId: u.bpRetailerId, activationDate: { gte: dayStart, lt: dayEnd } }),
          _count: { _all: true },
        })
      : Promise.resolve([]),
    prisma.gaActivation.findMany({
      where: { retailerId: u.bpRetailerId, activationDate: { gte: effectiveStart, lt: effectiveEnd } },
      orderBy: [{ activationDate: "desc" }, { activationTime: "desc" }],
      take: 5,
      select: { simNo: true, sellingPrice: true, productCode: true, activationDate: true, activationTime: true },
    }),
  ]);

  const tariff = await currentGa170Tariff();
  const tally = (
    groups: { productCode: string | null; sellingPrice: Prisma.Decimal | null; _count: { _all: number } }[],
  ) => groups.reduce<GaTiers>((acc, g) => addTier(acc, classifyGaActivation(g, tariff), g._count._all), noTiers());
  const monthTiers = tally(monthGroups);
  const dayTiers = tally(dayGroups);
  const monthlyGa = monthTiers.total;
  const dayGa = dayTiers.total;

  const target = assignment.monthlyTargets[0]?.gaTarget ?? assignment.gaTarget ?? 0;
  const remaining = Math.max(0, target - monthlyGa);
  // A BP's whole question is "how many more today", so the pacing line matters
  // more here than anywhere else in the app.
  const pace = pacing(target, monthlyGa, monthText);
  const gaDay = feedDay(gaDayYmd, dayGa, dhakaYesterdayYmd());

  return (
    <main className="page">
      <PageHeader
        title={`Hello, ${u.displayName}`}
        subtitle={`${retailer.retailerCode} · ${bpDisplayName(retailer)}`}
      />

      <HeroRing
        label="Monthly Target"
        percent={targetPercent(monthlyGa, target)}
        figures={[
          { label: "Target", value: target || "—" },
          { label: "Activated", value: monthlyGa, tone: "brand", tiers: monthTiers },
          { label: "Remaining", value: target ? remaining : "—", tone: "amber" },
        ]}
      />

      {pace.status !== "No target" && (
        <Card className="kit-mt-16" padded>
          <PaceFoot pace={pace} />
        </Card>
      )}

      <div className="kit-pair kit-mt-16 kit-mb-8">
        <Card padded>
          <strong>{gaDay.value}</strong>
          <span>{feedDayLabel("Activations", gaDay)}</span>
          <TierLine tiers={dayTiers} />
        </Card>
        <Card padded>
          <strong>{monthlyGa}</strong>
          <span>This Month Activation</span>
          <TierLine tiers={monthTiers} />
        </Card>
      </div>
      <FeedNote note={stalenessNote([{ label: "GA", day: gaDay }])} />

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
                  valueSub={gaCategoryLabel(category)}
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
        {/* `kit-block-link`, because the anchor is what a browser and a screen
            reader measure and hit-test, not the button drawn inside it. An
            inline <a> around a full-width button reported a 19px-tall target
            while looking like a 48px one — under the 24px WCAG 2.5.8 floor, on
            the role that works entirely from a phone. */}
        <Link href="/bp/sales" className="kit-block-link">
          <Btn size="lg" block>
            View Activation History <Icon name="arrow" />
          </Btn>
        </Link>
      </div>
    </main>
  );
}

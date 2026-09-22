/**
 * Sim Support for one day.
 *
 * Every role opens this route. The field sees their own money first and the
 * day's offer under it; everyone above sees the offer, the totals and the
 * people. The scope decides who is in the table, never what the arithmetic is:
 * an outlet's SSO completion does not depend on who is looking at it.
 */

import { requirePagePermission } from "../../lib/auth";
import { dhakaTodayYmd, dhakaYesterdayYmd } from "../../lib/business-time";
import { supportDay } from "../../lib/sim-support-data";
import { scopeFilter, viewerScope } from "../../lib/feature-scope";
import { prisma } from "../../lib/prisma";
import { Card, EmptyState, PageHeader, SectionHead, LinkBtn } from "../components/Kit";
import { Icon } from "../components/icons";
import { SupportDayPicker } from "../components/SupportDayPicker";
import { SupportLevels } from "../components/SupportLevels";
import {
  SupportMine,
  SupportMissingCodes,
  SupportSchemeCard,
  SupportSummary,
  dayLabel,
} from "../components/SupportViews";

export const dynamic = "force-dynamic";

/** `?date=` is untrusted. Anything that is not a date is today. */
function parseDate(value: string | undefined, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requirePagePermission(
    ["ADMIN", "IT", "MANAGER", "SUPERVISOR", "ACCOUNTS", "RSO", "BP"],
    "support",
  );
  const sp = await searchParams;
  const today = dhakaTodayYmd();
  const date = parseDate(sp.date, today);
  const scope = await viewerScope(user);
  const day = await supportDay(date, scopeFilter(scope));
  const isField = user.role === "RSO" || user.role === "BP";

  /*
   * The field's own row. An RSO is matched on their employee id, a BP on the
   * retailer id it IS — a BP is an outlet, not an employee, which is why the
   * two lookups are different.
   */
  const mine = isField
    ? day.people.find((p) =>
        user.role === "BP"
          ? p.kind === "BP" && p.key === scope.selfRetailerId
          : p.kind === "RSO" && p.key === scope.selfEmployeeId,
      ) || null
    : null;

  /*
   * An RSO with no picked code earns no SLAB however many SIMs they sell, and
   * "৳0" with no explanation is the kind of silence this project keeps
   * removing. Checked directly rather than inferred from a missing row: an RSO
   * with codes and no SIMs also has no row.
   *
   * It is the SLAB that is affected, not their whole support — the SSO offer
   * counts every outlet under them, picked or not — which is why the card this
   * feeds says "slab codes" and shows only when there is nothing else to show.
   */
  const noCodes =
    user.role === "RSO" && scope.selfEmployeeId
      ? (await prisma.retailer.count({ where: { employeeId: scope.selfEmployeeId, supportEligible: true } })) === 0
      : false;

  return (
    <main className="page">
      <PageHeader
        title="Sim Support"
        subtitle={
          isField
            ? "What today's SIMs are worth to you."
            : "The day's offer, and what each RSO and BP has earned on it."
        }
        action={
          scope.canWrite ? (
            <span className="cmp-head-actions">
              <LinkBtn href="/support/schemes" variant="secondary">
                <Icon name="settings" /> Offers
              </LinkBtn>
              <LinkBtn href="/support/codes" variant="secondary">
                <Icon name="shop" /> Support codes
              </LinkBtn>
            </span>
          ) : undefined
        }
      />
      <SupportDayPicker date={date} todayYmd={today} yesterdayYmd={dhakaYesterdayYmd()} />

      {isField ? (
        <>
          <SupportMine row={mine} scheme={day.scheme} date={date} noCodes={noCodes} />
          <SectionHead title="Today's offer" sub="What the office set for this day." />
          <SupportSchemeCard scheme={day.scheme} name={day.schemeName} note={day.schemeNote} />
        </>
      ) : (
        <>
          <SectionHead title={`Offer for ${dayLabel(date)}`} />
          <SupportSchemeCard scheme={day.scheme} name={day.schemeName} note={day.schemeNote} />
          <SectionHead title="What it pays" sub="Support is counted on two codes per RSO, and a BP's own outlet." />
          <SupportSummary day={day} />
          {scope.canWrite ? <SupportMissingCodes rows={day.rsosWithoutCodes} href="/support/codes" /> : null}
          {scope.employeeIds !== null && scope.employeeIds.length === 0 ? (
            <Card padded>
              <EmptyState
                title="No team assigned to you yet"
                hint="An administrator assigns the supervisors a manager looks after, and the RSOs a supervisor looks after."
                icon={<Icon name="users" />}
              />
            </Card>
          ) : (
            <SupportLevels people={day.people} />
          )}
        </>
      )}
    </main>
  );
}

/**
 * The Sim Support screens.
 *
 * The RSO's own card is the point of the whole feature, so it is the biggest
 * thing on their page: today's money, the SIMs it was counted on, and — the
 * part the owner asked for — what one more SIM is worth. A slab reprices the
 * whole day, so at 14 SIMs the next one can be worth ৳800 rather than ৳100,
 * and an RSO who can see that goes and sells it.
 *
 * Server Components. The only interactive parts are the forms and the day
 * picker, which live in their own files.
 */

import { Badge, Card, EmptyState, SectionHead, StatPill } from "./Kit";
import { Icon } from "./icons";
import { schemeIsEmpty, slabLabel, sortedSlabs, supportNudge, type SupportSchemeRule } from "../../lib/sim-support";
import { fmtWeekdayDate } from "../../lib/format";
import { SSO_MIN_MONTHLY_STANDARD_GA } from "../../lib/business-rules";
import type { SupportDay, SupportPersonRow } from "../../lib/sim-support-data";

const num = (n: number) => n.toLocaleString("en-US");
const money = (n: number) => `৳${Math.round(n).toLocaleString("en-US")}`;

/**
 * "Wed 22 Sep 2026".
 *
 * Through `lib/format` rather than `toLocaleDateString` here: the locale and
 * the display time zone are decided in one file, and a page that picks its own
 * fails `tests/number-locale.smoke.test.ts`.
 */
export function dayLabel(ymd: string) {
  return fmtWeekdayDate(`${ymd}T00:00:00.000Z`);
}

/**
 * The day's offer, written out.
 *
 * Shown to everybody including the field, because an RSO cannot chase a target
 * they cannot see. The slabs are listed lowest first, which is the order they
 * will be crossed in.
 */
export function SupportSchemeCard({
  scheme,
  name,
  note,
}: {
  scheme: SupportSchemeRule | null;
  name: string | null;
  note: string | null;
}) {
  if (!scheme || schemeIsEmpty(scheme))
    return (
      <Card padded>
        <EmptyState
          title="No support offer for this day"
          hint="Most days carry none. When one is set, the slabs appear here and every RSO and BP can see what today is worth."
          icon={<Icon name="info" />}
        />
      </Card>
    );
  const slabs = sortedSlabs(scheme);
  const ssoRate = Number(scheme.ssoRatePerSim) || 0;
  const minSameDay = Math.max(1, Number(scheme.ssoMinSimsSameDay) || 1);
  return (
    <Card padded className="sup-scheme">
      {name ? <strong className="sup-scheme-name">{name}</strong> : null}
      {note ? <p className="kit-hint is-xs">{note}</p> : null}
      <ul className="sup-slabs">
        {slabs.map((s) => (
          <li key={s.minSims}>
            <span>{slabLabel(s)}</span>
          </li>
        ))}
        {!slabs.length ? <li className="is-muted">No SIM slabs today — only the SSO offer below.</li> : null}
      </ul>
      {ssoRate > 0 ? (
        <div className="sup-sso">
          <Badge tone="active">SSO offer running</Badge>
          <p>
            <b>Any</b> outlet under an RSO that completes SSO today earns <b>{money(ssoRate)}</b> for every SIM it does
            today — picked for the slab or not
            {minSameDay > 1 ? `, and it must do at least ${minSameDay} SIMs today to qualify` : ""}. Paid on top of the
            slab.
          </p>
          <p className="kit-hint is-xs">
            Completing means the month&apos;s count reaches {SSO_MIN_MONTHLY_STANDARD_GA} with today&apos;s SIMs — none
            before and {SSO_MIN_MONTHLY_STANDARD_GA} today, or {SSO_MIN_MONTHLY_STANDARD_GA - 1} before and one today.
            An outlet already there yesterday does not complete again. RSOs only; a BP earns the slab.
          </p>
        </div>
      ) : (
        <p className="kit-hint is-xs">No SSO offer today.</p>
      )}
      <p className="kit-hint is-xs">
        A slab pays its rate on <b>every</b> SIM of the day, not only the ones above the threshold.
      </p>
    </Card>
  );
}

/** The field's own card — the money screen. */
export function SupportMine({
  row,
  scheme,
  date,
  noCodes,
}: {
  row: SupportPersonRow | null;
  scheme: SupportSchemeRule | null;
  date: string;
  /** True for an RSO with no code picked: they can earn no SLAB. */
  noCodes: boolean;
}) {
  /*
   * Named rather than left as "৳0": the slab is paid on codes somebody has to
   * pick, and an RSO with none can do nothing about it by selling more.
   *
   * It says SLAB, not "support", because the SSO offer is NOT affected — that
   * counts every outlet under the RSO, picked or not. Shown only when there is
   * no row at all; with a row the card below already prints both halves and
   * "no slab codes picked" would contradict an SSO figure sitting beside it.
   */
  if (noCodes && !row)
    return (
      <Card padded>
        <EmptyState
          title="No slab codes picked for you yet"
          hint="The slab is paid on retailer codes the office picks. Until yours are picked you earn no slab, however many SIMs you sell — the SSO offer still counts every outlet under you. Ask IT or your manager."
          icon={<Icon name="alert" />}
        />
      </Card>
    );
  if (!row)
    return (
      <Card padded>
        <EmptyState title="Nothing counted for you on this day" hint={dayLabel(date)} icon={<Icon name="info" />} />
      </Card>
    );
  const e = row.earning;
  const nudge = supportNudge(e);
  const hasOffer = scheme && !schemeIsEmpty(scheme);
  return (
    <Card padded className="sup-mine">
      <span className="kit-label">Your support · {dayLabel(date)}</span>
      {/*
        The sub-line names WHICH SIMs the slab counted, not "SIMs counted".
        An RSO earning ৳6,400 from the SSO offer with nothing on their picked
        codes read "৳6,400 · 0 SIMs counted", which looks like a mistake.
      */}
      <p className="sup-mine-figure">
        <b>{money(e.total)}</b>
        <span>
          {num(e.sims)} SIM{e.sims === 1 ? "" : "s"} on your picked codes
          {row.ssoOutlets.length
            ? ` · ${num(row.ssoOutlets.length)} outlet${row.ssoOutlets.length === 1 ? "" : "s"} completed SSO`
            : ""}
        </span>
      </p>
      {!hasOffer ? (
        <p className="sup-mine-note">There is no support offer for this day, so nothing is payable.</p>
      ) : (
        <>
          <p className="sup-mine-note">
            {e.slab
              ? `You are on ${slabLabel(e.slab)} — ${money(e.slabAmount)} from the slab.`
              : "You have not reached the first slab yet."}
            {e.ssoBonus > 0 ? ` Plus ${money(e.ssoBonus)} from the SSO offer.` : ""}
          </p>
          {/*
            The nudge, and the reason the feature exists. `gain` is the WHOLE
            day's difference, so it can be many times the next SIM's own rate.
          */}
          {nudge ? (
            <div className="sup-nudge" role="status">
              <Icon name="target" />
              <span>{nudge}</span>
            </div>
          ) : e.slab ? (
            <p className="kit-hint is-xs">You are on the top slab for today.</p>
          ) : null}
        </>
      )}
      <SectionHead title="Slab counted on" sub="The codes the office picked for you." />
      <ul className="sup-outlets">
        {row.slabOutlets.map((o) => (
          <li key={o.retailerId}>
            <span>
              <strong>{o.retailerName || o.retailerCode}</strong>
              <em>{o.retailerCode}</em>
            </span>
            <span className="sup-outlet-right">
              <b>
                {num(o.sims)} SIM{o.sims === 1 ? "" : "s"}
              </b>
            </span>
          </li>
        ))}
        {!row.slabOutlets.length ? <li className="is-muted">No code picked for you yet.</li> : null}
      </ul>

      {/*
        The SSO offer is counted on a DIFFERENT set of outlets — every one under
        the RSO, picked or not — so it is its own list. Folding the two together
        would make the reader think the slab counted these too.
      */}
      {row.ssoOutlets.length ? (
        <>
          <SectionHead title="Completed SSO today" sub="Any outlet under you counts for this, picked or not." />
          <ul className="sup-outlets">
            {row.ssoOutlets.map((o) => (
              <li key={o.retailerId}>
                <span>
                  <strong>{o.retailerName || o.retailerCode}</strong>
                  <em>
                    {o.retailerCode} · {num(o.beforeToday)} before today
                  </em>
                </span>
                <span className="sup-outlet-right">
                  <b>
                    {num(o.sims)} SIM{o.sims === 1 ? "" : "s"}
                  </b>
                  <Badge tone="success">{money(o.bonus)}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Card>
  );
}

/** The figures above the operator's table. */
export function SupportSummary({ day }: { day: SupportDay }) {
  const earning = day.people.filter((p) => p.earning.total > 0).length;
  const sims = day.people.reduce((a, p) => a + p.earning.sims, 0);
  const ssoOutlets = day.people.reduce((a, p) => a + p.ssoOutlets.length, 0);
  return (
    <div className="kit-summary-strip">
      <Card padded>
        <StatPill value={money(day.totalPayable)} label="Payable" />
      </Card>
      {/* The two halves are shown apart because they are counted on different
          outlets — see the note at the top of lib/sim-support-data.ts. */}
      <Card padded>
        <StatPill value={money(day.totalSlab)} label="From slabs" />
      </Card>
      <Card padded>
        <StatPill value={money(day.totalSso)} label="From the SSO offer" />
      </Card>
      <Card padded>
        <StatPill value={num(sims)} label="SIMs on picked codes" />
      </Card>
      <Card padded>
        <StatPill value={num(ssoOutlets)} label="Outlets completing SSO" />
      </Card>
      <Card padded>
        <StatPill value={`${num(earning)} of ${num(day.people.length)}`} label="Earning today" />
      </Card>
    </div>
  );
}

/**
 * RSOs who cannot earn, named.
 *
 * Support is paid on two codes per RSO and somebody has to pick them. An RSO
 * with none reads "৳0" and has no way to know why, so the operator screens say
 * who is missing and link to where it is fixed.
 */
export function SupportMissingCodes({ rows, href }: { rows: SupportDay["rsosWithoutCodes"]; href: string }) {
  if (!rows.length) return null;
  return (
    <div className="kit-note is-warn" role="status">
      <Icon name="alert" />
      <span>
        {rows.length.toLocaleString("en-US")} RSO{rows.length === 1 ? "" : "s"} have no support code set, so they can
        earn nothing whatever they sell:{" "}
        {rows
          .slice(0, 4)
          .map((r) => r.name)
          .join(", ")}
        {rows.length > 4 ? ` and ${rows.length - 4} more` : ""}. <a href={href}>Set their codes →</a>
      </span>
    </div>
  );
}

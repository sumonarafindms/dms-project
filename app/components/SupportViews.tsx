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
import {
  SLAB_BASIS_LABEL,
  SPLIT_TIERS,
  SUPPORT_TIER_LABEL,
  isSplit,
  ladderSlabs,
  offerMessage,
  schemeIsEmpty,
  slabLabel,
  supportNudges,
  type SlabBasis,
  type SupportEarning,
  type SupportSchemeRule,
  type SupportTier,
} from "../../lib/sim-support";
import { SupportOfferMessage } from "./SupportOfferMessage";
import type { SchemeFormValues } from "./SupportSchemeForm";
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

/** A saved scheme row, as the form wants it. One mapping, used by both new and edit. */
export function schemeFormValues(row: {
  id: string;
  date: Date;
  name: string | null;
  note: string | null;
  active: boolean;
  ssoRatePerSim: unknown;
  ssoMinSimsSameDay: number | null;
  slabBasis: SlabBasis;
  dailyTarget: number | null;
  slabs: { tier: SupportTier; minSims: number; ratePerSim: unknown }[];
}): SchemeFormValues {
  return {
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
    name: row.name,
    note: row.note,
    active: row.active,
    ssoRatePerSim:
      row.ssoRatePerSim === null || row.ssoRatePerSim === undefined ? "" : String(Number(row.ssoRatePerSim)),
    ssoMinSimsSameDay: row.ssoMinSimsSameDay,
    slabBasis: row.slabBasis,
    dailyTarget: row.dailyTarget,
    slabs: row.slabs.map((s) => ({ tier: s.tier, minSims: s.minSims, ratePerSim: String(Number(s.ratePerSim)) })),
  };
}

/**
 * One ladder as a column of steps — "5 GA ➜ ৳50/SIM" — with the step the
 * reader is on lit, when there is a reader.
 */
function LadderSteps({
  scheme,
  tier,
  onStep,
  compact,
}: {
  scheme: SupportSchemeRule;
  tier: SupportTier;
  onStep?: number | null;
  compact?: boolean;
}) {
  const slabs = ladderSlabs(scheme, tier);
  return (
    <section className={`sup-ladder is-${tier.toLowerCase()}${compact ? " is-compact" : ""}`}>
      <header className="sup-ladder-head">
        <strong>
          <Icon name="sim" /> {tier === "ALL" ? "SIM bonus" : `${SUPPORT_TIER_LABEL[tier]} bonus`}
        </strong>
      </header>
      <ol className="sup-steps-list">
        {slabs.map((s) => (
          <li key={s.minSims} className={onStep === s.minSims ? "is-on" : undefined}>
            <span>{num(s.minSims)} GA</span>
            <i aria-hidden="true">➜</i>
            <b>{money(s.ratePerSim)}</b>
            <em>/SIM</em>
          </li>
        ))}
        {!slabs.length ? <li className="is-muted">No steps</li> : null}
      </ol>
    </section>
  );
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
  date,
  showMessage,
}: {
  scheme: SupportSchemeRule | null;
  name: string | null;
  note: string | null;
  date?: string;
  /** The office's copy of the WhatsApp message. The field does not need it. */
  showMessage?: boolean;
}) {
  if (!scheme || schemeIsEmpty(scheme))
    return (
      <Card padded>
        <EmptyState
          title="No support offer for this day"
          hint="Most days carry none. When one is set, the steps appear here and every RSO and BP can see what today is worth."
          icon={<Icon name="info" />}
        />
      </Card>
    );
  const split = isSplit(scheme);
  const tiers: SupportTier[] = split ? [...SPLIT_TIERS] : ["ALL"];
  const ssoRate = Number(scheme.ssoRatePerSim) || 0;
  const minSameDay = Math.max(1, Number(scheme.ssoMinSimsSameDay) || 1);
  const target = Number(scheme.dailyTarget) || 0;
  const hasSteps = scheme.slabs.length > 0;
  return (
    <Card padded className="sup-scheme">
      <div className="sup-offer-hero">
        <div>
          <strong className="sup-scheme-name">{name || "BP & RSO Warriors"}</strong>
          {note ? <p className="kit-hint is-xs">{note}</p> : null}
        </div>
        {target > 0 ? (
          <div className="sup-target">
            <Icon name="target" />
            <span>
              Today&apos;s target <b>{num(target)}+ GA</b>
            </span>
          </div>
        ) : null}
      </div>
      {hasSteps ? (
        <div className={`sup-ladders${split ? " is-split" : ""}`}>
          {tiers.map((t) => (
            <LadderSteps key={t} scheme={scheme} tier={t} />
          ))}
        </div>
      ) : (
        <p className="kit-hint is-xs">No SIM bonus today — only the SSO offer below.</p>
      )}
      {split ? (
        <p className="kit-hint is-xs">
          {/* v203: the only reading of a split offer (lib/sim-support.ts SlabBasis). */}
          <b>{SLAB_BASIS_LABEL.OWN}.</b> The 300৳ SIMs alone decide the 300৳ bonus, and the 170৳ SIMs alone the 170৳
          bonus — a ladder pays only when its own SIMs reach one of its steps.
        </p>
      ) : null}
      {ssoRate > 0 ? (
        <div className="sup-sso">
          <Badge tone="active">SSO offer running</Badge>
          <p>
            <b>Any</b> outlet under an RSO that completes SSO today earns <b>{money(ssoRate)}</b> for every SIM it does
            today — picked for the slab or not
            {minSameDay > 1 ? `, and it must do at least ${minSameDay} SIMs today to qualify` : ""}. Paid on top of the
            SIM bonus.
          </p>
          <p className="kit-hint is-xs">
            Completing means the month&apos;s count reaches {SSO_MIN_MONTHLY_STANDARD_GA} with today&apos;s SIMs — none
            before and {SSO_MIN_MONTHLY_STANDARD_GA} today, or {SSO_MIN_MONTHLY_STANDARD_GA - 1} before and one today.
            An outlet already there yesterday does not complete again. RSOs only; a BP earns the SIM bonus.
          </p>
        </div>
      ) : (
        <p className="kit-hint is-xs">No SSO offer today.</p>
      )}
      <p className="kit-hint is-xs">
        A step pays its rate on <b>every</b> SIM of the day, not only the ones above it.
      </p>
      {showMessage && date ? (
        <SupportOfferMessage text={offerMessage(scheme, { dateYmd: date, name, note })} collapsed />
      ) : null}
    </Card>
  );
}

/** "300৳ SIM 6 · 170৳ SIM 4" — the counted SIMs by type, for a split day. */
function splitLine(e: SupportEarning) {
  return `${SUPPORT_TIER_LABEL.GA_300} ${num(e.ga300)} · ${SUPPORT_TIER_LABEL.GA_170} ${num(e.ga170)}`;
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
  const nudges = supportNudges(e);
  const hasOffer = scheme && !schemeIsEmpty(scheme);
  const target = Number(scheme?.dailyTarget) || 0;
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
          {e.split ? ` (${splitLine(e)})` : ""}
          {row.ssoOutlets.length
            ? ` · ${num(row.ssoOutlets.length)} outlet${row.ssoOutlets.length === 1 ? "" : "s"} completed SSO`
            : ""}
        </span>
      </p>
      {!hasOffer ? (
        <p className="sup-mine-note">There is no support offer for this day, so nothing is payable.</p>
      ) : (
        <>
          {target > 0 ? (
            <div className="sup-progress" aria-label={`${num(e.sims)} of ${num(target)} GA target`}>
              <div className="sup-progress-bar">
                <span style={{ width: `${Math.min(100, Math.round((e.sims / target) * 100))}%` }} />
              </div>
              <em>
                {num(e.sims)} of today&apos;s {num(target)}+ GA target
                {e.sims >= target ? " — reached" : ` — ${num(target - e.sims)} to go`}
              </em>
            </div>
          ) : null}
          {e.split ? (
            <ul className="sup-mine-ladders">
              {e.ladders.map((l) => (
                <li key={l.tier}>
                  <span>
                    <strong>{SUPPORT_TIER_LABEL[l.tier]}</strong>
                    <em>
                      {num(l.sims)} SIM{l.sims === 1 ? "" : "s"}
                      {l.slab
                        ? ` · ${num(l.slab.minSims)} GA step, ${money(l.slab.ratePerSim)} each`
                        : " · below the first step"}
                    </em>
                  </span>
                  <b>{money(l.amount)}</b>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="sup-mine-note">
            {e.split
              ? `${money(e.slabAmount)} from the SIM bonus.`
              : e.slab
                ? `You are on ${slabLabel(e.slab)} — ${money(e.slabAmount)} from the slab.`
                : "You have not reached the first slab yet."}
            {e.ssoBonus > 0 ? ` Plus ${money(e.ssoBonus)} from the SSO offer.` : ""}
          </p>
          {/*
            The nudge, and the reason the feature exists. `gain` is the WHOLE
            day's difference, so it can be many times the next SIM's own rate.
          */}
          {nudges.length ? (
            nudges.map((text) => (
              <div className="sup-nudge" role="status" key={text}>
                <Icon name="target" />
                <span>{text}</span>
              </div>
            ))
          ) : e.slab || e.ladders.some((l) => l.slab) ? (
            <p className="kit-hint is-xs">You are on the top step for today.</p>
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
              {e.split && o.sims ? (
                <em>
                  300 · {num(o.ga300)} &nbsp; 170 · {num(o.ga170)}
                </em>
              ) : null}
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
  const ga170 = day.people.reduce((a, p) => a + p.earning.ga170, 0);
  const ga300 = day.people.reduce((a, p) => a + p.earning.ga300, 0);
  const ssoOutlets = day.people.reduce((a, p) => a + p.ssoOutlets.length, 0);
  return (
    <div className="kit-summary-strip">
      <Card padded>
        <StatPill value={money(day.totalPayable)} label="Payable" />
      </Card>
      {/* The two halves are shown apart because they are counted on different
          outlets — see the note at the top of lib/sim-support-data.ts. */}
      <Card padded>
        <StatPill value={money(day.totalSlab)} label="From the SIM bonus" />
      </Card>
      <Card padded>
        <StatPill value={money(day.totalSso)} label="From the SSO offer" />
      </Card>
      <Card padded>
        <StatPill value={num(sims)} label="SIMs on picked codes" />
      </Card>
      {day.scheme && isSplit(day.scheme) ? (
        <>
          <Card padded>
            <StatPill value={num(ga300)} label={`${SUPPORT_TIER_LABEL.GA_300}s counted`} />
          </Card>
          <Card padded>
            <StatPill value={num(ga170)} label={`${SUPPORT_TIER_LABEL.GA_170}s counted`} />
          </Card>
        </>
      ) : null}
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

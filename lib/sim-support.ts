/**
 * Sim Support — what an RSO or BP earns for the SIMs they sold today.
 *
 * ## The scheme
 *
 * IT sets a scheme for a DAY. It holds slabs, each a threshold and a rate:
 *
 *     from  4 SIMs -> ৳10 per SIM
 *     from  6 SIMs -> ৳50 per SIM
 *     from 15 SIMs -> ৳100 per SIM
 *
 * A slab reprices the WHOLE day, it does not pay a margin on the SIMs above
 * the threshold. That is the owner's own arithmetic, and it is worth writing
 * down because the other reading is the obvious one and gives different money:
 *
 *     14 SIMs -> 14 x ৳50  = ৳700     (highest slab reached is "from 6")
 *     15 SIMs -> 15 x ৳100 = ৳1,500   (the "from 15" slab now applies)
 *
 * One more SIM is worth ৳800 there, not ৳100. Showing that is the whole point
 * of the screen: the RSO can see that the next SIM is worth eight times the
 * last one, and goes and sells it.
 *
 * ## Which SIMs count
 *
 * Not all of them. Support is paid on **two retailer codes per RSO**, chosen in
 * advance and marked on the retailer (`Retailer.supportEligible`). A BP is paid
 * on the outlet they hold as a BP and nothing else. SIMs on any other code are
 * real GA and count everywhere else in this app; they are simply not what this
 * money is for.
 *
 * ## The SSO offer, which is not every day
 *
 * Some days carry a second, separate payment: a retailer that had not yet
 * completed SSO and completes it today earns a rate on every SIM it did today.
 * It is an offer, not a rule — most days have no SSO rate at all — and when it
 * runs it is paid ON TOP of the slab, because the two are paid for different
 * things.
 *
 * Both shapes the owner described fall out of one rule:
 *
 *   - "two SIMs today and they get it" is the case where the outlet had none
 *     before, so today's two are what complete it;
 *   - "one before and one today, and they get today's" is the case where the
 *     outlet had one already, so today's single SIM is what completes it.
 *
 * In both, what is paid is **the SIMs done on the completing day**, which is
 * what `ssoQualifies` and `ssoBonusFor` below compute. `minSimsSameDay` exists
 * for the stricter form of the offer and defaults to 1, which is no condition
 * at all.
 *
 * Nothing in this file touches the database or the clock: it is arithmetic over
 * numbers a caller has already counted, so the rules can be tested without a
 * server and the same functions run on both sides of the RSC boundary.
 */

/** One step of a scheme. `minSims` is inclusive: "from N SIMs". */
export type SupportSlabRule = {
  minSims: number;
  ratePerSim: number;
};

export type SupportSchemeRule = {
  /** Sorted or not — `slabFor` does not care. */
  slabs: SupportSlabRule[];
  /** Per-SIM rate for an outlet that completes SSO today. 0 or null: no offer. */
  ssoRatePerSim?: number | null;
  /**
   * The stricter form of the SSO offer: "do at least this many SIMs on the day
   * itself". 1 (the default) means the only condition is completing SSO.
   */
  ssoMinSimsSameDay?: number | null;
};

/** A scheme with no slab and no SSO rate pays nothing and should say so. */
export function schemeIsEmpty(scheme: SupportSchemeRule) {
  return !scheme.slabs.some((s) => s.ratePerSim > 0) && !(Number(scheme.ssoRatePerSim) > 0);
}

/**
 * The slabs in the order a reader expects, lowest threshold first.
 *
 * Sorted on a COPY. `slabFor` is called once per employee per day, and sorting
 * the caller's array in place would reorder a list the page is also rendering.
 */
export function sortedSlabs(scheme: SupportSchemeRule): SupportSlabRule[] {
  return [...scheme.slabs].filter((s) => Number.isFinite(s.minSims)).sort((a, b) => a.minSims - b.minSims);
}

/** The highest slab this many SIMs reaches, or null below every threshold. */
export function slabFor(scheme: SupportSchemeRule, sims: number): SupportSlabRule | null {
  let best: SupportSlabRule | null = null;
  for (const slab of scheme.slabs) {
    if (sims < slab.minSims) continue;
    if (!best || slab.minSims > best.minSims) best = slab;
  }
  return best;
}

/** What the slabs alone pay for this many SIMs. */
export function slabAmount(scheme: SupportSchemeRule, sims: number): number {
  const slab = slabFor(scheme, sims);
  if (!slab || sims <= 0) return 0;
  return sims * slab.ratePerSim;
}

/**
 * The next threshold above this count, and what reaching it would pay.
 *
 * `gain` is the WHOLE-DAY difference, not the rate of the next slab — that is
 * the number worth chasing. At 14 SIMs under the example above it is ৳800.
 */
export type SupportNextStep = {
  /** SIMs needed in total to reach it. */
  atSims: number;
  /** SIMs still to sell. Always at least 1. */
  moreSims: number;
  ratePerSim: number;
  /** Total support at that count. */
  amount: number;
  /** That total minus what is earned now. */
  gain: number;
};

export function nextStep(scheme: SupportSchemeRule, sims: number): SupportNextStep | null {
  const above = sortedSlabs(scheme).find((s) => s.minSims > sims);
  if (!above) return null;
  const amount = slabAmount(scheme, above.minSims);
  return {
    atSims: above.minSims,
    moreSims: above.minSims - sims,
    ratePerSim: above.ratePerSim,
    amount,
    gain: amount - slabAmount(scheme, sims),
  };
}

/**
 * Did this outlet complete SSO today?
 *
 * `beforeToday` is the outlet's standard-GA count for the month UP TO
 * yesterday, `today` is today's. Completing means crossing the threshold with
 * today's SIMs: an outlet that was already complete yesterday does not
 * complete again, and the offer is for completing.
 */
export function ssoQualifies(args: {
  simSeller: boolean;
  threshold: number;
  beforeToday: number;
  today: number;
  minSimsSameDay?: number | null;
}) {
  const { simSeller, threshold, beforeToday, today } = args;
  const minSameDay = Math.max(1, Number(args.minSimsSameDay) || 1);
  if (!simSeller) return false;
  if (today < minSameDay) return false;
  if (beforeToday >= threshold) return false;
  return beforeToday + today >= threshold;
}

/** The SSO offer's payment for one qualifying outlet: today's SIMs, at the rate. */
export function ssoBonusFor(scheme: SupportSchemeRule, simsToday: number) {
  const rate = Number(scheme.ssoRatePerSim) || 0;
  if (rate <= 0 || simsToday <= 0) return 0;
  return simsToday * rate;
}

/**
 * One person's support for one day.
 *
 * `eligibleSims` is already narrowed to the codes that earn support — see the
 * note at the top of this file. `ssoBonus` is the sum over that person's
 * outlets that completed SSO today; it is passed in rather than computed here
 * because deciding which outlets completed needs the database.
 */
export type SupportEarning = {
  sims: number;
  slab: SupportSlabRule | null;
  slabAmount: number;
  ssoBonus: number;
  total: number;
  next: SupportNextStep | null;
};

export function supportEarning(scheme: SupportSchemeRule, eligibleSims: number, ssoBonus = 0): SupportEarning {
  const slab = slabFor(scheme, eligibleSims);
  const base = slabAmount(scheme, eligibleSims);
  return {
    sims: eligibleSims,
    slab,
    slabAmount: base,
    ssoBonus,
    total: base + ssoBonus,
    next: nextStep(scheme, eligibleSims),
  };
}

/** "From 6 SIMs — ৳50 each" */
export function slabLabel(slab: SupportSlabRule) {
  return `From ${slab.minSims.toLocaleString("en-US")} SIM${slab.minSims === 1 ? "" : "s"} — ৳${slab.ratePerSim.toLocaleString("en-US")} each`;
}

/**
 * The sentence the RSO's screen shows under the figure.
 *
 * The total it names includes the SSO bonus, and that is not cosmetic. The
 * slab step's own `amount` is slab-only, so an RSO earning ৳6,400 from the SSO
 * offer and nothing from the slab was told that four more SIMs "takes today's
 * support to ৳40" — which reads as a cut of ৳6,360 for selling more. The
 * bonus is already earned and does not move, so it is added to both sides and
 * `gain` stays what the extra SIMs are actually worth.
 *
 * Deliberately not "you earn ৳X" when there is nothing to reach: on a day with
 * no scheme the honest answer is that there is no offer, and v175's rule holds
 * — a figure nobody set is not zero.
 */
export function supportNudge(earning: SupportEarning): string | null {
  if (!earning.next) return null;
  const { moreSims, gain, atSims } = earning.next;
  if (gain <= 0) return null;
  const total = earning.next.amount + earning.ssoBonus;
  return `${moreSims.toLocaleString("en-US")} more SIM${moreSims === 1 ? "" : "s"} on your picked codes — ${atSims.toLocaleString("en-US")} in total — takes today's support to ৳${total.toLocaleString("en-US")}, which is ৳${gain.toLocaleString("en-US")} more.`;
}

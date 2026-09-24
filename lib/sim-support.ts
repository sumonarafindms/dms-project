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

/**
 * Which SIMs a slab is for.
 *
 * `ALL` is the original single ladder: every standard SIM counts toward it and
 * is paid at its rate. `GA_170` and `GA_300` are the two ladders the owner runs
 * most days — "300৳ SIM Bonus" and "170৳ SIM Bonus" — each paying its own rate
 * on its own SIMs. A scheme is one or the other, never both: see `isSplit`.
 */
export type SupportTier = "ALL" | "GA_170" | "GA_300";

/** The two SIM ladders, in the order the owner's offer message lists them. */
export const SPLIT_TIERS = ["GA_300", "GA_170"] as const;
export type SplitTier = (typeof SPLIT_TIERS)[number];

export const SUPPORT_TIER_LABEL: Record<SupportTier, string> = {
  ALL: "Every SIM",
  GA_170: "170৳ SIM",
  GA_300: "300৳ SIM",
};

/**
 * On a split scheme, which count picks the step.
 *
 * v203 — the owner's ruling, with a screenshot of a BP paid ৳315 for 3 × 300৳
 * and 4 × 170৳ SIMs on a "7+" step: *"jokhon alada alada offer diya hobe ...
 * jokhon 150 takar sorto milbe tokhon 150 takar offer pabe ... 150 takar sim
 * korce 4ta and 300 takar sim korce 5 ta tahole sudu 300 takar sim ar offer
 * pabe ... but tumi akhon total hisab kore tar por offer ar taka dou ..
 * aita alada hobe"*.
 *
 * So on a split day EACH SIM TYPE CLIMBS ITS OWN LADDER on its own count — 5
 * 300৳ SIMs reach the 300 ladder's 5 step; 4 170৳ SIMs do not reach a 5 step
 * on the 170 ladder and earn nothing, whatever the day's total. There is no
 * other way to read a split offer any more.
 *
 * `TOTAL` remains only as a value an old row may carry in the database
 * (SupportScheme.slabBasis); it is read as `OWN`. The v203 migration moved
 * every saved offer to `OWN`.
 */
export type SlabBasis = "TOTAL" | "OWN";

export const SLAB_BASIS_LABEL: Record<SlabBasis, string> = {
  TOTAL: "Each SIM type climbs its own ladder",
  OWN: "Each SIM type climbs its own ladder",
};

/** One step of a scheme. `minSims` is inclusive: "from N SIMs". */
export type SupportSlabRule = {
  minSims: number;
  ratePerSim: number;
  /** Absent means `ALL` — every scheme saved before the split. */
  tier?: SupportTier;
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
  /** Split schemes only. Always read as `OWN` since v203 — see `SlabBasis`. */
  basis?: SlabBasis | null;
  /** "আজকের টার্গেট: 25+ GA". Shown, never paid on its own. */
  dailyTarget?: number | null;
};

/** Does this scheme run the two SIM ladders rather than one? */
export function isSplit(scheme: SupportSchemeRule) {
  return scheme.slabs.some((s) => s.tier === "GA_170" || s.tier === "GA_300");
}

/**
 * One ladder of a scheme, as a scheme of its own.
 *
 * Every single-ladder function below (`slabFor`, `slabAmount`, `nextStep`) takes
 * the result, so the arithmetic that was pinned before the split is the same
 * arithmetic now — a ladder is just a narrower list of slabs.
 */
export function ladder(scheme: SupportSchemeRule, tier: SupportTier): SupportSchemeRule {
  return { ...scheme, slabs: scheme.slabs.filter((s) => (s.tier ?? "ALL") === tier) };
}

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
 * The SIMs a person is paid on, by type.
 *
 * `total` is carried rather than derived so a caller that only knows the total
 * (a single-ladder day, or an old test) can pass a bare number: see `counts`.
 */
export type SimCounts = { total: number; ga170: number; ga300: number };

export function counts(value: number | SimCounts): SimCounts {
  return typeof value === "number" ? { total: value, ga170: 0, ga300: 0 } : value;
}

/** One ladder's share of a person's day. */
export type LadderEarning = {
  tier: SupportTier;
  /** The SIMs this ladder pays on. */
  sims: number;
  /** The count that picked the step — this ladder's own SIM count on a split day. */
  stepCount: number;
  slab: SupportSlabRule | null;
  amount: number;
};

/**
 * One person's support for one day.
 *
 * `eligible` is already narrowed to the codes that earn support — see the note
 * at the top of this file. `ssoBonus` is the sum over that person's outlets
 * that completed SSO today; it is passed in rather than computed here because
 * deciding which outlets completed needs the database.
 *
 * `slab`, `slabAmount` and `next` keep their single-ladder meaning. On a split
 * day `slab` is null (there is no one slab) and `ladders` says what each SIM
 * type earned; `slabAmount` is still the sum, so every total on every screen
 * is computed the same way whichever kind of day it is.
 */
export type SupportEarning = {
  sims: number;
  ga170: number;
  ga300: number;
  split: boolean;
  basis: SlabBasis;
  ladders: LadderEarning[];
  slab: SupportSlabRule | null;
  slabAmount: number;
  ssoBonus: number;
  total: number;
  next: SupportNextStep | null;
  /** Split days: the next step on each ladder, each on its own SIM count. */
  nextSplit: SplitNextStep[];
};

/**
 * The next step on a split day: one per ladder, each counting its own SIM
 * type, so the extra SIMs are of that type and `amount` includes them.
 * (`tier: null` was the shared step of the retired `TOTAL` reading.)
 */
export type SplitNextStep = {
  tier: SplitTier;
  atSims: number;
  moreSims: number;
  rates: Partial<Record<SplitTier, number>>;
  amount: number;
  gain: number;
};

function splitAmount(scheme: SupportSchemeRule, c: SimCounts) {
  const out: LadderEarning[] = [];
  for (const tier of SPLIT_TIERS) {
    const rule = ladder(scheme, tier);
    if (!rule.slabs.length) continue;
    const sims = tier === "GA_170" ? c.ga170 : c.ga300;
    // v203: each ladder on its OWN count — never the day's total.
    const stepCount = sims;
    const slab = slabFor(rule, stepCount);
    out.push({ tier, sims, stepCount, slab, amount: slab && sims > 0 ? sims * slab.ratePerSim : 0 });
  }
  return out;
}

function splitNext(scheme: SupportSchemeRule, c: SimCounts): SplitNextStep[] {
  const steps: SplitNextStep[] = [];
  for (const tier of SPLIT_TIERS) {
    const rule = ladder(scheme, tier);
    const sims = tier === "GA_170" ? c.ga170 : c.ga300;
    const step = nextStep(rule, sims);
    if (!step) continue;
    const now = slabAmount(rule, sims);
    steps.push({
      tier,
      atSims: step.atSims,
      moreSims: step.moreSims,
      rates: { [tier]: step.ratePerSim },
      amount: step.amount,
      gain: step.amount - now,
    });
  }
  return steps;
}

export function supportEarning(scheme: SupportSchemeRule, eligible: number | SimCounts, ssoBonus = 0): SupportEarning {
  const c = counts(eligible);
  // v203: a split day is always read ladder by ladder (see `SlabBasis`).
  const basis: SlabBasis = "OWN";
  if (isSplit(scheme)) {
    const ladders = splitAmount(scheme, c);
    const base = ladders.reduce((a, l) => a + l.amount, 0);
    return {
      sims: c.total,
      ga170: c.ga170,
      ga300: c.ga300,
      split: true,
      basis,
      ladders,
      slab: null,
      slabAmount: base,
      ssoBonus,
      total: base + ssoBonus,
      next: null,
      nextSplit: splitNext(scheme, c),
    };
  }
  const single = ladder(scheme, "ALL");
  const slab = slabFor(single, c.total);
  const base = slabAmount(single, c.total);
  return {
    sims: c.total,
    ga170: c.ga170,
    ga300: c.ga300,
    split: false,
    basis,
    ladders: single.slabs.length ? [{ tier: "ALL", sims: c.total, stepCount: c.total, slab, amount: base }] : [],
    slab,
    slabAmount: base,
    ssoBonus,
    total: base + ssoBonus,
    next: nextStep(single, c.total),
    nextSplit: [],
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

const n = (v: number) => v.toLocaleString("en-US");

/**
 * Every sentence the RSO's screen should show under the figure.
 *
 * A single-ladder day has at most one (`supportNudge`). A split day can have
 * one per SIM type, each counting its own SIMs (v203). The same rule
 * as `supportNudge` holds for all of them: the total named includes the SSO
 * bonus, and the gain is what the extra SIMs are actually worth.
 */
export function supportNudges(earning: SupportEarning): string[] {
  if (!earning.split) {
    const one = supportNudge(earning);
    return one ? [one] : [];
  }
  const out: string[] = [];
  for (const step of earning.nextSplit) {
    if (step.gain <= 0) continue;
    out.push(
      `${n(step.moreSims)} more ${SUPPORT_TIER_LABEL[step.tier]}${step.moreSims === 1 ? "" : "s"} — ${n(step.atSims)} in total — takes your ${SUPPORT_TIER_LABEL[step.tier]} support to ৳${n(step.amount)}, ৳${n(step.gain)} more.`,
    );
  }
  return out;
}

/** The slabs of one ladder, lowest first. */
export function ladderSlabs(scheme: SupportSchemeRule, tier: SupportTier) {
  return sortedSlabs(ladder(scheme, tier));
}

/**
 * Steps where a HIGHER count pays a LOWER rate than the step before it.
 *
 * Not an error — the company could mean it — but it is exactly what a typo
 * looks like ("25 GA ➜ ৳10" after "20 GA ➜ ৳70"), and on a scheme that
 * reprices the whole day it would cut an RSO's money for selling more. The form
 * shows these before saving; nothing refuses them.
 */
export function rateDrops(scheme: SupportSchemeRule) {
  const out: { tier: SupportTier; minSims: number; rate: number; previousRate: number }[] = [];
  for (const tier of ["ALL", ...SPLIT_TIERS] as SupportTier[]) {
    const slabs = ladderSlabs(scheme, tier);
    for (let i = 1; i < slabs.length; i++)
      if (slabs[i].ratePerSim < slabs[i - 1].ratePerSim)
        out.push({ tier, minSims: slabs[i].minSims, rate: slabs[i].ratePerSim, previousRate: slabs[i - 1].ratePerSim });
  }
  return out;
}

/**
 * The offer as the owner posts it to the field's group.
 *
 * His own layout, from his own message — the heading, the date as dd/mm/yy,
 * the target, then one block per SIM type, 300 first. Built from the saved
 * scheme so the text the office pastes and the money the app pays cannot
 * disagree: edit the offer and the message changes with it.
 */
export function offerMessage(
  scheme: SupportSchemeRule,
  opts: { dateYmd: string; name?: string | null; note?: string | null },
): string {
  const lines: string[] = [];
  lines.push(`🔥🚨 ${(opts.name || "BP & RSO WARRIORS").toUpperCase()} 🚨🔥`);
  // No day picked yet (the form, before the date is typed): no date line.
  if (/^\d{4}-\d{2}-\d{2}$/.test(opts.dateYmd)) {
    const [y, m, d] = opts.dateYmd.split("-");
    lines.push(`${d}/${m}/${y.slice(2)}`);
  }
  const target = Number(scheme.dailyTarget) || 0;
  if (target > 0) lines.push(`🎯 আজকের টার্গেট: ${n(target)}+ GA 💪`);
  const block = (tier: SupportTier, heading: string) => {
    const slabs = ladderSlabs(scheme, tier);
    if (!slabs.length) return;
    lines.push(heading);
    for (const s of slabs) lines.push(`• ${n(s.minSims)} GA ➜ ৳${n(s.ratePerSim)}/SIM`);
  };
  if (isSplit(scheme)) {
    block("GA_300", "💸 300৳ SIM Bonus");
    block("GA_170", "💸 170৳ SIM Bonus");
    // v203: always — each SIM type's own count decides its own bonus.
    lines.push("(প্রতিটি SIM-এর GA আলাদা ভাবে গণনা হবে)");
  } else {
    block("ALL", "💸 SIM Bonus");
  }
  const sso = Number(scheme.ssoRatePerSim) || 0;
  if (sso > 0) lines.push(`🎁 SSO Offer: নতুন SSO complete হলে ৳${n(sso)}/SIM`);
  if (opts.note) lines.push(opts.note);
  lines.push(target > 0 ? `🚀 ${n(target)}+ GA করুন, Bonus জিতুন!` : "🚀 GA করুন, Bonus জিতুন!");
  lines.push("🏆 No Excuses, Only Results!");
  return lines.join("\n");
}

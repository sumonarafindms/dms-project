/**
 * What each GA category is CALLED on screen.
 *
 * Split out of lib/business-rules.ts and kept dependency-free for the same
 * reason lib/achievement.ts was: business-rules imports `@prisma/client` for
 * its where-input types, and `/ga` is a client component. Importing the rules
 * module there drags Prisma into the browser bundle, which
 * tests/client-bundle.smoke.test.ts fails on — and did, the moment these labels
 * were first put in the wrong file.
 *
 * business-rules.ts re-exports all of it, so server code keeps importing its
 * business rules from the one place it always has.
 *
 * ## Why the words live anywhere at all
 *
 * The same 170-tier count was labelled three different ways: "150" on the GA
 * page — under a note reading "selling price 170" — "170 GA" on the BP sales
 * page, and "150 pack" in the BP activation list. The field holding it was
 * called `ga150`, a name frozen at a tariff that had already moved twice.
 *
 * 170 and 300 are CATEGORY names, the way the business says them, not live
 * prices. What a 170 SIM costs today is whatever `ga170Tariff` reads out of the
 * data; the category is still called 170.
 */

export type GaCategory = "GA_170" | "GA_300" | "SIM_SWAP" | "UNKNOWN";

export const GA_CATEGORY_LABEL: Record<GaCategory, string> = {
  GA_170: "GA 170",
  GA_300: "GA 300",
  SIM_SWAP: "SIM swap",
  UNKNOWN: "Unclassified",
};

export function gaCategoryLabel(category: GaCategory) {
  return GA_CATEGORY_LABEL[category];
}

/**
 * A standard-GA count and its two tiers, kept together.
 *
 * ## Why `total` is not a separate number
 *
 * The owner asked for the 170/300 split under every GA figure, so that an RSO
 * can see which SIM is moving. The moment a screen shows a total and its parts,
 * the reader adds them up — and if they do not agree the app looks broken even
 * when all three numbers are individually right.
 *
 * That was a live risk: an RSO who holds a Business Partner has the BP's GA
 * added into their total by `lib/bp-ledger.ts`, and the ledger used to carry
 * the count with the category thrown away. The total would have been the
 * territory's and the two tiers only the RSO's own outlets.
 *
 * So the invariant is structural rather than remembered: `addTier` is the ONLY
 * way to put a number in, and it moves `total` and one tier together or does
 * nothing at all. A swap or an unclassified row cannot reach `total`, because
 * there is no branch that would let it.
 */
export type GaTiers = { total: number; ga170: number; ga300: number };

export const noTiers = (): GaTiers => ({ total: 0, ga170: 0, ga300: 0 });

/** Add `count` rows of one category. Anything that is not a tier is ignored. */
export function addTier(into: GaTiers, category: GaCategory, count = 1): GaTiers {
  if (category === "GA_170") {
    into.ga170 += count;
    into.total += count;
  } else if (category === "GA_300") {
    into.ga300 += count;
    into.total += count;
  }
  return into;
}

/** Merge one set of tiers into another, keeping the invariant. */
export function addTiers(into: GaTiers, from: GaTiers): GaTiers {
  into.ga170 += from.ga170;
  into.ga300 += from.ga300;
  into.total += from.total;
  return into;
}

/**
 * "GA 170 12 · GA 300 9" — the sub-line under a GA figure.
 *
 * One spelling, built from the labels above, so the split reads the same on the
 * RSO's home, the BP's ring, a team card and an attention row. Returns null
 * when there is nothing to split, so a caller can drop it in unconditionally
 * and an empty month stays quiet instead of printing "GA 170 0 · GA 300 0".
 */
export function gaTierLine(tiers: GaTiers | null | undefined): string | null {
  if (!tiers || tiers.total <= 0) return null;
  return `${GA_CATEGORY_LABEL.GA_170} ${tiers.ga170} · ${GA_CATEGORY_LABEL.GA_300} ${tiers.ga300}`;
}

/**
 * The same split, as two labelled figures rather than one sentence.
 *
 * `gaTierLine` stays: a CSV note, an Excel cell and a feed summary all want a
 * string, and it is the one place the wording is written. On a SCREEN the
 * string was the wrong shape — inside a KPI card half a phone wide,
 * "GA 170 1035 · GA 300 540" wrapped wherever it ran out of room, which put
 * "GA 300" on one line and "540" on the next, so the reader had to reassemble
 * a figure that had been split in half. Two parts wrap as two parts.
 *
 * Same labels, same source, same null-when-empty rule, so the two cannot
 * drift apart or start saying different things.
 */
export function gaTierParts(tiers: GaTiers | null | undefined): { label: string; value: string }[] | null {
  if (!tiers || tiers.total <= 0) return null;
  return [
    { label: GA_CATEGORY_LABEL.GA_170, value: tiers.ga170.toLocaleString("en-US") },
    { label: GA_CATEGORY_LABEL.GA_300, value: tiers.ga300.toLocaleString("en-US") },
  ];
}

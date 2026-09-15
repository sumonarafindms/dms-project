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

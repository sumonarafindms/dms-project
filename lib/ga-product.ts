/**
 * What a PRODUCT_CODE means, worked out rather than looked up.
 *
 * ## The problem with a list
 *
 * This module used to hold the answer as four literal strings — `SIMWAP`,
 * `SIM-WAP`, `EV-SWAP`, `EVSWAP` — and anything else was "unknown", which every
 * calculation silently dropped. Then the owner's real September file arrived:
 *
 *     SIMSWAP    568 rows   -> unknown   (it is a replacement)
 *     ESIMSWAP     2 rows   -> unknown   (it is a replacement)
 *     MMSTSC       8 rows   -> unknown   (it is a normal SIM at 170)
 *     MMST1911     1 row    -> unknown   (it is a normal SIM at 200)
 *
 * `SIMSWAP` differs from the listed `SIMWAP` by one letter. 579 of 2,527 rows —
 * nearly a quarter of the file — fell into a bucket nobody looks at, and the
 * SIM SWAP figure on screen read 9 instead of 579.
 *
 * A list cannot survive a carrier that invents a code whenever it likes, and
 * the owner should not have to send a file and wait for a patch each time:
 *
 *     "amon vabe update koro je oi nijer theke jate bujte pare swap konta and
 *      normal sim konta ... jate ami proti bar update na korte hoi"
 *
 * ## The rule, and why it is safe to be this general
 *
 * The file is the **Activation Details Report**. Every row in it is an
 * activation. The only distinction the business draws is between a NEW
 * activation and a REPLACEMENT of an existing SIM — so there are exactly two
 * things a code can mean, and only one of them has a name:
 *
 *     a code that says SWAP (or the carrier's WAP spelling)  ->  replacement
 *     anything else                                          ->  normal SIM
 *
 * That is not a shortcut around the domain; it IS the domain. It absorbs
 * `SIMSWAP`, `ESIMSWAP`, `EV_SWAP`, and whatever the next spelling is, without
 * anyone editing this file.
 */

/** The codes this project has actually seen for each category. Kept because an
 *  exact match is price-independent, which is what v157 established: a tariff
 *  is not an identity. Everything NOT in these lists is still classified — see
 *  the module note — so adding to them is an optimisation, never a fix. */
export const SIM_SWAP_PRODUCT_CODES = ["SIMWAP", "EV-SWAP"] as const;

export function normalizeGaProductCode(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

/** The code with separators removed, which is the form the rules below read. */
const bare = (value: string | null | undefined) => normalizeGaProductCode(value).replace(/-/g, "");

/**
 * Does this code name a replacement SIM?
 *
 * `SWAP` anywhere, or `WAP` at the end — the second is only there for the
 * carrier's older `SIMWAP` / `SIM-WAP` spelling, which drops the S. No GA code
 * can collide: they all begin `MMST` and contain neither.
 */
export function isSimSwapProduct(value: string | null | undefined) {
  const code = bare(value);
  if (!code) return false;
  return code.includes("SWAP") || code.endsWith("WAP");
}

/** The 170-tier SIM, by its known code. */
export function isGa170Product(value: string | null | undefined) {
  return bare(value) === "MMSTC";
}

/** The 300-tier SIM, by its known code. */
export function isGa300Product(value: string | null | undefined) {
  const code = bare(value);
  return code === "MMSTS" || code === "MMST";
}

export function isStandardGaProduct(value: string | null | undefined) {
  return isGa170Product(value) || isGa300Product(value);
}

/**
 * An activation rather than a replacement — the general rule.
 *
 * True for every code that is not a swap, which is what makes a code nobody has
 * seen before count as a normal SIM instead of vanishing. Whether it belongs to
 * the 170 or the 300 tier is decided separately, by price; see `ga170Tariff` in
 * lib/business-rules.ts.
 */
export function isNormalSimProduct(value: string | null | undefined) {
  return Boolean(bare(value)) && !isSimSwapProduct(value);
}

/*
 * The swap prices and the `expectedSimSwapPrice` / `hasExpectedSimSwapPrice`
 * helpers used to live here.
 *
 * They existed for one caller: a check in the GA importer that rejected any
 * swap row not priced at the tariff of the day. That check is gone — a tariff
 * is not an identity, and hard-coding one made every upload fail the day the
 * price changed. Nothing classifies by price now except the frozen legacy path
 * in lib/business-rules.ts, which applies only to rows that have no product
 * code at all, and the 170/300 tier split, which LEARNS the tariff from the
 * data rather than being told it.
 */

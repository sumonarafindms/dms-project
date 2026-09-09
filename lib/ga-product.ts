export const SIM_SWAP_PRODUCT_CODES = ["SIMWAP", "EV-SWAP"] as const;

export function normalizeGaProductCode(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

export function isSimSwapProduct(value: string | null | undefined) {
  const code = normalizeGaProductCode(value);
  return code === "SIMWAP" || code === "SIM-WAP" || code === "EV-SWAP" || code === "EVSWAP";
}

export function isGa300Product(value: string | null | undefined) {
  const code = normalizeGaProductCode(value);
  return code === "MMSTS" || code === "MMST";
}

export function isGa170Product(value: string | null | undefined) {
  return normalizeGaProductCode(value) === "MMSTC";
}

export function isStandardGaProduct(value: string | null | undefined) {
  return isGa170Product(value) || isGa300Product(value);
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
 * code at all.
 */

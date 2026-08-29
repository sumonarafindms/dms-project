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

export const SIMWAP_SELLING_PRICE = 350;
export const EV_SWAP_SELLING_PRICE = 100;

export function expectedSimSwapPrice(productCode: string | null | undefined) {
  const code = normalizeGaProductCode(productCode);
  if (code === "SIMWAP" || code === "SIM-WAP") return SIMWAP_SELLING_PRICE;
  if (code === "EV-SWAP" || code === "EVSWAP") return EV_SWAP_SELLING_PRICE;
  return null;
}

export function hasExpectedSimSwapPrice(productCode: string | null | undefined, sellingPrice: number) {
  const expected = expectedSimSwapPrice(productCode);
  return expected === null || sellingPrice === expected;
}

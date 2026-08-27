/**
 * Single source of truth for DMS business rules.
 *
 * Every GA / SSO / LSO calculation in the application must go through this
 * module. Before this file existed the same rules were re-implemented inline in
 * ~15 places, and several of those copies never received the SIM-swap exclusion
 * patch, so the same month produced different Total GA numbers on different
 * pages. Do not re-implement any of these rules locally — import them.
 *
 * Verified rules encoded here (see MASTER HANDOFF §7, §10, §12, §30):
 *   - Total GA = MMSTC count + MMST/MMSTS count only
 *   - SIMWAP (350) and EV-SWAP (100) are replacements: excluded from Total GA,
 *     GA achievement, GA target progress, SSO and dashboard GA
 *   - Unknown product codes never count as standard GA
 *   - SSO: a SIM-seller retailer with >= 2 standard GA in one calendar month
 *   - LSO: monthly C2S amount >= 500 AND transaction count >= 7
 */

import { Prisma } from "@prisma/client";
import { isGa170Product, isGa300Product, isSimSwapProduct, normalizeGaProductCode } from "./ga-product";

export {
  isGa170Product,
  isGa300Product,
  isSimSwapProduct,
  isStandardGaProduct,
  normalizeGaProductCode,
} from "./ga-product";

/* ------------------------------------------------------------------ *
 * GA product codes and prices
 * ------------------------------------------------------------------ */

/** 170 taka SIM category. Counts as standard GA. */
export const GA_170_PRODUCT_CODES = ["MMSTC"] as const;

/** 300 taka SIM category. Counts as standard GA. */
export const GA_300_PRODUCT_CODES = ["MMST", "MMSTS"] as const;

/** Replacement SIM product codes, canonical spelling. */
export const SIM_SWAP_PRODUCT_CODES = ["SIMWAP", "SIM-WAP", "EV-SWAP"] as const;

export const GA_170_SELLING_PRICE = 170;
export const GA_300_SELLING_PRICE = 300;
export const SIMWAP_SELLING_PRICE = 350;
export const EV_SWAP_SELLING_PRICE = 100;

export type GaCategory = "GA_170" | "GA_300" | "SIM_SWAP" | "UNKNOWN";

/** A GA activation row, or any object carrying enough fields to classify one. */
export type GaClassifiable = {
  productCode?: string | null;
  sellingPrice?: Prisma.Decimal | number | string | null;
};

function toNumber(value: Prisma.Decimal | number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Every stored spelling that should match a canonical product code.
 *
 * The GA importer uppercases and trims PRODUCT_CODE, but separator variants
 * (EV SWAP / EV_SWAP / EVSWAP / SIM-WAP) arrive from the source workbook as-is,
 * so the database can hold any of them. Prisma `in` filters are case- and
 * character-exact, which is why the previous `notIn: ["SIMWAP","EV-SWAP"]`
 * filters let `EV_SWAP` rows through and counted them as GA.
 */
function matchCodes(codes: readonly string[]) {
  const out = new Set<string>();
  for (const code of codes) {
    const canonical = code.toUpperCase();
    for (const variant of [
      canonical,
      canonical.replace(/-/g, "_"),
      canonical.replace(/-/g, " "),
      canonical.replace(/-/g, ""),
    ]) {
      out.add(variant);
      out.add(variant.toLowerCase());
    }
  }
  return [...out];
}

export const GA_170_MATCH_CODES = matchCodes(GA_170_PRODUCT_CODES);
export const GA_300_MATCH_CODES = matchCodes(GA_300_PRODUCT_CODES);
export const STANDARD_GA_MATCH_CODES = [...GA_170_MATCH_CODES, ...GA_300_MATCH_CODES];
export const SIM_SWAP_MATCH_CODES = matchCodes(SIM_SWAP_PRODUCT_CODES);

/* ------------------------------------------------------------------ *
 * Legacy rows
 * ------------------------------------------------------------------ */

/**
 * `GaActivation.productCode` was added by migration
 * `20260826140000_add_ga_product_code_sim_swap` with no backfill, so activations
 * imported before that date have a NULL product code. Those rows are classified
 * by SELLING_PRICE instead, which also recovers replacement SIMs that were
 * imported before swap validation existed.
 *
 * This fallback applies ONLY when productCode is NULL. A row that has a product
 * code is always classified by that code.
 */
export function classifyLegacyGaByPrice(sellingPrice: Prisma.Decimal | number | string | null | undefined): GaCategory {
  const price = toNumber(sellingPrice);
  if (price === GA_170_SELLING_PRICE) return "GA_170";
  if (price === GA_300_SELLING_PRICE) return "GA_300";
  if (price === SIMWAP_SELLING_PRICE || price === EV_SWAP_SELLING_PRICE) return "SIM_SWAP";
  return "UNKNOWN";
}

/* ------------------------------------------------------------------ *
 * GA classification (in memory)
 * ------------------------------------------------------------------ */

export function classifyGaActivation(row: GaClassifiable): GaCategory {
  const code = normalizeGaProductCode(row.productCode);
  if (code) {
    if (isGa170Product(code)) return "GA_170";
    if (isGa300Product(code)) return "GA_300";
    if (isSimSwapProduct(code)) return "SIM_SWAP";
    return "UNKNOWN";
  }
  return classifyLegacyGaByPrice(row.sellingPrice);
}

/** Counts toward Total GA, GA achievement, SSO and dashboard GA. */
export function isStandardGaActivation(row: GaClassifiable) {
  const category = classifyGaActivation(row);
  return category === "GA_170" || category === "GA_300";
}

/** Replacement SIM. Shown separately, never part of Total GA. */
export function isSimSwapActivation(row: GaClassifiable) {
  return classifyGaActivation(row) === "SIM_SWAP";
}

export type GaBreakdown = {
  /** Total GA = ga170 + ga300. Never includes SIM swap or unknown products. */
  total: number;
  ga170: number;
  ga300: number;
  simSwap: number;
  unknown: number;
};

export function emptyGaBreakdown(): GaBreakdown {
  return { total: 0, ga170: 0, ga300: 0, simSwap: 0, unknown: 0 };
}

/** Adds `count` activations of one classified row into a running breakdown. */
export function addGaActivation(target: GaBreakdown, row: GaClassifiable, count = 1) {
  switch (classifyGaActivation(row)) {
    case "GA_170":
      target.ga170 += count;
      target.total += count;
      break;
    case "GA_300":
      target.ga300 += count;
      target.total += count;
      break;
    case "SIM_SWAP":
      target.simSwap += count;
      break;
    default:
      target.unknown += count;
  }
  return target;
}

export function summarizeGaActivations(rows: readonly GaClassifiable[]): GaBreakdown {
  const breakdown = emptyGaBreakdown();
  for (const row of rows) addGaActivation(breakdown, row);
  return breakdown;
}

/** Total GA for a set of rows. Equivalent to MMSTC count + MMST/MMSTS count. */
export function countStandardGa(rows: readonly GaClassifiable[]) {
  return summarizeGaActivations(rows).total;
}

/* ------------------------------------------------------------------ *
 * GA classification (Prisma filters)
 * ------------------------------------------------------------------ */

const standardGaFilter: Prisma.GaActivationWhereInput = {
  OR: [
    { productCode: { in: STANDARD_GA_MATCH_CODES } },
    { productCode: null, sellingPrice: { in: [GA_170_SELLING_PRICE, GA_300_SELLING_PRICE] } },
  ],
};

const ga170Filter: Prisma.GaActivationWhereInput = {
  OR: [{ productCode: { in: GA_170_MATCH_CODES } }, { productCode: null, sellingPrice: GA_170_SELLING_PRICE }],
};

const ga300Filter: Prisma.GaActivationWhereInput = {
  OR: [{ productCode: { in: GA_300_MATCH_CODES } }, { productCode: null, sellingPrice: GA_300_SELLING_PRICE }],
};

const simSwapFilter: Prisma.GaActivationWhereInput = {
  OR: [
    { productCode: { in: SIM_SWAP_MATCH_CODES } },
    { productCode: null, sellingPrice: { in: [SIMWAP_SELLING_PRICE, EV_SWAP_SELLING_PRICE] } },
  ],
};

/**
 * Wraps a GaActivation filter so it matches standard GA only.
 *
 * Always compose with these helpers rather than spreading the filter object —
 * spreading silently overwrites an existing `OR` on the caller's where clause.
 */
export function withStandardGa(where: Prisma.GaActivationWhereInput = {}): Prisma.GaActivationWhereInput {
  return { AND: [where, standardGaFilter] };
}

export function withGa170(where: Prisma.GaActivationWhereInput = {}): Prisma.GaActivationWhereInput {
  return { AND: [where, ga170Filter] };
}

export function withGa300(where: Prisma.GaActivationWhereInput = {}): Prisma.GaActivationWhereInput {
  return { AND: [where, ga300Filter] };
}

export function withSimSwap(where: Prisma.GaActivationWhereInput = {}): Prisma.GaActivationWhereInput {
  return { AND: [where, simSwapFilter] };
}

/** Minimum select needed to classify an activation. Use in every GA query. */
export const GA_CLASSIFICATION_SELECT = {
  productCode: true,
  sellingPrice: true,
} as const;

/* ------------------------------------------------------------------ *
 * SSO — SIM Seller Outlet
 * ------------------------------------------------------------------ */

/** A SIM-seller retailer needs this many standard GA in one calendar month. */
export const SSO_MIN_MONTHLY_STANDARD_GA = 2;

export function isSimSellerRetailer(simSeller: string | null | undefined) {
  return (simSeller || "").trim().toUpperCase() === "Y";
}

/**
 * @param simSeller  raw `Retailer.simSeller` value, or an already-resolved flag
 * @param monthlyStandardGaCount  standard GA only — swaps must be excluded first
 */
export function isSsoComplete(simSeller: string | boolean | null | undefined, monthlyStandardGaCount: number) {
  const seller = typeof simSeller === "boolean" ? simSeller : isSimSellerRetailer(simSeller);
  return seller && monthlyStandardGaCount >= SSO_MIN_MONTHLY_STANDARD_GA;
}

export function ssoGaRemaining(monthlyStandardGaCount: number) {
  return Math.max(0, SSO_MIN_MONTHLY_STANDARD_GA - monthlyStandardGaCount);
}

/* ------------------------------------------------------------------ *
 * LSO — Large Sales Outlet
 * ------------------------------------------------------------------ */

export const LSO_MIN_MONTHLY_AMOUNT = 500;
export const LSO_MIN_MONTHLY_TRANSACTIONS = 7;

export function isLsoComplete(
  totalAmount: Prisma.Decimal | number | string | null | undefined,
  transactionCount: number | null | undefined,
) {
  return (
    (toNumber(totalAmount) ?? 0) >= LSO_MIN_MONTHLY_AMOUNT && (transactionCount ?? 0) >= LSO_MIN_MONTHLY_TRANSACTIONS
  );
}

export function lsoAmountRemaining(totalAmount: Prisma.Decimal | number | string | null | undefined) {
  return Math.max(0, LSO_MIN_MONTHLY_AMOUNT - (toNumber(totalAmount) ?? 0));
}

export function lsoTransactionsRemaining(transactionCount: number | null | undefined) {
  return Math.max(0, LSO_MIN_MONTHLY_TRANSACTIONS - (transactionCount ?? 0));
}

/** Matches C2sMonthlySummary rows that have completed LSO. */
export const lsoCompleteMonthlySummaryWhere: Prisma.C2sMonthlySummaryWhereInput = {
  totalAmount: { gte: LSO_MIN_MONTHLY_AMOUNT },
  transactionCount: { gte: LSO_MIN_MONTHLY_TRANSACTIONS },
};

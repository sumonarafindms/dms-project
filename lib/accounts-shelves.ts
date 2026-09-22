/**
 * The Accounts home's shapes and shelves — Prisma-free.
 *
 * Split from `lib/accounts-overview.ts` for the reason every `*-category` and
 * rules file in lib/ is: the page's layout is a client component, and
 * importing the data module there would drag Prisma into the browser bundle,
 * which tests/client-bundle.smoke.test.ts fails on.
 */

import type { HolderType, ProductCategory } from "./stock";

/** A holder as `lib/stock-data` lists one — restated here so this file stays Prisma-free. */
type Holder = {
  type: HolderType;
  id: string;
  name: string;
  code: string | null;
  supervisorName: string | null;
  supervisorId?: string | null;
  inactive?: boolean;
};

export type ActivationType = "GA_170" | "GA_300" | "SIM_SWAP";
export type PeriodKey = "month" | "yesterday";

export type OverviewProduct = {
  id: string;
  category: ProductCategory;
  subType: string;
  activationType: ActivationType | null;
  active: boolean;
};

/** One product's movement over one period. */
export type ProductFlow = {
  productId: string;
  /** Company lifting: PURCHASE rows only. An opening count is not a lifting. */
  lifted: number;
  given: number;
  givenBy: Record<HolderType, number>;
  sold: number;
  soldBy: Record<HolderType, number>;
  returned: number;
  /** SIMs with a link: the company feed's count. Null: not a SIM, or not linked. */
  activated: number | null;
};

export type OverviewPeriod = {
  key: PeriodKey;
  label: string;
  from: string;
  to: string;
  flows: Record<string, ProductFlow>;
  activations: Record<ActivationType, number>;
};

/** The five shelves the page is laid out in, in the owner's order. */
export type ShelfKey = "SIM_NORMAL" | "SIM_SWAP" | "CARD" | "ITOPUP" | "DEVICE";

export const SHELF_LABEL: Record<ShelfKey, string> = {
  SIM_NORMAL: "Normal SIM",
  SIM_SWAP: "Swap SIM",
  CARD: "Scratch cards",
  ITOPUP: "iTopup",
  DEVICE: "Routers & handsets",
};

/**
 * Which shelf a product sits on.
 *
 * The link decides for a linked SIM. An unlinked SIM falls back to its name —
 * "swap" or "EV" reads as a swap — only for where it is SHOWN; its activation
 * figure still says "not linked", because the name is a label and not a fact.
 */
export function shelfOf(p: Pick<OverviewProduct, "category" | "subType" | "activationType">): ShelfKey {
  if (p.category === "SIM") {
    if (p.activationType === "SIM_SWAP") return "SIM_SWAP";
    if (p.activationType) return "SIM_NORMAL";
    return /swap|\bev\b/i.test(p.subType) ? "SIM_SWAP" : "SIM_NORMAL";
  }
  if (p.category === "CARD") return "CARD";
  if (p.category === "ITOPUP") return "ITOPUP";
  return "DEVICE";
}

/** What a holder has, product by product. */
export type HolderLine = {
  productId: string;
  inHand: number;
  took: Record<PeriodKey, number>;
  sold: Record<PeriodKey, number>;
};

export type HolderStock = Holder & {
  due: number;
  /** The last day money came in from this person, or null if it never has. */
  lastDeposit: string | null;
  lines: HolderLine[];
};

export type AccountsOverview = {
  today: string;
  products: OverviewProduct[];
  periods: Record<PeriodKey, OverviewPeriod>;
  /** In the godown right now, per product. */
  godown: Record<string, number>;
  holders: HolderStock[];
  /** v199: what needs somebody to act, worked out once for the home page. */
  attention: Attention;
  /**
   * The newest day the company's activation feed has. The feed is uploaded for
   * the PREVIOUS day, so "yesterday" can be empty for most of a morning — and
   * the page must say that rather than print 0 activated.
   */
  activationsThrough: string | null;
  /** Products sharing one activation link, by link — so a row can say "shared". */
  sharedLinks: Record<ActivationType, string[]>;
};

/** How long a due may go without any money in before the home page asks about it. */
export const QUIET_DAYS = 7;

/**
 * The home page's "Needs attention" list (v199).
 *
 * Each is something the owner asked Accounts to catch — *"sob thik moto hoce
 * naki check kora and taka management thik moto rakha"* — and each names who
 * or what, so the list is a to-do, not a count.
 */
export type Attention = {
  /** Owing money, and nothing deposited for QUIET_DAYS or more (or ever). */
  quietDues: {
    type: HolderType;
    id: string;
    name: string;
    due: number;
    lastDeposit: string | null;
    days: number | null;
  }[];
  /** More reported sold or returned than was ever given: a data-entry error. */
  negativeStock: { type: HolderType; id: string; name: string; product: string; inHand: number }[];
  /** More given out than was ever lifted: a lifting nobody entered. */
  negativeGodown: { product: string; qty: number }[];
  /** In use, but no price for today — cannot be entered today. */
  unpriced: string[];
  /** SIMs in use with no activation link — "activated" cannot be shown. */
  unlinkedSims: string[];
  /** No longer active, but still holding stock or owing money. */
  leftWithBalance: { type: HolderType; id: string; name: string; due: number }[];
};

export function attentionCount(a: Attention) {
  return (
    a.quietDues.length +
    a.negativeStock.length +
    a.negativeGodown.length +
    a.unpriced.length +
    a.unlinkedSims.length +
    a.leftWithBalance.length
  );
}

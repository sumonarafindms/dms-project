/**
 * The house's own books: what stock we own, what it cost, and what we made.
 *
 * Prisma-free like lib/stock.ts, for the same reason — the lifting and expense
 * screens are client islands. lib/lifting-data.ts does the reading.
 *
 * ------------------------------------------------------------------
 * Two prices, and why both are snapshots
 * ------------------------------------------------------------------
 *
 * Every unit in this business has two prices: what the COMPANY charged us
 * (`Lifting.unitCost`) and what we charged the RSO (`StockMovement.unitPrice`).
 * The margin is the gap. Both are written into the row that records them, for
 * the reason v193 exists: a supplier's price changes too, and a purchase
 * recorded in September must keep September's cost or every margin this app
 * has ever shown moves the next time somebody updates a price list.
 *
 * ------------------------------------------------------------------
 * What is in the godown
 * ------------------------------------------------------------------
 *
 *     house stock = lifted − given to holders + returned by holders
 *
 * The owner's choice, and it needs no daily count. Two things it deliberately
 * does NOT do:
 *
 *   - It does not subtract a holder's OPENING stock. That stock was already
 *     with them when the ledger started; it never passed through our godown,
 *     so subtracting it would show a shortage that does not exist.
 *   - It does not add back what a holder SOLD. Sold stock went to a customer,
 *     not to us.
 *
 * A holder returning opening stock DOES raise the house figure, and that is
 * right: the goods physically arrive in the godown.
 *
 * ------------------------------------------------------------------
 * What a unit cost
 * ------------------------------------------------------------------
 *
 * Weighted average across every lifting of that product:
 *
 *     avgCost = Σ(lift qty × lift cost) ÷ Σ(lift qty)
 *
 * Not the latest cost, which would revalue last month's margin every time a
 * new invoice arrived, and not FIFO, which needs lot tracking this business
 * does not keep. The average is stable, explainable in one sentence, and the
 * figure an accountant expects.
 */

import { paisa, type ProductCategory, type ProductRow } from "./stock";

export type LiftingKind = "PURCHASE" | "OPENING";

export const LIFTING_KIND_LABEL: Record<LiftingKind, string> = {
  PURCHASE: "Bought",
  OPENING: "Opening",
};

export type ExpenseCategory = "TRANSPORT" | "FOOD" | "OFFICE" | "UTILITY" | "SALARY" | "REPAIR" | "MARKETING" | "OTHER";

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  "TRANSPORT",
  "FOOD",
  "OFFICE",
  "UTILITY",
  "SALARY",
  "REPAIR",
  "MARKETING",
  "OTHER",
] as const;

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  TRANSPORT: "Transport",
  FOOD: "Food & tea",
  OFFICE: "Office",
  UTILITY: "Utility & bills",
  SALARY: "Salary & wages",
  REPAIR: "Repair",
  MARKETING: "Marketing",
  OTHER: "Other",
};

export type PaidFrom = "CASH" | "BANK";
export const PAID_FROM_LABEL: Record<PaidFrom, string> = { CASH: "Cash", BANK: "Bank" };

/* ------------------------------------------------------------------ *
 * Per product
 * ------------------------------------------------------------------ */

export type LiftRow = { productId: string; qty: number; unitCost: number };

/** What each product has cost us on average, and how much we have bought. */
export function costBasis(lifts: readonly LiftRow[]) {
  const acc = new Map<string, { qty: number; cost: number }>();
  for (const l of lifts) {
    const row = acc.get(l.productId) || { qty: 0, cost: 0 };
    const qty = Number(l.qty) || 0;
    row.qty += qty;
    row.cost += paisa(qty * (Number(l.unitCost) || 0));
    acc.set(l.productId, row);
  }
  const out = new Map<string, { liftedQty: number; liftedCost: number; avgCost: number }>();
  for (const [productId, row] of acc)
    out.set(productId, {
      liftedQty: row.qty,
      liftedCost: paisa(row.cost),
      // A product lifted at zero quantity has no average; 0 is the honest
      // answer and the screens print "—" rather than a cost of nothing.
      avgCost: row.qty > 0 ? paisa(row.cost / row.qty) : 0,
    });
  return out;
}

/** What a holder took, gave back and sold — summed across every holder. */
export type IssuedRow = {
  productId: string;
  givenQty: number;
  givenValue: number;
  returnedQty: number;
  returnedValue: number;
  soldQty: number;
  soldValue: number;
};

export type HouseLine = {
  product: ProductRow;
  /**
   * Whether anything has ever been lifted for this product.
   *
   * **No cost is not a cost of zero.** A product nobody has recorded buying
   * has no margin that can be computed, and treating the missing figure as
   * zero makes its entire sale value look like profit — ৳3.3 lakh of it in
   * the seeded month, found by .scratch/audit194.ts. The same rule the
   * percentage columns learned in v175 and the raw pairs in v191: a number
   * nobody set is not a number.
   */
  hasCost: boolean;
  /** Bought from the company, plus whatever opened the godown. */
  liftedQty: number;
  liftedCost: number;
  avgCost: number;
  /** Out with holders right now, net of what came back. */
  issuedQty: number;
  issuedValue: number;
  issuedCost: number;
  marginIssued: number;
  soldQty: number;
  soldValue: number;
  soldCost: number;
  marginSold: number;
  /** lifted − given + returned. */
  inGodown: number;
  godownValue: number;
};

/**
 * One line per product: what we bought, what went out, what is left, and the
 * margin on each — issued and sold side by side.
 *
 * The owner asked for both and he is right to: **issued** says what the stock
 * we have handed out is worth to us if it all sells, **sold** says what has
 * actually been earned. Showing only the first flatters a month where nothing
 * moved; showing only the second hides a godown full of stock.
 */
export function houseLines(
  products: readonly ProductRow[],
  lifts: readonly LiftRow[],
  issued: readonly IssuedRow[],
): HouseLine[] {
  const basis = costBasis(lifts);
  const byId = new Map(products.map((p) => [p.id, p]));
  const issuedById = new Map(issued.map((i) => [i.productId, i]));

  const ids = new Set<string>([...basis.keys(), ...issuedById.keys()]);
  const lines: HouseLine[] = [];

  for (const id of ids) {
    const product = byId.get(id);
    if (!product) continue;
    const b = basis.get(id) || { liftedQty: 0, liftedCost: 0, avgCost: 0 };
    const i =
      issuedById.get(id) ||
      ({ givenQty: 0, givenValue: 0, returnedQty: 0, returnedValue: 0, soldQty: 0, soldValue: 0 } as IssuedRow);

    const hasCost = b.avgCost > 0;
    const issuedQty = i.givenQty - i.returnedQty;
    const issuedValue = paisa(i.givenValue - i.returnedValue);
    const issuedCost = paisa(issuedQty * b.avgCost);
    const soldCost = paisa(i.soldQty * b.avgCost);
    const inGodown = b.liftedQty - i.givenQty + i.returnedQty;

    lines.push({
      product,
      hasCost,
      liftedQty: b.liftedQty,
      liftedCost: b.liftedCost,
      avgCost: b.avgCost,
      issuedQty,
      issuedValue,
      issuedCost,
      // Zero, not `value − 0`. See `hasCost`.
      marginIssued: hasCost ? paisa(issuedValue - issuedCost) : 0,
      soldQty: i.soldQty,
      soldValue: paisa(i.soldValue),
      soldCost,
      marginSold: hasCost ? paisa(i.soldValue - soldCost) : 0,
      inGodown,
      godownValue: paisa(inGodown * b.avgCost),
    });
  }

  lines.sort((a, b) => a.product.subType.localeCompare(b.product.subType));
  return lines;
}

/* ------------------------------------------------------------------ *
 * The bottom line
 * ------------------------------------------------------------------ */

export type ProfitSummary = {
  liftedCost: number;
  issuedValue: number;
  issuedCost: number;
  marginIssued: number;
  soldValue: number;
  soldCost: number;
  marginSold: number;
  expenses: number;
  /** marginSold − expenses. The conservative one, and the one that is real. */
  net: number;
  godownValue: number;
  /*
   * What is NOT in the margins above, because no lifting has been recorded
   * for those products and there is no cost to subtract.
   *
   * Reported rather than silently dropped: leaving it out entirely would
   * understate the business exactly as counting it at zero cost overstated it.
   * The screen names the products so somebody can go and record the lifting.
   */
  uncostedIssuedValue: number;
  uncostedSoldValue: number;
  uncostedProducts: string[];
};

export function profitOf(lines: readonly HouseLine[], expenses: number): ProfitSummary {
  let liftedCost = 0,
    issuedValue = 0,
    issuedCost = 0,
    soldValue = 0,
    soldCost = 0,
    godownValue = 0,
    uncostedIssuedValue = 0,
    uncostedSoldValue = 0;
  const uncostedProducts: string[] = [];
  for (const l of lines) {
    liftedCost += l.liftedCost;
    godownValue += l.godownValue;
    if (!l.hasCost) {
      // Outside every margin figure, and named so somebody can fix it.
      if (l.issuedValue || l.soldValue) uncostedProducts.push(l.product.subType);
      uncostedIssuedValue += l.issuedValue;
      uncostedSoldValue += l.soldValue;
      continue;
    }
    issuedValue += l.issuedValue;
    issuedCost += l.issuedCost;
    soldValue += l.soldValue;
    soldCost += l.soldCost;
  }
  const spent = paisa(expenses);
  const marginSold = paisa(soldValue - soldCost);
  return {
    liftedCost: paisa(liftedCost),
    issuedValue: paisa(issuedValue),
    issuedCost: paisa(issuedCost),
    marginIssued: paisa(issuedValue - issuedCost),
    soldValue: paisa(soldValue),
    soldCost: paisa(soldCost),
    marginSold,
    expenses: spent,
    /*
     * Net is on the SOLD basis, not the issued one. Stock sitting with an RSO
     * is not profit — it is stock with an RSO, and calling it profit is how a
     * distributor discovers at the end of a quarter that the money was never
     * there. The issued figure is shown beside it, clearly labelled.
     */
    net: paisa(marginSold - spent),
    godownValue: paisa(godownValue),
    uncostedIssuedValue: paisa(uncostedIssuedValue),
    uncostedSoldValue: paisa(uncostedSoldValue),
    uncostedProducts,
  };
}

/** Margin as a percentage of what it sold for. Null when nothing sold. */
export function marginPercent(margin: number, value: number): number | null {
  if (!(value > 0)) return null;
  return Math.round((margin / value) * 1000) / 10;
}

/* ------------------------------------------------------------------ *
 * Expenses
 * ------------------------------------------------------------------ */

export type ExpenseRow = { category: ExpenseCategory; amount: number; paidFrom: PaidFrom };

export function expenseTotals(rows: readonly ExpenseRow[]) {
  let total = 0,
    cash = 0,
    bank = 0;
  const byCategory = new Map<ExpenseCategory, number>();
  for (const r of rows) {
    const amount = paisa(r.amount);
    total += amount;
    if (r.paidFrom === "BANK") bank += amount;
    else cash += amount;
    byCategory.set(r.category, paisa((byCategory.get(r.category) || 0) + amount));
  }
  return {
    total: paisa(total),
    cash: paisa(cash),
    bank: paisa(bank),
    byCategory: EXPENSE_CATEGORIES.map((c) => ({ category: c, amount: byCategory.get(c) || 0 })).filter(
      (x) => x.amount > 0,
    ),
  };
}

/* ------------------------------------------------------------------ *
 * The SIM check
 * ------------------------------------------------------------------ */

/** Only SIMs are checked against the activation feed; a scratch card has none. */
export const CHECKED_CATEGORY: ProductCategory = "SIM";

export type SimCheckRow = {
  employeeId: string;
  name: string;
  code: string | null;
  supervisorName: string | null;
  /** SIMs handed to them, net of what came back. */
  given: number;
  /** SIMs their outlets actually activated, from the GA feed. */
  activated: number;
  /** SIMs they reported selling. */
  sold: number;
  /** What one of their SIMs was worth, averaged over what they were given. */
  avgPrice: number;
};

export type SimCheck = SimCheckRow & {
  /**
   * Activated but not reported sold. The figure the owner is looking for:
   * a SIM a real customer is using, that the RSO has not told Accounts about.
   */
  unreported: number;
  /** Money that gap is worth, at what those SIMs were handed over at. */
  unreportedValue: number;
  /** Handed out but not activated — still in a bag somewhere, or with a retailer. */
  notActivated: number;
};

/**
 * Given, activated, sold — and the two gaps between them.
 *
 * The owner's example: *"100 sim tar kach theke niche 50 ta active korce but
 * 30 ta sell dekhaice... baki 20tar taka tar kache ace"*.
 *
 * `unreported` is that 20. It is the one worth acting on, because an activated
 * SIM is proof the thing left the RSO's hands — somebody is using it — so the
 * money exists whether or not it was reported.
 *
 * `notActivated` is the other 50: handed out and not yet in a customer's
 * phone. Usually ordinary — stock in a bag, or sitting with a retailer — which
 * is why it is shown quietly and never called a shortfall.
 *
 * **This never touches a due.** The owner was explicit that it is for
 * understanding — *"aita just tar knowledge ar jono"* — and it has to stay
 * that way, because the activation feed and the stock ledger count slightly
 * different things and the difference is not always somebody's fault.
 */
export function simCheck(row: SimCheckRow): SimCheck {
  const unreported = Math.max(0, row.activated - row.sold);
  return {
    ...row,
    unreported,
    unreportedValue: paisa(unreported * row.avgPrice),
    notActivated: Math.max(0, row.given - row.activated),
  };
}

/** Worst first — the order somebody reading this screen actually wants. */
export function bySuspicion(rows: readonly SimCheck[]) {
  return [...rows].sort((a, b) => b.unreportedValue - a.unreportedValue || a.name.localeCompare(b.name));
}

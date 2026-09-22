/**
 * Stock and cash arithmetic — the whole of it, in one place.
 *
 * Prisma-free on purpose, like lib/bp-rollup.ts and lib/sim-support.ts: the
 * entry screens are client components and importing a module that reaches
 * `@prisma/client` would drag the query engine into the browser bundle.
 * lib/stock-data.ts does the reading; this file does the thinking.
 *
 * ------------------------------------------------------------------
 * The one formula
 * ------------------------------------------------------------------
 *
 *     Due = openingDue + Σ(given) − Σ(returned) − Σ(cash) − Σ(bank)
 *
 * Three things follow from it, and every one of them is a decision the owner
 * made rather than something this code chose:
 *
 *   1. **A reported sale does not reduce the due.** Only money coming back,
 *      or goods coming back, does. Someone who sells ৳25,000 and deposits
 *      ৳20,000 has reduced their due by ৳20,000, not by ৳25,000 — the other
 *      ৳5,000 is in their pocket and that is exactly what a due is for.
 *
 *   2. **The due includes the value of stock still in hand.** This is the
 *      owner's own arithmetic: "100000 takar product niche, 80000 taka sale
 *      dekhaice, tahole tar due 20000 taka" — and the ৳20,000 of goods has
 *      not gone anywhere. Returning them clears it; selling them moves the
 *      obligation from goods to cash without changing its size.
 *
 *   3. **It is a running balance, per person, forever.** Day two opens where
 *      day one closed. The owner's second day — took ৳10,000 more, deposited
 *      ৳25,000 — lands on ৳5,000, and `tests/stock.smoke.test.ts` checks
 *      exactly that pair of days in his numbers.
 *
 * Nobody's stock is added to anybody else's. There is no team total here and
 * there must never be one: a supervisor reading their team sees a LIST of
 * people who each owe something, not a sum that belongs to no one.
 *
 * ------------------------------------------------------------------
 * Where a figure's price comes from
 * ------------------------------------------------------------------
 *
 * From the movement row itself, always. Never from the product.
 *
 * v192 stored the price on the product and computed `qty × product.price` at
 * display time, protecting history with a rule — *a price is frozen once
 * something refers to it*. A rule is only as good as every future code path
 * that has to remember it, and this is the number somebody gets paid on. The
 * owner put it plainly: *"ager sell kora product ba rso der jai product
 * lifting kora hoice oi product ar price change hole full hisab change hoye
 * jabe"*.
 *
 * So every movement carries `unitPrice`, written when the line was recorded.
 * The product master is then free to change — new price, retired, renamed —
 * and there is no path at all from that change to a figure already recorded.
 * Structure, not discipline.
 *
 * ------------------------------------------------------------------
 * iTopup is a product
 * ------------------------------------------------------------------
 *
 * The recharge float is taken in the morning, spent during the day and
 * returned at night — the same three movements as a box of SIMs, in Taka
 * instead of pieces. So it is a Product of category ITOPUP with a price of
 * 1.00, and `qty` is the amount. One movement table, one due formula, and no
 * second set of rules that could drift out of step with the first.
 */

/** The three kinds of holder. A BP is the outlet itself, not the RSO holding it. */
export type HolderType = "RSO" | "SUPERVISOR" | "BP";
export const HOLDER_TYPES: readonly HolderType[] = ["RSO", "SUPERVISOR", "BP"] as const;

export const HOLDER_TYPE_LABEL: Record<HolderType, string> = {
  RSO: "RSO",
  SUPERVISOR: "Supervisor",
  BP: "BP",
};

export type MoveKind = "GIVEN" | "SOLD" | "RETURNED" | "OPENING";
export const MOVE_KINDS: readonly MoveKind[] = ["GIVEN", "SOLD", "RETURNED", "OPENING"] as const;

export const MOVE_KIND_LABEL: Record<MoveKind, string> = {
  GIVEN: "Given",
  SOLD: "Sold",
  RETURNED: "Returned",
  OPENING: "Opening",
};

export type ProductCategory = "SIM" | "CARD" | "ROUTER" | "HANDSET" | "ITOPUP";
export const PRODUCT_CATEGORIES: readonly ProductCategory[] = ["SIM", "CARD", "ROUTER", "HANDSET", "ITOPUP"] as const;

export const PRODUCT_CATEGORY_LABEL: Record<ProductCategory, string> = {
  SIM: "SIM",
  CARD: "Scratch card",
  ROUTER: "Router",
  HANDSET: "Handset",
  ITOPUP: "iTopup balance",
};

/** The category whose unit is money rather than pieces. */
export const MONEY_CATEGORY: ProductCategory = "ITOPUP";

/** True when this product is counted in Taka, so screens print ৳ and not "pcs". */
export const isMoneyProduct = (category: ProductCategory) => category === MONEY_CATEGORY;

/* ------------------------------------------------------------------ *
 * Rounding
 * ------------------------------------------------------------------ *
 * Money is Decimal(18,2) in the database and a number here. Every product of
 * a qty and a price is rounded to the paisa at the point it is formed, so a
 * column of figures adds up to the total printed under it. Rounding once at
 * the end instead lets a screen show rows that visibly do not sum. */

/** Rounds to two decimal places, the way the database column stores it. */
export const paisa = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * One line's money.
 *
 * `unitPrice` is the movement's OWN price, not the product's. Callers that
 * reach for `product.price` are the bug this module exists to make impossible
 * — and there is no `price` on a ProductRow any more, so they cannot.
 */
export const lineValue = (qty: number, unitPrice: number) => paisa((Number(qty) || 0) * (Number(unitPrice) || 0));

/* ------------------------------------------------------------------ *
 * Stock on hand
 * ------------------------------------------------------------------ */

export type MovementRow = {
  kind: MoveKind;
  productId: string;
  qty: number;
  /** What one unit was worth when this line was recorded. */
  unitPrice: number;
};

/**
 * A product's identity. Deliberately has NO price field: a screen holding one
 * of these cannot accidentally value a historical movement with today's
 * figure, because it does not have today's figure to hand.
 */
export type ProductRow = {
  id: string;
  category: ProductCategory;
  subType: string;
  unitLabel?: string | null;
};

/** A product plus the price in force for the day being worked on. */
export type PricedProduct = ProductRow & { price: number };

export type StockLine = {
  product: ProductRow;
  opening: number;
  given: number;
  sold: number;
  returned: number;
  /** opening + given − sold − returned. May be negative; see the note below. */
  inHand: number;
  /** What came in minus what went out, each at the price it moved at. */
  inHandValue: number;
  openingValue: number;
  givenValue: number;
  soldValue: number;
  returnedValue: number;
  /** inHandValue / inHand — what the remaining stock is being carried at. */
  carryPrice: number;
};

/**
 * What one holder is holding, product by product.
 *
 * `inHand` can go negative, and the screens show it in red rather than
 * clamping it to zero. A negative means somebody reported selling more than
 * they were ever given, which is a data error somebody has to fix — hiding it
 * behind a Math.max would leave the error in the database and take the only
 * signal of it off the screen.
 */
export function stockLines(movements: readonly MovementRow[], products: readonly ProductRow[]): StockLine[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const acc = new Map<
    string,
    { opening: number; given: number; sold: number; returned: number; ov: number; gv: number; sv: number; rv: number }
  >();

  for (const m of movements) {
    if (!byId.has(m.productId)) continue;
    const row = acc.get(m.productId) || { opening: 0, given: 0, sold: 0, returned: 0, ov: 0, gv: 0, sv: 0, rv: 0 };
    const qty = Number(m.qty) || 0;
    // Valued from the line's OWN price, so two lots of the same product bought
    // at different prices each keep what they were actually worth.
    const value = lineValue(qty, m.unitPrice);
    if (m.kind === "OPENING") {
      row.opening += qty;
      row.ov += value;
    } else if (m.kind === "GIVEN") {
      row.given += qty;
      row.gv += value;
    } else if (m.kind === "SOLD") {
      row.sold += qty;
      row.sv += value;
    } else if (m.kind === "RETURNED") {
      row.returned += qty;
      row.rv += value;
    }
    acc.set(m.productId, row);
  }

  const lines: StockLine[] = [];
  for (const [productId, row] of acc) {
    const product = byId.get(productId)!;
    const inHand = row.opening + row.given - row.sold - row.returned;
    /*
     * What the stock in hand is worth.
     *
     * Not `inHand × today's price` — that would be the one place a price
     * change could still move a figure. It is what came in minus what went
     * out, each at the price it moved at, which is what the holder is actually
     * carrying. A holder who took ten cards at 39 and ten at 40 is carrying
     * 790, not 800.
     */
    const inHandValue = paisa(row.ov + row.gv - row.sv - row.rv);
    lines.push({
      product,
      opening: row.opening,
      given: row.given,
      sold: row.sold,
      returned: row.returned,
      inHand,
      inHandValue,
      openingValue: paisa(row.ov),
      givenValue: paisa(row.gv),
      soldValue: paisa(row.sv),
      returnedValue: paisa(row.rv),
      /** The average price this holder is carrying the remaining stock at. */
      carryPrice: inHand > 0 ? paisa(inHandValue / inHand) : 0,
    });
  }

  lines.sort(
    (a, b) =>
      PRODUCT_CATEGORIES.indexOf(a.product.category) - PRODUCT_CATEGORIES.indexOf(b.product.category) ||
      a.product.subType.localeCompare(b.product.subType),
  );
  return lines;
}

/* ------------------------------------------------------------------ *
 * The due
 * ------------------------------------------------------------------ */

export type DueInput = {
  /** The whole outstanding amount on the day this holder was opened. */
  openingDue: number;
  /** Value of everything handed out since. OPENING movements are NOT in here. */
  givenValue: number;
  /** Value of everything handed back. */
  returnedValue: number;
  cash: number;
  bank: number;
};

export type Due = {
  openingDue: number;
  givenValue: number;
  returnedValue: number;
  deposited: number;
  /** openingDue + given − returned − deposited. Negative means overpaid. */
  due: number;
};

/**
 * The running balance. A sale is not an argument to this function, and that
 * absence is the rule: only goods or money coming back reduce a due.
 */
export function dueOf(input: DueInput): Due {
  const openingDue = paisa(input.openingDue);
  const givenValue = paisa(input.givenValue);
  const returnedValue = paisa(input.returnedValue);
  const deposited = paisa(paisa(input.cash) + paisa(input.bank));
  return {
    openingDue,
    givenValue,
    returnedValue,
    deposited,
    due: paisa(openingDue + givenValue - returnedValue - deposited),
  };
}

/** Sums the given and returned value of a holder's lines, for `dueOf`. */
export function movementValue(lines: readonly StockLine[]) {
  let givenValue = 0;
  let returnedValue = 0;
  let soldValue = 0;
  for (const l of lines) {
    givenValue += l.givenValue;
    returnedValue += l.returnedValue;
    soldValue += l.soldValue;
  }
  return { givenValue: paisa(givenValue), returnedValue: paisa(returnedValue), soldValue: paisa(soldValue) };
}

/* ------------------------------------------------------------------ *
 * How a due reads
 * ------------------------------------------------------------------ */

export type DueTone = "clear" | "owing" | "over";

/**
 * Due is risk money, so it is coloured everywhere it appears — the owner's
 * ruling, and the reason it is classified here rather than by each screen.
 * A negative due is not good news and is not painted green: it means the
 * holder has paid in more than they were given, which is somebody's mistake.
 */
export function dueTone(due: number): DueTone {
  if (due > 0) return "owing";
  if (due < 0) return "over";
  return "clear";
}

export const DUE_TONE_LABEL: Record<DueTone, string> = {
  clear: "Settled",
  owing: "Due",
  over: "Overpaid",
};

/* ------------------------------------------------------------------ *
 * Prices, by date
 * ------------------------------------------------------------------ */

export type PriceRow = { price: number; effectiveFrom: string };

/**
 * What a product cost on a given day.
 *
 * The latest price whose start date is on or before that day. This is what
 * makes a back-dated entry price itself correctly — v192 would have valued a
 * correction to a day three weeks ago at today's price, which is the owner's
 * exact fear arriving through the back door.
 *
 * Returns null when the product had no price yet on that date. Null is not
 * zero and must not be shown as a free product: the entry screen refuses the
 * line and says the product has no price for that day.
 */
export function priceOn(prices: readonly PriceRow[], date: string): number | null {
  let best: PriceRow | null = null;
  for (const p of prices) {
    if (p.effectiveFrom > date) continue;
    if (!best || p.effectiveFrom > best.effectiveFrom) best = p;
  }
  return best ? paisa(best.price) : null;
}

/** The price in force today, for a list sorted or not. */
export const currentPrice = (prices: readonly PriceRow[], today: string) => priceOn(prices, today);

/**
 * What a return should credit.
 *
 * The owner's ruling: *"je dame nice sei dame"* — lift ten cards at ৳39, and
 * whatever the price does afterwards, handing those ten back clears exactly
 * ৳390. Anything else pays somebody for a price move they had no part in: at
 * today's price the same return would clear ৳400 and leave them ৳10 ahead for
 * doing nothing.
 *
 * `carryPrice` is what the holder is actually carrying the remaining stock at
 * — what came in minus what went out, each at its own price — so a holder who
 * took two lots at two prices returns at the blend of what they still hold.
 * The screen shows this figure in an editable box rather than applying it
 * silently, and says so when the two lots differ, because a default nobody can
 * see is how a wrong number survives.
 */
export function returnPriceFor(line: Pick<StockLine, "inHand" | "carryPrice"> | undefined, fallback: number) {
  if (line && line.inHand > 0 && line.carryPrice > 0) return line.carryPrice;
  return paisa(fallback);
}

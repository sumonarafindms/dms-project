/**
 * The money rules, in the owner's own numbers.
 *
 * Every assertion here is a decision he made, not a property of the code:
 * what reduces a due, what a due contains, and what may never be summed.
 * If one of these fails, somebody is about to be asked for the wrong amount.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STOCK_WRITE_ROLES } from "../lib/stock-data";
import {
  dueOf,
  dueTone,
  isMoneyProduct,
  lineValue,
  movementValue,
  paisa,
  priceOn,
  returnPriceFor,
  stockLines,
  type MovementRow,
  type ProductRow,
} from "../lib/stock";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/*
 * A ProductRow has no price, on purpose. The price of a figure lives on the
 * MOVEMENT that recorded it, so these fixtures cannot accidentally value
 * history with a "current" number — there isn't one to reach for.
 */
const CARD: ProductRow = { id: "card", category: "CARD", subType: "39 Tk Card" };
const SIM: ProductRow = { id: "sim150", category: "SIM", subType: "Normal 150" };
const TOPUP: ProductRow = { id: "topup", category: "ITOPUP", subType: "iTopup" };

describe("the owner's own two days", () => {
  /*
   * "rso ajke 100000 takar product niche.. And din sas a 80000 taka sale
   *  dekhaice tahole tar due 20000 taka..porer din she 10000 takar product
   *  niche and sell dekhaice 25000 taka tahole tar total due ace 5000 taka"
   *
   * The second day is the one that decides the design: 20,000 carried in,
   * 10,000 more taken, 25,000 deposited, and the answer he gives is 5,000 —
   * which is only reachable if the due is a RUNNING balance and if what
   * clears it is the money, not the sale.
   */
  it("day one leaves 20,000 due", () => {
    const d = dueOf({ openingDue: 0, givenValue: 100_000, returnedValue: 0, cash: 80_000, bank: 0 });
    expect(d.due).toBe(20_000);
  });

  it("day two carries the 20,000 in and leaves 5,000", () => {
    const dayOne = dueOf({ openingDue: 0, givenValue: 100_000, returnedValue: 0, cash: 80_000, bank: 0 });
    const dayTwo = dueOf({
      openingDue: dayOne.due,
      givenValue: 10_000,
      returnedValue: 0,
      cash: 25_000,
      bank: 0,
    });
    expect(dayTwo.due).toBe(5_000);
  });

  it("is the same answer whether the two days are read one by one or together", () => {
    const together = dueOf({ openingDue: 0, givenValue: 110_000, returnedValue: 0, cash: 105_000, bank: 0 });
    expect(together.due).toBe(5_000);
  });
});

describe("what reduces a due, and what does not", () => {
  it("a reported sale does not reduce it", () => {
    /*
     * The whole point. Someone who sells and keeps the money still owes it.
     * `dueOf` cannot be told about a sale at all — there is no argument for
     * one — so no caller can make this mistake by passing the wrong field.
     */
    expect(Object.keys(dueOf({ openingDue: 0, givenValue: 0, returnedValue: 0, cash: 0, bank: 0 }))).not.toContain(
      "sold",
    );
    const sold25 = dueOf({ openingDue: 0, givenValue: 25_000, returnedValue: 0, cash: 20_000, bank: 0 });
    expect(sold25.due).toBe(5_000);
  });

  it("returned goods reduce it, at the price of the row they came from", () => {
    const d = dueOf({ openingDue: 0, givenValue: 100_000, returnedValue: 20_000, cash: 80_000, bank: 0 });
    expect(d.due).toBe(0);
  });

  it("bank and cash reduce it identically", () => {
    const allCash = dueOf({ openingDue: 0, givenValue: 1000, returnedValue: 0, cash: 600, bank: 0 });
    const split = dueOf({ openingDue: 0, givenValue: 1000, returnedValue: 0, cash: 350, bank: 250 });
    expect(split.due).toBe(allCash.due);
  });

  it("an overpayment is shown as one, not as a settled account", () => {
    const d = dueOf({ openingDue: 0, givenValue: 1000, returnedValue: 0, cash: 1200, bank: 0 });
    expect(d.due).toBe(-200);
    expect(dueTone(d.due)).toBe("over");
    expect(dueTone(0)).toBe("clear");
    expect(dueTone(1)).toBe("owing");
  });
});

describe("the owner's stock-return example", () => {
  /*
   * "kau re recharge balance diya hoice 50000 and sim diya hoice 20 ta..
   *  she sara din a 40000 takar recharge sell korce and 15 ta sim active
   *  korce.. chaile she baki 10000 taka and 5ta sim accounts ke farot diye
   *  dite pare"
   *
   * Two units, one mechanic — which is why iTopup is a product here rather
   * than a table of its own.
   */
  const movements: MovementRow[] = [
    { kind: "GIVEN", productId: "topup", qty: 50_000, unitPrice: 1 },
    { kind: "SOLD", productId: "topup", qty: 40_000, unitPrice: 1 },
    { kind: "RETURNED", productId: "topup", qty: 10_000, unitPrice: 1 },
    { kind: "GIVEN", productId: "sim150", qty: 20, unitPrice: 150 },
    { kind: "SOLD", productId: "sim150", qty: 15, unitPrice: 150 },
    { kind: "RETURNED", productId: "sim150", qty: 5, unitPrice: 150 },
  ];

  it("leaves nothing in hand once everything is sold or returned", () => {
    const lines = stockLines(movements, [SIM, TOPUP]);
    expect(lines.find((l) => l.product.id === "topup")!.inHand).toBe(0);
    expect(lines.find((l) => l.product.id === "sim150")!.inHand).toBe(0);
  });

  it("leaves the RSO owing exactly what they sold and have not deposited", () => {
    const lines = stockLines(movements, [SIM, TOPUP]);
    const v = movementValue(lines);
    // Given 50,000 + 3,000; returned 10,000 + 750.
    expect(v.givenValue).toBe(53_000);
    expect(v.returnedValue).toBe(10_750);
    const d = dueOf({ openingDue: 0, ...v, cash: 0, bank: 0 });
    // Nothing deposited yet, so the whole value of what was sold is owed.
    expect(d.due).toBe(42_250);
    expect(d.due).toBe(v.soldValue);
  });

  it("counts iTopup in Taka and the rest in pieces", () => {
    expect(isMoneyProduct("ITOPUP")).toBe(true);
    expect(isMoneyProduct("SIM")).toBe(false);
    // qty IS the amount for a Taka-unit product, because its price is 1.
    expect(lineValue(50_000, 1)).toBe(50_000);
  });
});

describe("nobody's stock is added to anybody else's", () => {
  it("stockLines is given one holder's movements and has no holder argument", () => {
    /*
     * The owner: "proti ta person ar stock alada.. kaur sathe kaur kono stock
     * jog hobe na". The guard is structural — there is nowhere to pass two
     * holders — and this test states why, so a later "helpful" signature
     * change has to argue with it.
     */
    expect(stockLines.length).toBe(2);
    const src = read("lib/stock.ts");
    expect(src).toContain("There is no team total here and");
  });

  it("a supervisor's team is a list of people, not a sum", () => {
    // The rollups that DO sum across people live in lib/bp-rollup.ts and are
    // about one outlet's SIMs, not about money anybody owes.
    const src = read("lib/stock.ts");
    expect(src).not.toMatch(/teamDue|totalDueForTeam|sumDue/);
  });
});

describe("stock on hand", () => {
  it("opening stock counts as held", () => {
    const lines = stockLines([{ kind: "OPENING", productId: "card", qty: 100, unitPrice: 39 }], [CARD]);
    expect(lines[0].inHand).toBe(100);
    expect(lines[0].inHandValue).toBe(3900);
  });

  it("a negative balance is shown, not clamped away", () => {
    /*
     * Selling more than was ever given is a data error. Clamping it to zero
     * would leave the error in the database and remove the only sign of it.
     */
    const lines = stockLines(
      [
        { kind: "GIVEN", productId: "card", qty: 10, unitPrice: 39 },
        { kind: "SOLD", productId: "card", qty: 14, unitPrice: 39 },
      ],
      [CARD],
    );
    expect(lines[0].inHand).toBe(-4);
  });

  it("rounds each line to the paisa so a column adds up to its total", () => {
    const odd: ProductRow = { id: "odd", category: "CARD", subType: "Odd" };
    const lines = stockLines([{ kind: "GIVEN", productId: "odd", qty: 3, unitPrice: 33.335 }], [odd]);
    expect(lines[0].givenValue).toBe(paisa(3 * 33.335));
    expect(lines[0].givenValue).toBe(100.01);
  });
});

describe("a price change cannot reach a figure already recorded", () => {
  /*
   * The owner, in his own words:
   *
   *   "amon vabe jinish ta ready koro jate price change korlau ager data te
   *    effect jate na pore... ager sell kora product ba rso der jai product
   *    lifting kora hoice oi product ar price change hole full hisab change
   *    hoye jabe"
   *
   * v192 answered this with a RULE — a price was frozen once something
   * referred to it. v193 answers it with the DATA: every movement carries the
   * price it was recorded at, so there is no path from the product master to a
   * saved figure for a rule to have to guard.
   */

  it("a movement is valued from its own price, not the product's", () => {
    // The product fixture has no price at all. If any of this read through the
    // product, these numbers could not be computed.
    const lines = stockLines([{ kind: "GIVEN", productId: "card", qty: 10, unitPrice: 39 }], [CARD]);
    expect(lines[0].givenValue).toBe(390);
    expect(Object.keys(CARD)).not.toContain("price");
  });

  it("two lots of the same product keep the price each was handed at", () => {
    /*
     * The case v192 solved by making them two different products, which is
     * why a holder's stock table showed "39 Tk Card" twice. One product, two
     * prices, one line — and the money still exact.
     */
    const lines = stockLines(
      [
        { kind: "GIVEN", productId: "card", qty: 10, unitPrice: 39 },
        { kind: "GIVEN", productId: "card", qty: 10, unitPrice: 40 },
      ],
      [CARD],
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].inHand).toBe(20);
    expect(lines[0].inHandValue).toBe(790);
    expect(lines[0].carryPrice).toBe(39.5);
  });

  it("stock in hand is valued at what the holder was charged, never at a current price", () => {
    const src = read("lib/stock.ts");
    expect(src).toContain("const inHandValue = inHand > 0 ? paisa(row.v) : 0;");
    // The only price a StockLine exposes is the one derived from movements.
    expect(src).toContain("carryPrice: inHand > 0 ? paisa(inHandValue / inHand) : 0,");
  });

  /*
   * v199, found by review: a SALE is priced by the day it is reported, and
   * v193–v198 took that price out of the carrying value. Each case below gave
   * the wrong return credit before the fix.
   */
  const SIM = [{ id: "s", category: "SIM" as const, subType: "SIM" }];
  const mv = (date: string, kind: "OPENING" | "GIVEN" | "SOLD" | "RETURNED", qty: number, unitPrice: number) => ({
    date,
    kind,
    productId: "s",
    qty,
    unitPrice,
  });

  it("a price DROP after giving does not cheapen what is still held", () => {
    // 10 given at ৳100; the price falls to ৳50; 9 reported sold at ৳50.
    const [l] = stockLines([mv("2026-09-01", "GIVEN", 10, 100), mv("2026-09-05", "SOLD", 9, 50)], SIM);
    expect(l.inHand).toBe(1);
    expect(l.carryPrice).toBe(100); // was ৳550
    expect(l.inHandValue).toBe(100);
  });

  it("a price RISE after giving never makes the remainder negative", () => {
    const [l] = stockLines([mv("2026-09-01", "GIVEN", 10, 100), mv("2026-09-05", "SOLD", 9, 150)], SIM);
    expect(l.inHandValue).toBe(100); // was −৳350
    expect(l.carryPrice).toBe(100);
  });

  it("stock long sold does not blend into a later lot", () => {
    const [l] = stockLines(
      [mv("2026-01-10", "GIVEN", 10, 100), mv("2026-01-20", "SOLD", 10, 100), mv("2026-02-01", "GIVEN", 10, 50)],
      SIM,
    );
    expect(l.carryPrice).toBe(50); // not a ৳75 blend
  });

  it("two lots still held are carried at their blend", () => {
    const [l] = stockLines([mv("2026-09-01", "GIVEN", 10, 39), mv("2026-09-02", "GIVEN", 10, 40)], SIM);
    expect(l.inHandValue).toBe(790);
    expect(l.carryPrice).toBe(39.5);
  });

  it("more reported sold than given holds nothing, and the next lot is carried at its own price", () => {
    const over = stockLines([mv("2026-09-01", "GIVEN", 5, 100), mv("2026-09-02", "SOLD", 8, 100)], SIM)[0];
    expect(over.inHand).toBe(-3);
    expect(over.inHandValue).toBe(0);
    const covered = stockLines(
      [mv("2026-09-01", "GIVEN", 5, 100), mv("2026-09-02", "SOLD", 8, 100), mv("2026-09-03", "GIVEN", 10, 90)],
      SIM,
    )[0];
    expect(covered.inHand).toBe(7);
    expect(covered.carryPrice).toBe(90);
  });

  it("the due still uses each line's own price — only the carrying value is averaged", () => {
    const lines = stockLines(
      [mv("2026-09-01", "GIVEN", 10, 100), mv("2026-09-05", "SOLD", 9, 50), mv("2026-09-06", "RETURNED", 1, 100)],
      SIM,
    );
    expect(movementValue(lines)).toEqual({ givenValue: 1000, returnedValue: 100, soldValue: 450 });
  });

  it("the type system removes the temptation", () => {
    /*
     * ProductRow carries no price, so a screen holding one cannot value a
     * historical movement with today's figure even by accident. When this
     * field was removed, the compiler found all sixteen places that had been
     * reaching for it.
     */
    const src = read("lib/stock.ts");
    const start = src.indexOf("export type ProductRow = {");
    const type = src.slice(start, src.indexOf("};", start));
    expect(type).toContain("subType");
    expect(type).not.toMatch(/\bprice\b/);
  });
});

describe("what a product cost on a given day", () => {
  const PRICES = [
    { price: 39, effectiveFrom: "2026-01-01" },
    { price: 40, effectiveFrom: "2026-09-13" },
    { price: 42, effectiveFrom: "2026-12-01" },
  ];

  it("is the latest price starting on or before that day", () => {
    expect(priceOn(PRICES, "2026-09-12")).toBe(39);
    expect(priceOn(PRICES, "2026-09-13")).toBe(40);
    expect(priceOn(PRICES, "2026-11-30")).toBe(40);
    expect(priceOn(PRICES, "2026-12-01")).toBe(42);
  });

  it("is null before the first price, not zero", () => {
    /*
     * A product added in October has no September price. Zero would record a
     * free handout that nobody would ever notice; null makes the entry screen
     * refuse the line and say which product needs a price.
     */
    expect(priceOn(PRICES, "2025-12-31")).toBeNull();
  });

  it("does not depend on the order the rows arrive in", () => {
    expect(priceOn([...PRICES].reverse(), "2026-09-14")).toBe(40);
  });

  it("is what a back-dated correction uses", () => {
    /*
     * The second half of the owner's worry, and the hole v192 left open:
     * correcting a day from before a price change must use the price that
     * applied THEN. Same function, same answer, whatever today is.
     */
    expect(priceOn(PRICES, "2026-09-01")).toBe(39);
  });
});

describe("a return credits what it was lifted at", () => {
  /*
   * The owner's ruling: "je dame nice sei dame". Lift ten cards at 39, the
   * price rises to 40, hand those ten back — the due clears by exactly 390.
   * At today's price it would clear 400 and leave him 10 ahead for doing
   * nothing.
   */
  it("the owner's case lands exactly on zero", () => {
    const afterLift = dueOf({ openingDue: 0, givenValue: 390, returnedValue: 0, cash: 0, bank: 0 });
    expect(afterLift.due).toBe(390);
    const afterReturn = dueOf({ openingDue: 0, givenValue: 390, returnedValue: 390, cash: 0, bank: 0 });
    expect(afterReturn.due).toBe(0);
  });

  it("today's price would have left him ten taka ahead", () => {
    const wrong = dueOf({ openingDue: 0, givenValue: 390, returnedValue: 400, cash: 0, bank: 0 });
    expect(wrong.due).toBe(-10);
    expect(dueTone(wrong.due)).toBe("over");
  });

  it("defaults to what the holder is carrying, blended across lots", () => {
    const lines = stockLines(
      [
        { kind: "GIVEN", productId: "card", qty: 10, unitPrice: 39 },
        { kind: "GIVEN", productId: "card", qty: 10, unitPrice: 40 },
      ],
      [CARD],
    );
    expect(returnPriceFor(lines[0], 40)).toBe(39.5);
  });

  it("falls back to the day's price when they are carrying none", () => {
    expect(returnPriceFor(undefined, 40)).toBe(40);
    expect(returnPriceFor({ inHand: 0, carryPrice: 0 }, 40)).toBe(40);
  });

  it("the entry screen shows the figure instead of applying it silently", () => {
    const src = read("app/components/StockDayEntry.tsx");
    expect(src).toContain("aria-label={`Return price — ${p.subType}`}");
    // And says so when the lot differs from today's catalogue price.
    expect(src).toContain("carried at");
  });

  it("only a return may carry a price from the client", () => {
    /*
     * Give and Sell are priced by the DATE on the server. If the client could
     * name their price, the protection would be back to trusting a caller.
     */
    const src = read("app/api/stock/day/route.ts");
    expect(src).toContain('if (kind === "RETURNED") {');
    // v199: an existing line keeps its snapshot; a new one takes the day's price. Never the client's.
    expect(src).toContain("unitPrice = saved.get(`${productId}|${kind}`) ?? onDate.get(productId) ?? null;");
  });

  it("re-saving a day keeps each saved line's price (v199)", () => {
    const src = read("app/api/stock/day/route.ts");
    expect(src).toMatch(/const saved = new Map\(/);
    expect(src).toMatch(/kind: \{ in: \["GIVEN", "SOLD"\] \}/);
  });

  it("a return price far above anything the product has cost is refused (v199)", () => {
    expect(read("app/api/stock/day/route.ts")).toMatch(/unitPrice > ceiling \* 1\.5/);
  });

  it("quantities are whole units and dates are real days (v199)", () => {
    for (const f of ["app/api/stock/day/route.ts", "app/api/stock/opening/route.ts", "app/api/stock/lifting/route.ts"])
      expect(read(f), f).toMatch(/Number\.isInteger/);
    for (const f of [
      "app/api/stock/day/route.ts",
      "app/api/stock/opening/route.ts",
      "app/api/stock/lifting/route.ts",
      "app/api/stock/expenses/route.ts",
      "app/api/stock/products/route.ts",
    ])
      expect(read(f), f).toContain("isYmd(");
  });

  it("a product with no price on the day is refused, never recorded at zero", () => {
    for (const f of ["app/api/stock/day/route.ts", "app/api/stock/opening/route.ts"]) {
      expect(read(f), `${f} would record a free handout`).toContain("has no price on");
    }
  });
});

describe("only Accounts enters, and six roles read", () => {
  /*
   * The owner: "Aita sudu accounts entry korbe...and rso individual dekhbe..
   * supervisor, manager, it, admin tara Rso and bp der stock dekhte parbe".
   *
   * The three entry pages spell the role out as a literal because
   * tests/route-guards reads their `requireUser` call as SOURCE TEXT — a guard
   * it cannot read is not a guard. That makes two statements of one rule, so
   * this checks they agree rather than trusting that they do.
   */
  const ENTRY_PAGES = ["app/stock/daily/page.tsx", "app/stock/opening/page.tsx", "app/stock/products/page.tsx"];

  it("the API constant and the page literals say the same thing", () => {
    expect(STOCK_WRITE_ROLES).toEqual(["ACCOUNTS"]);
    for (const f of ENTRY_PAGES) {
      expect(read(f), `${f} does not name its role in a literal route-guards can read`).toContain(
        'requireUser(["ACCOUNTS"])',
      );
    }
  });

  it("every write route checks the role before it writes", () => {
    for (const f of [
      "app/api/stock/day/route.ts",
      "app/api/stock/opening/route.ts",
      "app/api/stock/products/route.ts",
    ]) {
      const src = read(f);
      expect(src, `${f} does not check who is calling`).toContain("STOCK_WRITE_ROLES.includes(me.role)");
      /*
       * Inlined in each handler, not hidden in a shared guard() — v189's
       * lesson: the API test reads each handler's own body, and a limiter it
       * cannot see is a limiter nobody knows is missing.
       */
      expect(src, `${f} has no rate limit`).toContain("consumeRateLimit");
    }
  });

  it("a BP holder is the outlet, not the RSO holding it", () => {
    /*
     * An outlet changes hands (v142/v143); the boxes do not move with the
     * assignment. So BP stock hangs off the retailer id.
     */
    const src = read("lib/stock-data.ts");
    expect(src).toContain('holderKey("BP", b.retailerId)');
    expect(src).toContain("A BP is the OUTLET, not the RSO holding it");
  });
});

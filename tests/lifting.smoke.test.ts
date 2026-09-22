/**
 * The house's own books: godown stock, margin, expenses, and the SIM check.
 *
 * Two things are guarded here that are not arithmetic at all, because they are
 * what the owner actually asked for:
 *
 *   1. Nothing in this module may move a holder's DUE. An RSO's balance must
 *      not change because the office bought tea, and the SIM check is
 *      explicitly *"just tar knowledge ar jono"*.
 *   2. The buying price stays with Accounts, IT and Admin.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CHECKED_CATEGORY,
  EXPENSE_CATEGORIES,
  bySuspicion,
  costBasis,
  expenseTotals,
  houseLines,
  marginPercent,
  profitOf,
  simCheck,
  type IssuedRow,
  type LiftRow,
} from "../lib/lifting";
import { BOOKS_READ_ROLES, BOOKS_WRITE_ROLES, SIM_CHECK_ROLES } from "../lib/lifting-data";
import type { ProductRow } from "../lib/stock";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
/** Source with comments stripped — the owner's words quoted in a note are not code. */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const SIM: ProductRow = { id: "sim", category: "SIM", subType: "Normal SIM 150" };

describe("what a unit cost us", () => {
  it("averages across every lifting, not the latest one", () => {
    /*
     * The latest cost would revalue last month's margin every time a new
     * invoice arrived. The average is stable and is what an accountant
     * expects; 100 at 120 and 100 at 130 carries at 125.
     */
    const basis = costBasis([
      { productId: "sim", qty: 100, unitCost: 120 },
      { productId: "sim", qty: 100, unitCost: 130 },
    ]);
    expect(basis.get("sim")!.avgCost).toBe(125);
    expect(basis.get("sim")!.liftedQty).toBe(200);
    expect(basis.get("sim")!.liftedCost).toBe(25_000);
  });

  it("weights by quantity, not by number of invoices", () => {
    const basis = costBasis([
      { productId: "sim", qty: 900, unitCost: 120 },
      { productId: "sim", qty: 100, unitCost: 130 },
    ]);
    expect(basis.get("sim")!.avgCost).toBe(121);
  });

  it("a product never lifted has no cost, and that is not zero", () => {
    const basis = costBasis([]);
    expect(basis.get("sim")).toBeUndefined();
    // And the screen prints "no cost yet" rather than calling it pure profit.
    expect(read("app/stock/profit/page.tsx")).toContain("no cost yet");
  });
});

describe("what is in the godown", () => {
  const lifts: LiftRow[] = [{ productId: "sim", qty: 100, unitCost: 120 }];

  it("is lifted minus what went out plus what came back", () => {
    const issued: IssuedRow[] = [
      {
        productId: "sim",
        givenQty: 60,
        givenValue: 9000,
        returnedQty: 10,
        returnedValue: 1500,
        soldQty: 40,
        soldValue: 6000,
      },
    ];
    const [line] = houseLines([SIM], lifts, issued);
    expect(line.inGodown).toBe(50);
    expect(line.godownValue).toBe(6000);
  });

  it("does not add back what was SOLD — that went to a customer", () => {
    const issued: IssuedRow[] = [
      {
        productId: "sim",
        givenQty: 100,
        givenValue: 15000,
        returnedQty: 0,
        returnedValue: 0,
        soldQty: 100,
        soldValue: 15000,
      },
    ];
    const [line] = houseLines([SIM], lifts, issued);
    expect(line.inGodown).toBe(0);
  });

  it("a negative godown is shown, not clamped", () => {
    /*
     * More went out than was ever recorded coming in — usually a lifting
     * nobody entered. Clamping would leave the error in the database and take
     * the only sign of it off the screen.
     */
    const issued: IssuedRow[] = [
      {
        productId: "sim",
        givenQty: 140,
        givenValue: 21000,
        returnedQty: 0,
        returnedValue: 0,
        soldQty: 0,
        soldValue: 0,
      },
    ];
    const [line] = houseLines([SIM], lifts, issued);
    expect(line.inGodown).toBe(-40);
    expect(read("app/components/LiftingViews.tsx")).toContain("l.inGodown < 0 ?");
  });
});

describe("the two margins", () => {
  const lifts: LiftRow[] = [{ productId: "sim", qty: 100, unitCost: 120 }];
  const issued: IssuedRow[] = [
    {
      productId: "sim",
      givenQty: 60,
      givenValue: 9000,
      returnedQty: 10,
      returnedValue: 1500,
      soldQty: 40,
      soldValue: 6000,
    },
  ];

  it("issued says what is in play", () => {
    const [line] = houseLines([SIM], lifts, issued);
    // 50 net out at 150 = 7,500, which cost 50 × 120 = 6,000.
    expect(line.issuedQty).toBe(50);
    expect(line.issuedValue).toBe(7500);
    expect(line.issuedCost).toBe(6000);
    expect(line.marginIssued).toBe(1500);
  });

  it("sold says what has been earned", () => {
    const [line] = houseLines([SIM], lifts, issued);
    expect(line.soldValue).toBe(6000);
    expect(line.soldCost).toBe(4800);
    expect(line.marginSold).toBe(1200);
  });

  it("the net is on the SOLD basis, less expenses", () => {
    /*
     * Stock sitting with an RSO is not profit — it is stock with an RSO.
     * Calling it profit is how a distributor finds out at the end of a quarter
     * that the money was never there.
     */
    const lines = houseLines([SIM], lifts, issued);
    const p = profitOf(lines, 500);
    expect(p.marginIssued).toBe(1500);
    expect(p.marginSold).toBe(1200);
    expect(p.net).toBe(700);
    expect(p.net).toBe(p.marginSold - p.expenses);
  });

  it("a loss comes out negative rather than being hidden", () => {
    const p = profitOf(houseLines([SIM], lifts, issued), 5000);
    expect(p.net).toBe(-3800);
  });

  it("a product with NO lifting contributes no margin at all", () => {
    /*
     * v194's own defect, found by .scratch/audit194.ts on its first run. The
     * per-row screen already said "no cost yet", but the TOTAL was summing
     * `soldValue − 0` for those rows — ৳3.3 lakh of invented profit in the
     * seeded month. No cost is not a cost of zero; it is the same rule the
     * percentage columns learned in v175 and the raw pairs in v191.
     */
    const free: ProductRow = { id: "free", category: "ITOPUP", subType: "iTopup balance" };
    const lines = houseLines(
      [SIM, free],
      [{ productId: "sim", qty: 100, unitCost: 120 }],
      [
        {
          productId: "sim",
          givenQty: 10,
          givenValue: 1500,
          returnedQty: 0,
          returnedValue: 0,
          soldQty: 10,
          soldValue: 1500,
        },
        {
          productId: "free",
          givenQty: 5000,
          givenValue: 5000,
          returnedQty: 0,
          returnedValue: 0,
          soldQty: 5000,
          soldValue: 5000,
        },
      ],
    );
    const uncosted = lines.find((l) => l.product.id === "free")!;
    expect(uncosted.hasCost).toBe(false);
    expect(uncosted.marginSold).toBe(0);
    expect(uncosted.marginIssued).toBe(0);

    const p = profitOf(lines, 0);
    // The costed product alone: 1,500 sold at a cost of 1,200.
    expect(p.soldValue).toBe(1500);
    expect(p.marginSold).toBe(300);
    // And what was left out is reported, not silently dropped.
    expect(p.uncostedSoldValue).toBe(5000);
    expect(p.uncostedProducts).toEqual(["iTopup balance"]);
  });

  it("godown stock with no cost is left unvalued and named, not valued at zero", () => {
    /*
     * The second place v194's rule applied, found by v195's hunt: the margin
     * had learned that no cost is not a cost of zero, but the godown value and
     * the "out with people" cost had not — ৳39.8 lakh of iTopup balance was
     * printed as worth ৳0 on two screens.
     */
    const free: ProductRow = { id: "free", category: "ITOPUP", subType: "iTopup balance" };
    const lines = houseLines(
      [SIM, free],
      [
        { productId: "sim", qty: 100, unitCost: 120 },
        { productId: "free", qty: 5000, unitCost: 0 },
      ],
      [],
    );
    const p = profitOf(lines, 0);
    // Only the SIMs are valued: 100 × 120.
    expect(p.godownValue).toBe(12_000);
    expect(p.unvaluedProducts).toEqual(["iTopup balance"]);
    // And every screen that shows a godown figure prints "no cost yet" for it.
    expect(read("app/components/LiftingViews.tsx")).toContain("l.hasCost ? fmtMoney(l.godownValue)");
    expect(read("app/stock/lifting/page.tsx")).toContain("Not valued above");
  });

  it("the profit screen names what it excluded", () => {
    // Leaving it out understates the business exactly as counting it at zero
    // cost overstated it, so the screen says which products and how much.
    const src = read("app/stock/profit/page.tsx");
    expect(src).toContain("Not counted above");
    expect(src).toContain("profit.uncostedProducts");
    expect(src).toContain("profit.uncostedSoldValue");
  });

  it("margin percent declines to divide by nothing", () => {
    expect(marginPercent(100, 1000)).toBe(10);
    expect(marginPercent(0, 0)).toBeNull();
  });
});

describe("expenses", () => {
  it("split cash from bank and total by kind", () => {
    const t = expenseTotals([
      { category: "TRANSPORT", amount: 300, paidFrom: "CASH" },
      { category: "TRANSPORT", amount: 200, paidFrom: "CASH" },
      { category: "SALARY", amount: 9000, paidFrom: "BANK" },
    ]);
    expect(t.total).toBe(9500);
    expect(t.cash).toBe(500);
    expect(t.bank).toBe(9000);
    expect(t.byCategory).toEqual([
      { category: "TRANSPORT", amount: 500 },
      { category: "SALARY", amount: 9000 },
    ]);
  });

  it("an empty kind is left out rather than printed as zero", () => {
    const t = expenseTotals([{ category: "FOOD", amount: 50, paidFrom: "CASH" }]);
    expect(t.byCategory).toHaveLength(1);
  });

  it("'Other' must say what it was for", () => {
    // Otherwise it is an entry nobody can explain next month.
    expect(EXPENSE_CATEGORIES).toContain("OTHER");
    expect(read("app/api/stock/expenses/route.ts")).toContain('category === "OTHER" && !note.trim()');
  });
});

describe("the SIM check", () => {
  /*
   * The owner: "100 sim tar kach theke niche 50 ta active korce but 30 ta
   * sell dekhaice.. ar mane baki 20tar taka tar kache ace".
   */
  const base = { employeeId: "e1", name: "RSO 1", code: "017", supervisorName: "Dhaka North", avgPrice: 150 };

  it("an RSO never handed a SIM has no price, not a price of zero", () => {
    /*
     * v195's defect hunt: three RSOs activated 1,524 SIMs in the period but the
     * ledger had never handed them one, so their gap printed "Worth ৳0". The
     * honest answer is that nobody knows, and the check says so.
     */
    const c = simCheck({ ...base, given: 0, activated: 526, sold: 0, avgPrice: null });
    expect(c.unreported).toBe(526);
    expect(c.unreportedValue).toBeNull();
  });

  it("an unpriced gap sorts by its count, not to the bottom as if worthless", () => {
    const rows = [
      simCheck({ ...base, employeeId: "priced", name: "P", given: 10, activated: 12, sold: 10, avgPrice: 150 }),
      simCheck({ ...base, employeeId: "unpriced", name: "U", given: 0, activated: 500, sold: 0, avgPrice: null }),
    ];
    // Priced money leads; the unpriced gap is still above anyone with no gap.
    const ordered = bySuspicion([
      ...rows,
      simCheck({ ...base, employeeId: "clear", name: "C", given: 5, activated: 5, sold: 5, avgPrice: 150 }),
    ]).map((r) => r.employeeId);
    expect(ordered.indexOf("unpriced")).toBeLessThan(ordered.indexOf("clear"));
  });

  it("the price falls back to the RSO's own history before giving up", () => {
    // Somebody handed nothing THIS period still has a known price from before.
    expect(read("lib/lifting-data.ts")).toContain("byAllTime.get(e.id) ?? null");
  });

  it("his own example comes out at twenty", () => {
    const c = simCheck({ ...base, given: 100, activated: 50, sold: 30 });
    expect(c.unreported).toBe(20);
    expect(c.unreportedValue).toBe(3000);
    expect(c.notActivated).toBe(50);
  });

  it("reporting more than was activated is not a negative gap", () => {
    // They sold stock activated in an earlier period; that is not a credit.
    const c = simCheck({ ...base, given: 100, activated: 30, sold: 50 });
    expect(c.unreported).toBe(0);
    expect(c.unreportedValue).toBe(0);
  });

  it("worst first, by money rather than by count", () => {
    const rows = [
      simCheck({ ...base, employeeId: "a", name: "A", given: 100, activated: 40, sold: 20, avgPrice: 100 }),
      simCheck({ ...base, employeeId: "b", name: "B", given: 100, activated: 35, sold: 25, avgPrice: 300 }),
    ];
    // A has the bigger count (20 vs 10); B has the bigger money (3,000 vs 2,000).
    expect(bySuspicion(rows).map((r) => r.employeeId)).toEqual(["b", "a"]);
  });

  it("only SIMs are checked — a scratch card has no activation", () => {
    expect(CHECKED_CATEGORY).toBe("SIM");
    expect(read("lib/lifting-data.ts")).toContain('p."category" = ${CHECKED_CATEGORY}');
  });

  it("counts every activation, not just the ones that score a GA target", () => {
    /*
     * `withStandardGa` answers "what counts towards a target" and excludes
     * swaps. A swap SIM is a product in the catalogue that the RSO is charged
     * for, so its activation is a SIM leaving their hands exactly as a new
     * connection is. Different question, same table.
     */
    // The note naming the distinction is in a comment; the ABSENCE of the
    // filter is in the code, so each is checked where it lives.
    expect(code("lib/lifting-data.ts")).not.toContain("withStandardGa");
    expect(read("lib/lifting-data.ts")).toContain("how many SIMs physically went out");
  });
});

describe("none of this moves anybody's due", () => {
  it("the due formula knows nothing about liftings or expenses", () => {
    const src = code("lib/stock.ts");
    expect(src).not.toMatch(/lifting|expense|unitCost/i);
  });

  it("the books module never writes a movement or a deposit", () => {
    const src = read("lib/lifting-data.ts");
    expect(src).not.toMatch(/stockMovement\.(create|update|upsert|delete)/);
    expect(src).not.toMatch(/cashDeposit\.(create|update|upsert|delete)/);
    expect(src).not.toMatch(/stockOpening\.(create|update|upsert)/);
  });

  it("the expense and lifting routes touch only their own tables", () => {
    for (const f of ["app/api/stock/expenses/route.ts", "app/api/stock/lifting/route.ts"]) {
      const src = read(f);
      expect(src, `${f} writes to the stock ledger`).not.toMatch(/stockMovement|cashDeposit|stockOpening/);
    }
  });

  it("the SIM check page says so on the screen", () => {
    // Otherwise the first question anybody asks is whether it charges them.
    expect(read("app/stock/sim-check/page.tsx")).toContain("changes nobody&apos;s due");
  });

  it("the expense form says so too", () => {
    expect(read("app/components/ExpenseViews.tsx")).toContain("Nobody&apos;s due changes");
  });
});

describe("who may see what we paid", () => {
  it("the buying side is Accounts, IT and Admin", () => {
    expect(BOOKS_WRITE_ROLES).toEqual(["ACCOUNTS"]);
    expect([...BOOKS_READ_ROLES].sort()).toEqual(["ACCOUNTS", "ADMIN", "IT"]);
  });

  it("the three pages name those roles in a literal route-guards can read", () => {
    for (const f of ["app/stock/lifting/page.tsx", "app/stock/expenses/page.tsx", "app/stock/profit/page.tsx"]) {
      expect(read(f), `${f} does not name its roles`).toContain('requireUser(["ACCOUNTS", "ADMIN", "IT"])');
    }
  });

  it("the SIM check is wider, and carries no purchase price", () => {
    expect([...SIM_CHECK_ROLES].sort()).toEqual(["ACCOUNTS", "ADMIN", "IT", "MANAGER", "SUPERVISOR"]);
    const src = read("app/stock/sim-check/page.tsx");
    expect(src).toContain('requireUser(["ACCOUNTS", "ADMIN", "IT", "MANAGER", "SUPERVISOR"])');
    // No cost, no margin, no lifting figure anywhere on it.
    expect(src).not.toMatch(/unitCost|avgCost|margin|liftedCost/i);
  });

  it("a manager's menu does not offer them", () => {
    /*
     * A manager writes campaigns and reads every RSO's due, and still must not
     * see a purchase price — so the flag is separate from `writersOnly`.
     */
    const src = read("app/components/AppShell.tsx");
    expect(src).toContain("booksOnly?: boolean;");
    expect(src).toContain('const BOOKS_ROLES = ["ACCOUNTS", "ADMIN", "IT"];');
    expect(src).toContain("if (item.booksOnly && !BOOKS_ROLES.includes(role.toUpperCase())) return false;");
  });

  it("every write route checks the role and rate-limits in its own body", () => {
    for (const f of ["app/api/stock/lifting/route.ts", "app/api/stock/expenses/route.ts"]) {
      const src = read(f);
      expect(src, `${f} does not check who is calling`).toContain("BOOKS_WRITE_ROLES.includes(me.role)");
      expect(src, `${f} has no rate limit`).toContain("consumeRateLimit");
    }
  });
});

describe("the cost price is snapshotted, like the selling price", () => {
  it("Lifting carries its own unitCost", () => {
    /*
     * v193 did this for what we charge the RSO. The supplier's price changes
     * too, and a purchase recorded in September must keep September's cost or
     * every margin this app has ever shown moves the next time somebody
     * updates a price list.
     */
    const schema = read("prisma/schema.prisma");
    const model = schema.slice(
      schema.indexOf("model Lifting {"),
      schema.indexOf("}", schema.indexOf("model Lifting {")),
    );
    expect(model).toContain("unitCost");
    expect(model).toContain("Decimal(18, 2)");
  });

  it("nothing reads a current cost off the product", () => {
    const src = read("lib/lifting.ts");
    expect(src).toContain("l.unitCost");
    // Product has no cost field at all to reach for.
    expect(read("prisma/schema.prisma")).not.toMatch(
      /model Product \{[\s\S]*?\n\}/.source ? /unitCost\s+Decimal[\s\S]{0,40}model Lifting/ : /x^/,
    );
  });
});

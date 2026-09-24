/**
 * v201 — the owner's own kinds of product and expense, and search by phone.
 *
 * "ami jodi oi jagai ono product add korte chai .. jamon smart watch.. tahole
 * ki vabe korbo kono option rakho nai... same expanse a o add kore dio"
 *
 * "RSO wallet .. jaita mobile number ace oita diye search ar option rakho...
 * bp der account a jai phone number ace oita diye search dile jate ase"
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABEL, kindLabel } from "../lib/stock";
import { EXPENSE_CATEGORY_LABEL, expenseLabel, expenseTotals } from "../lib/lifting";
import { matchesTokens, searchTokens } from "../lib/text-search";
import { matchOptions } from "../app/components/Picker";

const read = (p: string) => readFileSync(p, "utf8");

describe("a product kind the owner names himself", () => {
  it("OTHER carries its own name, and falls back to 'Other' with none", () => {
    expect(PRODUCT_CATEGORIES).toContain("OTHER");
    expect(kindLabel({ category: "OTHER", kindName: "Smart watch" })).toBe("Smart watch");
    expect(kindLabel({ category: "OTHER", kindName: "  Power bank " })).toBe("Power bank");
    expect(kindLabel({ category: "OTHER", kindName: null })).toBe(PRODUCT_CATEGORY_LABEL.OTHER);
    expect(kindLabel({ category: "OTHER", kindName: "   " })).toBe(PRODUCT_CATEGORY_LABEL.OTHER);
  });

  it("a built-in kind ignores any stray name", () => {
    expect(kindLabel({ category: "ROUTER", kindName: "Smart watch" })).toBe(PRODUCT_CATEGORY_LABEL.ROUTER);
  });

  it("the schema and the migration both have it", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).toMatch(/enum ProductCategory \{[^}]*\bOTHER\b/);
    expect(schema).toMatch(/kindName\s+String\?/);
    const sql = read("prisma/migrations/20260924100000_custom_product_kinds_and_expense_types/migration.sql");
    expect(sql).toContain(`ALTER TYPE "ProductCategory" ADD VALUE 'OTHER'`);
    expect(sql).toMatch(/ALTER TABLE "Product" ADD COLUMN\s+"kindName" TEXT/);
    expect(sql).toMatch(/ALTER TABLE "Expense" ADD COLUMN\s+"label" TEXT/);
  });

  it("the API insists on a name and keeps one spelling per kind", () => {
    const api = read("app/api/stock/products/route.ts");
    expect(api).toContain('if (category === "OTHER")');
    expect(api).toMatch(/kindName: \{ equals: typed, mode: "insensitive" \}/);
  });

  it("the Products form offers existing kinds and a new one", () => {
    const form = read("app/components/ProductMaster.tsx");
    expect(form).toContain('<option value="NEW">+ A new kind…</option>');
    expect(form).toContain("customKinds");
  });

  it("every screen that names a product's kind names it the same way", () => {
    for (const f of [
      "app/components/StockDayEntry.tsx",
      "app/components/StockOpeningForm.tsx",
      "app/components/LiftingViews.tsx",
      "app/components/AccountsOverview.tsx",
      "lib/daily-report.ts",
    ])
      expect(read(f), f).toContain("kindLabel(");
  });
});

describe("an expense kind the owner names himself", () => {
  it("OTHER with a name reads as the name", () => {
    expect(expenseLabel({ category: "OTHER", label: "Internet" })).toBe("Internet");
    expect(expenseLabel({ category: "OTHER", label: null })).toBe(EXPENSE_CATEGORY_LABEL.OTHER);
    expect(expenseLabel({ category: "FOOD", label: "Internet" })).toBe(EXPENSE_CATEGORY_LABEL.FOOD);
  });

  it("each named kind is its own line in the totals, after the built-in ones", () => {
    const t = expenseTotals([
      { category: "OTHER", label: "Internet", amount: 1200, paidFrom: "BANK" },
      { category: "OTHER", label: "Internet", amount: 300, paidFrom: "CASH" },
      { category: "OTHER", label: "Generator fuel", amount: 800, paidFrom: "CASH" },
      { category: "OTHER", label: null, amount: 50, paidFrom: "CASH" },
      { category: "FOOD", amount: 100, paidFrom: "CASH" },
    ]);
    expect(t.total).toBe(2450);
    expect(t.byCategory).toEqual([
      { category: "FOOD", label: EXPENSE_CATEGORY_LABEL.FOOD, amount: 100 },
      { category: "OTHER", label: "Generator fuel", amount: 800 },
      { category: "OTHER", label: "Internet", amount: 1500 },
      { category: "OTHER", label: EXPENSE_CATEGORY_LABEL.OTHER, amount: 50 },
    ]);
  });

  it("the Expenses form offers existing kinds and a new one", () => {
    const form = read("app/components/ExpenseViews.tsx");
    expect(form).toContain("+ A new kind…");
    expect(read("app/stock/expenses/page.tsx")).toContain('distinct: ["label"]');
  });
});

describe("a phone number finds its person however it is typed", () => {
  const hay = "kamal telecom · bp · r341946 · 01712345678";

  it("with or without 0, 880, +880 or dashes", () => {
    for (const q of ["01712345678", "1712345678", "8801712345678", "+8801712345678", "01712-345678", "017123"])
      expect(matchesTokens(hay, q), q).toBe(true);
    expect(matchesTokens(hay, "01812345678")).toBe(false);
  });

  it("finds a number stored with 880 by the local form", () => {
    expect(matchesTokens("rso 8801712345678", "01712345678")).toBe(true);
  });

  it("Bengali digits fold first", () => {
    expect(matchesTokens(hay, "০১৭১২৩৪৫৬৭৮")).toBe(true);
  });

  it("codes and short numbers are left exactly as typed", () => {
    expect(searchTokens("R341946")).toEqual(["R341946"]);
    expect(searchTokens("0193 kamal")).toEqual(["0193", "kamal"]);
    expect(searchTokens("+8801712345678")).toEqual(["1712345678"]);
  });

  it("hidden numbers are searched only by a typed number, so 'RSO 1' still narrows", () => {
    const rows = [
      { hay: "rso 1 · rso-001", nums: "01700000001" },
      { hay: "rso 2 · rso-002", nums: "01711111112" },
      { hay: "rso 10 · e0010", nums: "01790000010" },
    ];
    const hits = (q: string) => rows.filter((r) => matchesTokens(r.hay, q, r.nums)).map((r) => r.hay.split(" · ")[0]);
    expect(hits("rso 1")).toEqual(["rso 1", "rso 10"]);
    expect(hits("1111")).toEqual(["rso 2"]);
    expect(hits("+8801790000010")).toEqual(["rso 10"]);
    expect(hits("11")).toEqual([]);
  });

  it("the picker searches hidden keywords too, without showing them", () => {
    const options = [
      { id: "a", label: "Shuvo", meta: "BP · R341946", keywords: "01712345678 01898765432" },
      { id: "b", label: "Rahim", meta: "RSO · 01911111111" },
    ];
    expect(matchOptions(options, "+8801898765432").map((o) => o.id)).toEqual(["a"]);
    expect(matchOptions(options, "1911111111").map((o) => o.id)).toEqual(["b"]);
    expect(matchOptions(options, "shuvo").map((o) => o.id)).toEqual(["a"]);
  });
});

describe("where the numbers come from", () => {
  const data = read("lib/stock-data.ts");

  it("RSO wallet, outlet numbers and each person's login number", () => {
    expect(data).toContain("async function attachPhones(");
    expect(data).toContain('add("RSO", e.id, e.rsoMsisdn)');
    expect(data).toContain('add("BP", o.id, o.iTopUpNumber)');
    expect(data).toContain('add("BP", o.id, o.tranMobileNo)');
    expect(data).toContain('add("BP", u.bpRetailerId, u.mobileNumber)');
    expect(data).toContain("await attachPhones(visible)");
  });

  it("Daily entry and Opening show a phone and search every one", () => {
    expect(data).toContain('keywords: phones.join(" ")');
    for (const f of ["app/stock/daily/page.tsx", "app/stock/opening/page.tsx"])
      expect(read(f), f).toContain("holders={holders.map(holderOption)}");
  });

  it("every people list searches by phone", () => {
    expect(read("app/components/AccountsOverview.tsx")).toContain("(h.phones ?? [])");
    expect(read("app/stock/page.tsx")).toContain("<ServerSearchBar");
    expect(read("app/components/BpAssignmentList.tsx")).toContain("b.phones");
    expect(read("app/admin/employees/bps/page.tsx")).toContain("x.retailer.iTopUpNumber");
    expect(read("app/admin/employees/rsos/page.tsx")).toContain("keywords: x.rsoMsisdn");
    for (const f of [
      "app/components/SupportCodePicker.tsx",
      "app/components/CampaignForm.tsx",
      "app/admin/users/UserManager.tsx",
      "app/targets/page.tsx",
      "app/components/AdminEmployeesUI.tsx",
    ])
      expect(read(f), f).toContain("matchesTokens(");
  });
});

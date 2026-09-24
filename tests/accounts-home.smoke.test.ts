import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SHELF_LABEL, shelfOf } from "../lib/accounts-shelves";

/**
 * v198 — the Accounts home is two things, per the owner: per-product movement
 * for this month and yesterday (SIMs normal and swap apart, each price apart,
 * cards each apart), and underneath, who is holding what.
 */
const read = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

describe("which shelf a product sits on", () => {
  it("a linked SIM goes where its link says", () => {
    expect(shelfOf({ category: "SIM", subType: "Normal 150", activationType: "GA_170" })).toBe("SIM_NORMAL");
    expect(shelfOf({ category: "SIM", subType: "Normal 300", activationType: "GA_300" })).toBe("SIM_NORMAL");
    // the link wins over a name that says otherwise
    expect(shelfOf({ category: "SIM", subType: "300 SIM", activationType: "SIM_SWAP" })).toBe("SIM_SWAP");
  });
  it("an unlinked SIM is shelved by its name, and only shelved", () => {
    expect(shelfOf({ category: "SIM", subType: "Swap SIM", activationType: null })).toBe("SIM_SWAP");
    expect(shelfOf({ category: "SIM", subType: "EV SIM", activationType: null })).toBe("SIM_SWAP");
    expect(shelfOf({ category: "SIM", subType: "E-SIM", activationType: null })).toBe("SIM_NORMAL");
  });
  it("cards, iTopup and devices each have their own shelf", () => {
    expect(shelfOf({ category: "CARD", subType: "29 Tk", activationType: null })).toBe("CARD");
    expect(shelfOf({ category: "ITOPUP", subType: "iTopup", activationType: null })).toBe("ITOPUP");
    expect(shelfOf({ category: "ROUTER", subType: "4G", activationType: null })).toBe("DEVICE");
    expect(shelfOf({ category: "HANDSET", subType: "Basic", activationType: null })).toBe("DEVICE");
    // v201: a kind the owner names himself — a smart watch — has its own shelf.
    expect(shelfOf({ category: "OTHER", subType: "Series 5", activationType: null })).toBe("OTHER");
    expect(SHELF_LABEL.OTHER).toBe("Other products");
    expect(Object.keys(SHELF_LABEL)).toHaveLength(6);
  });
});

describe("the page", () => {
  const home = read("app/accounts/page.tsx");
  const view = read("app/components/AccountsOverview.tsx");
  const data = read("lib/accounts-overview.ts");

  it("is the overview and nothing the owner asked to clear away", () => {
    expect(home).toContain("<AccountsOverview data={data} />");
    expect(home, "the v197 tile grid is gone").not.toMatch(/<Tile\b/);
    expect(home, "the v197 godown and dues cards are gone").not.toMatch(/Largest dues|In the godown/);
  });

  it("the client view never imports the Prisma-side module", () => {
    expect(view).not.toMatch(/from "@\/lib\/accounts-overview"|lib\/prisma/);
    expect(view).toContain('from "@/lib/accounts-shelves"');
  });

  it("offers the two periods the owner named, and supervisors as holders", () => {
    expect(view).toMatch(/\["month", "yesterday"\]/);
    expect(view).toMatch(/\["RSO", "SUPERVISOR", "BP"\]/);
  });

  it("counts company lifting from PURCHASE rows only — an opening count is not a lifting", () => {
    expect(data).toMatch(/kind: "PURCHASE"/);
  });

  it("an unlinked SIM's activation is null, never 0", () => {
    expect(data).toMatch(/activated: linked \? 0 : null/);
    expect(view).toContain("not linked — set on Products");
  });

  it("says when the activation feed has not caught up", () => {
    expect(data).toContain("activationsThrough");
    expect(view).toContain("Activations are uploaded a day late");
  });
});

describe("a SIM product names its activations", () => {
  const api = read("app/api/stock/products/route.ts");
  it("the products API accepts only the three kinds, and only on a SIM", () => {
    expect(api).toMatch(/ACTIVATION_TYPES = \["GA_170", "GA_300", "SIM_SWAP"\]/);
    expect(api).toMatch(/current\.category !== "SIM" && activationType !== null/);
  });
  it("the migration guesses from the name once, swap before price", () => {
    const sql = read("prisma/migrations/20260923120000_product_activation_type/migration.sql");
    const at = (v: string) => sql.indexOf(`SET "activationType" = '${v}'`);
    expect(at("SIM_SWAP")).toBeGreaterThan(-1);
    expect(at("SIM_SWAP")).toBeLessThan(at("GA_300"));
    expect(at("GA_300")).toBeLessThan(at("GA_170"));
  });
});

import { isYmd } from "../lib/business-time";
import { houseLines } from "../lib/lifting";

describe("v199: the review's findings stay fixed", () => {
  it("a real day survives the round trip; a made-up one does not", () => {
    expect(isYmd("2026-09-23")).toBe(true);
    expect(isYmd("2026-13-01")).toBe(false);
    expect(isYmd("2026-02-31")).toBe(false);
    expect(isYmd("26-09-23")).toBe(false);
  });

  it("people who left but still hold stock or money stay listed", () => {
    const src = read("lib/stock-data.ts");
    expect(src).toContain('UNION SELECT "holderType", "holderId" FROM "CashDeposit"');
    expect(src).toContain("inactive: true");
  });

  it("a link to a person not in the list is said, never swapped for someone else", () => {
    for (const f of ["app/stock/daily/page.tsx", "app/stock/opening/page.tsx"])
      expect(read(f), f).toContain("That person is not in your list");
  });

  it("a ranged margin costs a sale at every lifting up to the range's end", () => {
    const P = [{ id: "s", category: "SIM" as const, subType: "SIM" }];
    // Lifted in September only; sold in October.
    const oct = houseLines(
      P,
      [],
      [
        {
          productId: "s",
          givenQty: 0,
          givenValue: 0,
          returnedQty: 0,
          returnedValue: 0,
          soldQty: 500,
          soldValue: 100_000,
        },
      ],
      [{ productId: "s", qty: 1000, unitCost: 190 }],
    );
    expect(oct[0].hasCost).toBe(true);
    expect(oct[0].soldCost).toBe(95_000);
    expect(oct[0].liftedQty).toBe(0); // nothing was lifted IN October
  });

  it("'out with people' is what they still hold, not everything ever handed out", () => {
    const [l] = houseLines(
      [{ id: "s", category: "SIM" as const, subType: "SIM" }],
      [{ productId: "s", qty: 1000, unitCost: 190 }],
      [
        {
          productId: "s",
          openingQty: 0,
          givenQty: 1000,
          givenValue: 200_000,
          returnedQty: 0,
          returnedValue: 0,
          soldQty: 900,
          soldValue: 180_000,
        },
      ],
    );
    expect(l.withPeopleQty).toBe(100);
    expect(l.withPeopleCost).toBe(19_000);
  });

  it("a day's lifting and a ranged 'lifted' count purchases only", () => {
    expect(read("lib/daily-report.ts")).toContain('kind: "PURCHASE"');
    expect(read("lib/lifting-data.ts")).toContain('date: dateFilter, kind: "PURCHASE"');
  });

  it("retired products a form already holds lines for stay on it", () => {
    expect(read("app/stock/daily/page.tsx")).toMatch(/pricedProducts\(date, \[/);
    expect(read("app/stock/opening/page.tsx")).toMatch(/pricedProducts\(asOf, \[/);
  });

  it("the home names what needs attention", () => {
    const view = read("app/components/AccountsOverview.tsx");
    for (const t of [
      "No money in",
      "More sold than given",
      "Godown below zero",
      "No price today",
      "Left, still in the books",
    ])
      expect(view).toContain(t);
  });
});

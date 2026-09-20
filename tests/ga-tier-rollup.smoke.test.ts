/**
 * 170 + 300 = the total, at every level, or the split must not be shown.
 *
 * The owner asked for the tier breakdown under every GA figure so that an RSO
 * or BP can see which SIM is moving. The moment a screen shows a total and its
 * parts, the reader adds them up — so the parts have to come from the same pass
 * over the same rows as the total, all the way through the rollup.
 *
 * The live risk was the Business Partner path. An RSO who holds a BP has that
 * outlet's GA added into their figures by `lib/bp-ledger.ts`, and the ledger
 * used to carry the count with its category discarded. Nothing was wrong with
 * any total. But "GA 41 · GA 170 12 · GA 300 9" would have been three correct
 * numbers that do not add up, because two of them described the RSO's own
 * outlets and the third described the territory — the exact "looks right, is
 * not" failure this project keeps auditing for.
 *
 * So the invariant is asserted by RUNNING the rollup, not by reading it.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addTier, addTiers, gaTierLine, noTiers } from "../lib/ga-category";
import type { GaTiers } from "../lib/ga-category";
import { bpShareNote, groupTotals, teamTotals, withBp } from "../lib/bp-rollup";
import type { BpPortion, RollupRow } from "../lib/bp-rollup";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** The one thing every assertion in this file is really checking. */
const holds = (t: GaTiers) => t.ga170 + t.ga300 === t.total;

describe("a tier count cannot be put in wrong", () => {
  it("moves the total and one tier together, or neither", () => {
    const t = noTiers();
    addTier(t, "GA_170", 5);
    expect(t).toEqual({ total: 5, ga170: 5, ga300: 0 });
    addTier(t, "GA_300", 3);
    expect(t).toEqual({ total: 8, ga170: 5, ga300: 3 });
    expect(holds(t)).toBe(true);
  });

  it("refuses a swap and an unclassified row", () => {
    /*
     * A swap in the total would break the invariant AND overstate GA — v172's
     * whole point is that a replacement SIM is not a sale. There is no branch
     * that lets one in, which is why this is a property of the type rather
     * than a rule somebody has to remember at each call site.
     */
    const t = noTiers();
    addTier(t, "SIM_SWAP", 99);
    addTier(t, "UNKNOWN", 99);
    expect(t).toEqual({ total: 0, ga170: 0, ga300: 0 });
  });

  it("keeps the invariant when two sets are merged", () => {
    const a = addTier(noTiers(), "GA_170", 4);
    const b = addTier(addTier(noTiers(), "GA_170", 1), "GA_300", 6);
    expect(addTiers(a, b)).toEqual({ total: 11, ga170: 5, ga300: 6 });
  });
});

describe("the sub-line", () => {
  it("names both tiers, with the words the rest of the app uses", () => {
    expect(gaTierLine({ total: 21, ga170: 12, ga300: 9 })).toBe("GA 170 12 · GA 300 9");
  });

  it("stays silent when there is nothing to split", () => {
    // A month with no sales must not print "GA 170 0 · GA 300 0" on nine screens.
    expect(gaTierLine(noTiers())).toBeNull();
    expect(gaTierLine(null)).toBeNull();
    expect(gaTierLine(undefined)).toBeNull();
  });

  it("still speaks when one tier is zero", () => {
    // "GA 300 0" is information: it says that pack is not moving here.
    expect(gaTierLine({ total: 7, ga170: 7, ga300: 0 })).toBe("GA 170 7 · GA 300 0");
  });
});

/* ------------------------------------------------------------------ rollup */

const portion = (over: Partial<BpPortion> = {}, retailerId = "bp-1"): BpPortion => {
  const figures = {
    gaTarget: over.gaTarget ?? 0,
    gaAchieved: over.gaAchieved ?? 0,
    ga170: over.ga170 ?? 0,
    ga300: over.ga300 ?? 0,
    ssoAchieved: 0,
    c2cAchieved: 0,
    lsoAchieved: 0,
    c2sAmount: 0,
    c2sTransactions: 0,
  };
  return { count: 1, ...figures, byRetailer: over.byRetailer ?? { [retailerId]: figures } };
};

const row = (over: Partial<RollupRow> = {}): RollupRow => ({
  gaTarget: 0,
  gaAchieved: 0,
  ga170: 0,
  ga300: 0,
  ssoTarget: 0,
  ssoAchieved: 0,
  c2cTarget: 0,
  c2cAchieved: 0,
  lsoTarget: 0,
  lsoAchieved: 0,
  scTarget: 0,
  scAchieved: 0,
  totalRechargeTarget: 0,
  totalRechargeAchieved: 0,
  c2sAmount: 0,
  c2sTransactions: 0,
  retailerCount: 0,
  bp: portion(),
  ...over,
});

const tiersOf = (t: { gaAchieved: number; ga170: number; ga300: number }): GaTiers => ({
  total: t.gaAchieved,
  ga170: t.ga170,
  ga300: t.ga300,
});

describe("the invariant survives the rollup", () => {
  it("holds when an RSO's own GA is added to their BP's", () => {
    const r = row({
      gaAchieved: 20,
      ga170: 14,
      ga300: 6,
      bp: portion({ gaAchieved: 9, ga170: 2, ga300: 7 }),
    });
    const t = withBp(r);
    expect(t.gaAchieved).toBe(29);
    expect(t.ga170).toBe(16);
    expect(t.ga300).toBe(13);
    expect(holds(tiersOf(t))).toBe(true);
  });

  it("holds across a team", () => {
    const rows = [
      row({ gaAchieved: 20, ga170: 14, ga300: 6, bp: portion({ gaAchieved: 9, ga170: 2, ga300: 7 }, "bp-a") }),
      row({ gaAchieved: 5, ga170: 1, ga300: 4, bp: portion({ gaAchieved: 3, ga170: 3, ga300: 0 }, "bp-b") }),
    ];
    const t = teamTotals(rows);
    expect(t.gaAchieved).toBe(37);
    expect(holds(tiersOf(t))).toBe(true);
  });

  it("counts a SHARED BP's tiers once, exactly as it counts its total once", () => {
    /*
     * The sharp edge. One outlet held by two RSOs is one Business Partner:
     * `teamTotals` unions by retailer id so its GA is added once. If the tiers
     * were summed per row instead, the total would be right and the split
     * would be double — the two would disagree on the company dashboard, which
     * is the one screen where nobody can check it against anything.
     */
    const shared = portion({ gaAchieved: 10, ga170: 6, ga300: 4 }, "shared-outlet");
    const rows = [row({ bp: shared }), row({ bp: shared })];
    const t = teamTotals(rows);
    expect(t.gaAchieved, "a shared BP was counted twice").toBe(10);
    expect(t.ga170).toBe(6);
    expect(t.ga300).toBe(4);
    expect(holds(tiersOf(t))).toBe(true);
  });

  it("holds for every group when rows are grouped", () => {
    const rows = [
      { ...row({ gaAchieved: 8, ga170: 5, ga300: 3, bp: portion({}, "x") }), key: "A" },
      { ...row({ gaAchieved: 2, ga170: 0, ga300: 2, bp: portion({ gaAchieved: 4, ga170: 4 }, "y") }), key: "A" },
      { ...row({ gaAchieved: 6, ga170: 6, ga300: 0, bp: portion({}, "z") }), key: "B" },
    ];
    const groups = groupTotals(rows, (r) => r.key);
    expect(groups.get("A")!.gaAchieved).toBe(14);
    for (const [name, t] of groups) expect(holds(tiersOf(t)), `group ${name} does not add up`).toBe(true);
  });

  it("an empty rollup is zero, not a broken triple", () => {
    const t = teamTotals([]);
    expect(t.ga170 + t.ga300).toBe(t.gaAchieved);
    expect(t.gaAchieved).toBe(0);
  });
});

/* ------------------------------------------------------------- the sources */

describe("the tier reaches the rollup at every source", () => {
  it("the BP ledger is credited with the category, not just the count", () => {
    /*
     * The bug this file exists for. `f.gaAchieved += count` alone is what made
     * the split unable to add up for any RSO holding a BP.
     */
    const perf = code("lib/performance.ts");
    const credit = perf.slice(perf.indexOf("ledger.credit("), perf.indexOf("ledger.credit(") + 400);
    expect(credit).toContain("f.gaAchieved += count");
    expect(credit, "the ledger credit drops the tier again").toMatch(/f\.ga170 \+= count/);
    expect(credit).toMatch(/f\.ga300 \+= count/);
  });

  it("the dashboard API decides the tier the same way the role pages do", () => {
    /*
     * `/dashboard` and `employeePerformance` are documented as having to
     * agree. A hardcoded price on one side is how they stop agreeing the day a
     * tariff moves — v172 removed the last one of those.
     */
    const api = code("app/api/dashboard/summary/route.ts");
    expect(api).toContain("currentGa170Tariff()");
    expect(api).toContain("classifyGaActivation(");
    expect(api).toMatch(/by: \["retailerId", "activationDate", "productCode", "sellingPrice"\]/);
    expect(api, "the dashboard compares a selling price to a literal").not.toMatch(/sellingPrice\s*[=!]==?\s*\d/);
  });

  it("every grouped GA source carries the product code and price", () => {
    // Without those two keys the split cannot be decided without another query.
    for (const p of [
      "lib/bp-activations.ts",
      "lib/live-ga.ts",
      "lib/intelligence.ts",
      "lib/retailer-opportunities.ts",
    ]) {
      expect(code(p), `${p} groups GA without the keys the split needs`).toMatch(
        /by: \[[^\]]*"productCode"[^\]]*"sellingPrice"[^\]]*\]/,
      );
    }
  });

  it("no screen builds a split by subtracting one tier from a total", () => {
    /*
     * `ga300: total - ga170` looks equivalent and is not: it silently absorbs
     * every swap and unclassified row into the 300 tier, so the line would add
     * up perfectly while being wrong. `addTier` is the only way in.
     */
    for (const p of [
      "app/rso/page.tsx",
      "app/bp/page.tsx",
      "app/supervisor/page.tsx",
      "app/manager/page.tsx",
      "lib/bp-rollup.ts",
      "lib/bp-ledger.ts",
    ]) {
      expect(code(p), `${p} derives a tier by subtraction`).not.toMatch(/ga(170|300):\s*[\w.]+\s*-\s*/);
    }
  });
});

describe("the split is actually on the screens the owner named", () => {
  it("shows under the RSO's and the team's headline GA", () => {
    for (const p of ["app/rso/page.tsx", "app/supervisor/page.tsx", "app/manager/page.tsx"]) {
      const src = code(p);
      const ga = src.slice(src.indexOf('label="GA"'), src.indexOf('label="GA"') + 320);
      expect(ga, `${p}'s GA card has no tier split`).toContain("tiers=");
    }
  });

  it("shows on the BP's own screen, which is the one they live on", () => {
    const bp = code("app/bp/page.tsx");
    expect(bp).toContain("tiers: monthTiers");
    expect(bp).toMatch(/<TierLine tiers=\{dayTiers\}/);
    expect(bp).toMatch(/<TierLine tiers=\{monthTiers\}/);
  });

  it("shows on the retailer rows an RSO plans a visit from", () => {
    expect(code("app/components/RoleAttention.tsx")).toContain("tiers={r.gaTiers}");
    expect(code("app/components/RetailerOpportunityViews.tsx")).toContain("<TierLine tiers={r.gaTiers}");
    expect(code("app/rso/page.tsx")).toContain("tiers={x.gaTiers}");
  });

  it("shows on the BP lists and on Live GA", () => {
    expect(code("app/components/BpAssignmentList.tsx")).toContain("tiers={a.monthGa}");
    expect(code("app/rso/bp/page.tsx")).toContain("tiers={ga}");
    expect(code("app/live-ga/page.tsx")).toContain("<TierLine tiers={r.count}");
    expect(code("app/live-ga/page.tsx")).toContain("<TierLine tiers={live.total}");
  });

  it("uses one component and one class, not nine copies of the wording", () => {
    /*
     * "Latest GA" ended up on three screens with no single place to change it
     * (v175). The same mistake here would be nine.
     */
    const kit = code("app/components/Kit.tsx");
    expect(kit).toContain("export function TierLine");
    // v183: the screen renders the split as two labelled figures rather than
    // one sentence, so a half-width card wraps between them instead of through
    // the middle of one. `gaTierLine` is still the single source of the
    // wording for the string contexts (feed notes, exports).
    expect(kit).toContain("gaTierParts(tiers)");
    expect(read("styles/kit.css")).toContain(".kit-tier-line");
    // The sentence itself is written once, in the dependency-free module.
    const label = code("lib/ga-category.ts");
    expect(label).toContain("GA_CATEGORY_LABEL.GA_170");
    for (const p of ["app/rso/page.tsx", "app/bp/page.tsx", "app/components/RoleAttention.tsx"])
      expect(code(p), `${p} spells the tier line out by hand`).not.toMatch(/GA 170 \$\{/);
  });
});

describe("the BP share is named, not silently held aside", () => {
  /*
   * Measured on real data before this was written: one RSO's KPI card read
   * "SSO 48" while the pill directly below it read 49, and their GA card read
   * 470 for a territory credited with 485. The split is deliberate — v139
   * fixed RSO and BP targets as independent — but nothing on the page let a
   * reader get from one number to the other.
   */
  it("says nothing when the RSO holds no BP", () => {
    expect(bpShareNote(portion({ gaAchieved: 0 }))).toBeNull();
    expect(bpShareNote({ ...portion(), count: 0 })).toBeNull();
  });

  it("stays quiet for a BP that sold nothing this month", () => {
    // A note about a zero is noise on a phone.
    expect(bpShareNote({ ...portion({ gaAchieved: 0 }), count: 2 })).toBeNull();
  });

  it("names how many BPs and how much GA they added", () => {
    const note = bpShareNote({ ...portion({ gaAchieved: 15 }), count: 3 })!;
    expect(note).toContain("3 BPs");
    expect(note).toContain("15 GA");
    expect(note, "the note must say these figures exclude the BP share").toContain("your own outlets");
    expect(note, "and where the BP share actually is").toContain("My BPs");
  });

  it("counts one partner as one", () => {
    const note = bpShareNote({ ...portion({ gaAchieved: 4 }), count: 1 })!;
    expect(note).toContain("1 BP ");
    expect(note).not.toContain("1 BPs");
  });
});

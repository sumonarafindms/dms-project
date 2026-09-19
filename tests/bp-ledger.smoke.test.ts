import { describe, expect, it } from "vitest";
import { bpLedger } from "../lib/bp-ledger";
import { teamTotals } from "../lib/bp-rollup";
import type { RollupRow } from "../lib/bp-rollup";

/**
 * Who gets credited for a Business Partner's sales.
 *
 * These are behavioural tests, not source-scanning ones, and that is the point:
 * the module is deliberately Prisma-free so the rule can be executed rather
 * than described. An earlier draft of this version had only static assertions
 * around it, and gutting `bpLedger`'s holder logic entirely left the whole
 * suite green — the guards were watching the shape of the code instead of what
 * it computes.
 *
 * The rule, in the owner's words: **each RSO sees the whole thing, the company
 * counts it once.**
 */

const day = (d: string) => new Date(`${d}T00:00:00.000Z`);
const RANGE_START = day("2026-08-01");
const RANGE_END = day("2026-09-01");

const assignment = (over: Partial<Parameters<typeof bpLedger>[0][number]> = {}) => ({
  retailerId: "outlet-1",
  employeeId: "rso-1",
  startDate: RANGE_START,
  endDate: null,
  gaTarget: 20,
  monthlyTargets: [],
  ...over,
});

/** A rollup row carrying nothing but this RSO's BP portion. */
/**
 * A row carrying nothing but the BP portion, as `employeePerformance` builds
 * one for an RSO whose own outlets sold nothing.
 *
 * Since v183 the row's SSO, LSO, C2C and C2S already include what the RSO
 * holds as a BP — those metrics have no BP target, so the holder is credited
 * at source. GA does not, because a BP assignment carries its own GA target.
 * Written out here rather than zeroed, so these tests exercise the same row
 * shape the application produces.
 */
const rowFor = (bp: RollupRow["bp"]): RollupRow => ({
  gaTarget: 0,
  gaAchieved: 0,
  ga170: 0,
  ga300: 0,
  ssoTarget: 0,
  ssoAchieved: bp.ssoAchieved,
  c2cTarget: 0,
  c2cAchieved: bp.c2cAchieved,
  lsoTarget: 0,
  lsoAchieved: bp.lsoAchieved,
  scTarget: 0,
  scAchieved: 0,
  totalRechargeTarget: 0,
  totalRechargeAchieved: bp.c2cAchieved,
  c2sAmount: bp.c2sAmount,
  c2sTransactions: bp.c2sTransactions,
  retailerCount: 0,
  bp,
});

describe("one outlet, two RSOs", () => {
  const inScope = (id: string) => id === "rso-1" || id === "rso-2";
  const build = () =>
    bpLedger(
      [assignment({ employeeId: "rso-1" }), assignment({ employeeId: "rso-2" })],
      RANGE_START,
      RANGE_END,
      inScope,
    );

  it("gives each holder the whole thing", () => {
    const ledger = build();
    ledger.credit("outlet-1", day("2026-08-10").getTime(), "rso-1", (f) => {
      f.gaAchieved += 12;
    });
    expect(ledger.portionFor("rso-1").gaAchieved).toBe(12);
    expect(ledger.portionFor("rso-2").gaAchieved).toBe(12);
  });

  it("lets the company count it once", () => {
    const ledger = build();
    ledger.credit("outlet-1", day("2026-08-10").getTime(), "rso-1", (f) => {
      f.gaAchieved += 12;
    });
    const total = teamTotals([rowFor(ledger.portionFor("rso-1")), rowFor(ledger.portionFor("rso-2"))]);
    // 24 would be the doubling this whole mechanism exists to prevent.
    expect(total.gaAchieved).toBe(12);
    expect(total.bpCount).toBe(1);
  });

  it("counts the outlet's target once too", () => {
    // Both holders were given a target of 20 for the same outlet, which will
    // only ever sell so many SIMs. A company goal of 40 would halve every
    // achievement percentage on the dashboard.
    const ledger = build();
    const total = teamTotals([rowFor(ledger.portionFor("rso-1")), rowFor(ledger.portionFor("rso-2"))]);
    expect(total.gaTarget).toBe(20);
    // Each RSO still owns a target of 20 on their own page.
    expect(ledger.portionFor("rso-1").gaTarget).toBe(20);
    expect(ledger.portionFor("rso-2").gaTarget).toBe(20);
  });

  it("takes the largest when holders were edited apart by hand", () => {
    // The target file sets one number per code, so these are normally equal.
    // The BP screen can still edit them individually, and then the company
    // needs one figure: the largest, which never quietly lowers the goal.
    const ledger = bpLedger(
      [assignment({ employeeId: "rso-1", gaTarget: 20 }), assignment({ employeeId: "rso-2", gaTarget: 35 })],
      RANGE_START,
      RANGE_END,
      inScope,
    );
    const total = teamTotals([rowFor(ledger.portionFor("rso-1")), rowFor(ledger.portionFor("rso-2"))]);
    expect(total.gaTarget).toBe(35);
  });

  it("keeps every metric on the same rule", () => {
    const ledger = build();
    ledger.credit("outlet-1", day("2026-08-10").getTime(), "rso-1", (f) => {
      f.c2cAchieved += 5000;
      f.ssoAchieved += 1;
      f.c2sAmount += 700;
    });
    ledger.credit("outlet-1", null, "rso-1", (f) => {
      f.lsoAchieved += 1;
      f.c2sTransactions += 9;
    });
    for (const rso of ["rso-1", "rso-2"]) {
      const p = ledger.portionFor(rso);
      expect(p.c2cAchieved, rso).toBe(5000);
      expect(p.ssoAchieved, rso).toBe(1);
      expect(p.lsoAchieved, rso).toBe(1);
      expect(p.c2sAmount, rso).toBe(700);
      expect(p.c2sTransactions, rso).toBe(9);
    }
    /*
     * Each holder sees the whole outlet on their own row (above), and the team
     * counts it once. Since v183 that de-duplication has to survive the figure
     * being folded INTO the row: `teamTotals` takes each row's BP share back
     * out before adding the deduped one, or two holders on one team would
     * bring the same shop twice.
     */
    const total = teamTotals([rowFor(ledger.portionFor("rso-1")), rowFor(ledger.portionFor("rso-2"))]);
    expect(total.c2cAchieved).toBe(5000);
    expect(total.ssoAchieved).toBe(1);
    expect(total.lsoAchieved).toBe(1);
    expect(total.c2sTransactions).toBe(9);
  });
});

describe("dates still decide", () => {
  it("credits only the holders whose window covers the day", () => {
    const ledger = bpLedger(
      [
        assignment({ employeeId: "rso-1", endDate: day("2026-08-10") }),
        assignment({ employeeId: "rso-2", startDate: day("2026-08-11") }),
      ],
      RANGE_START,
      RANGE_END,
      () => true,
    );
    ledger.credit("outlet-1", day("2026-08-05").getTime(), "rso-1", (f) => {
      f.gaAchieved += 3;
    });
    ledger.credit("outlet-1", day("2026-08-20").getTime(), "rso-1", (f) => {
      f.gaAchieved += 7;
    });
    expect(ledger.portionFor("rso-1").gaAchieved).toBe(3);
    expect(ledger.portionFor("rso-2").gaAchieved).toBe(7);
    // Handed over mid-month, so the territory total is still the whole ten.
    expect(teamTotals([rowFor(ledger.portionFor("rso-1")), rowFor(ledger.portionFor("rso-2"))]).gaAchieved).toBe(10);
  });

  it("knows which days belonged to a BP at all", () => {
    const ledger = bpLedger([assignment({ endDate: day("2026-08-10") })], RANGE_START, RANGE_END, () => true);
    expect(ledger.ownsDay("outlet-1", day("2026-08-10").getTime())).toBe(true);
    // endDate is the last effective day, so the 11th is not a BP day.
    expect(ledger.ownsDay("outlet-1", day("2026-08-11").getTime())).toBe(false);
    expect(ledger.ownsDay("outlet-2", day("2026-08-05").getTime())).toBe(false);
    // Monthly sources have no day to test and err toward the BP.
    expect(ledger.ownsRetailer("outlet-1")).toBe(true);
  });

  it("ignores an assignment that misses the window entirely", () => {
    const ledger = bpLedger(
      [assignment({ startDate: day("2026-06-01"), endDate: day("2026-06-30") })],
      RANGE_START,
      RANGE_END,
      () => true,
    );
    expect(ledger.ownsRetailer("outlet-1")).toBe(false);
    expect(ledger.portionFor("rso-1").count).toBe(0);
  });
});

describe("a partial view never loses the sales", () => {
  it("falls back to the outlet's owner when no holder is in scope", () => {
    /*
     * A supervisor looking at their own team, while the outlet is worked by an
     * RSO in someone else's. The BP days were taken out of the servicing RSO's
     * own figures a moment ago; without this fallback they would simply
     * disappear from the page.
     */
    const ledger = bpLedger([assignment({ employeeId: "outsider" })], RANGE_START, RANGE_END, (id) => id === "owner-1");
    ledger.credit("outlet-1", day("2026-08-10").getTime(), "owner-1", (f) => {
      f.gaAchieved += 5;
    });
    expect(ledger.portionFor("owner-1").gaAchieved).toBe(5);
    // A count and target the owner never had are NOT invented for them.
    expect(ledger.portionFor("owner-1").count).toBe(0);
  });

  it("prefers a real holder over the owner, and never uses both", () => {
    // The fallback must not become a second credit, or a company total would
    // double-count every BP whose outlet its holder does not own.
    const ledger = bpLedger([assignment({ employeeId: "rso-2" })], RANGE_START, RANGE_END, () => true);
    ledger.credit("outlet-1", day("2026-08-10").getTime(), "rso-1", (f) => {
      f.gaAchieved += 5;
    });
    expect(ledger.portionFor("rso-2").gaAchieved).toBe(5);
    expect(ledger.portionFor("rso-1").gaAchieved).toBe(0);
  });

  it("drops nothing on the floor when the owner is out of scope too", () => {
    // Nothing to credit and nothing to invent: the caller asked about a set of
    // employees that this outlet has no connection to.
    const ledger = bpLedger([assignment({ employeeId: "outsider" })], RANGE_START, RANGE_END, () => false);
    ledger.credit("outlet-1", day("2026-08-10").getTime(), "other-owner", (f) => {
      f.gaAchieved += 5;
    });
    expect(ledger.portionFor("outsider").gaAchieved).toBe(0);
    expect(ledger.portionFor("other-owner").gaAchieved).toBe(0);
  });
});

describe("the portion's aggregates cannot drift from its breakdown", () => {
  it("derives them rather than counting twice", () => {
    const ledger = bpLedger(
      [assignment({ retailerId: "outlet-1" }), assignment({ retailerId: "outlet-2" })],
      RANGE_START,
      RANGE_END,
      () => true,
    );
    ledger.credit("outlet-1", day("2026-08-10").getTime(), "rso-1", (f) => {
      f.gaAchieved += 4;
    });
    ledger.credit("outlet-2", day("2026-08-10").getTime(), "rso-1", (f) => {
      f.gaAchieved += 6;
    });
    const p = ledger.portionFor("rso-1");
    expect(p.gaAchieved).toBe(10);
    expect(Object.keys(p.byRetailer).sort()).toEqual(["outlet-1", "outlet-2"]);
    expect(Object.values(p.byRetailer).reduce((a, f) => a + f.gaAchieved, 0)).toBe(p.gaAchieved);
    // Two assignments under one RSO — the v139 rule, still true.
    expect(p.count).toBe(2);
    expect(p.gaTarget).toBe(40);
  });

  it("returns an empty portion for an RSO with no BPs", () => {
    const ledger = bpLedger([], RANGE_START, RANGE_END, () => true);
    const p = ledger.portionFor("rso-9");
    expect(p.count).toBe(0);
    expect(p.gaAchieved).toBe(0);
    expect(p.byRetailer).toEqual({});
  });
});

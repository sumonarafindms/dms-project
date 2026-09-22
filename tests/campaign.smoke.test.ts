import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_SCOPE_LABEL,
  campaignDays,
  campaignDaysLeft,
  campaignPace,
  campaignPhase,
  groupTotal,
  progressLabel,
  progressOf,
  targetFor,
  type CampaignRule,
} from "../lib/campaign";

/**
 * A campaign is a target with a start and an end, and the two scopes answer
 * different questions.
 *
 * The trap this file exists for is the one v175 named and v183 and v186 found
 * again: a target nobody set is not zero. A DISTRIBUTION campaign has no
 * per-RSO number at all, so asking for one must return null rather than 0 —
 * otherwise every RSO screen prints "0 of 0 · 0%" for a campaign that is
 * running perfectly well at the company level.
 */

const perEmployee: CampaignRule = {
  id: "c1",
  name: "October push",
  startDate: "2026-10-01",
  endDate: "2026-10-10",
  scope: "PER_EMPLOYEE",
  totalTarget: null,
  perEmployeeTarget: 25,
  active: true,
};

const distribution: CampaignRule = {
  ...perEmployee,
  id: "c2",
  name: "500 SIMs by the 10th",
  scope: "DISTRIBUTION",
  totalTarget: 500,
  perEmployeeTarget: null,
};

describe("where a campaign is in time", () => {
  it("is compared as calendar dates, not instants", () => {
    expect(campaignPhase(perEmployee, "2026-09-30")).toBe("UPCOMING");
    expect(campaignPhase(perEmployee, "2026-10-01")).toBe("RUNNING");
    expect(campaignPhase(perEmployee, "2026-10-10")).toBe("RUNNING");
    expect(campaignPhase(perEmployee, "2026-10-11")).toBe("ENDED");
  });

  it("counts both end days", () => {
    expect(campaignDays(perEmployee)).toBe(10);
    expect(campaignDays({ startDate: "2026-10-01", endDate: "2026-10-01" }), "a one-day campaign is one day").toBe(1);
  });

  it("counts today as a day still to run", () => {
    expect(campaignDaysLeft(perEmployee, "2026-10-10")).toBe(1);
    expect(campaignDaysLeft(perEmployee, "2026-10-08")).toBe(3);
    expect(campaignDaysLeft(perEmployee, "2026-10-11")).toBe(0);
  });

  it("gives an upcoming campaign its whole run", () => {
    expect(campaignDaysLeft(perEmployee, "2026-09-20")).toBe(10);
  });

  it("refuses to invent days for a backwards window", () => {
    expect(campaignDays({ startDate: "2026-10-10", endDate: "2026-10-01" })).toBe(0);
  });
});

describe("a distribution-wide campaign has no per-RSO number", () => {
  it("returns null rather than zero", () => {
    expect(targetFor(distribution, "emp-1")).toBeNull();
  });

  it("and the screens print no percentage for it", () => {
    const p = progressOf(targetFor(distribution, "emp-1"), 12);
    expect(p.percent, "0% against a target nobody set is the defect v175 named").toBeNull();
    expect(p.remaining).toBeNull();
    expect(progressLabel(p)).toBe("12 SIMs · no target set");
  });

  it("but its own total works normally", () => {
    const p = progressOf(distribution.totalTarget, 380);
    expect(p.percent).toBe(76);
    expect(p.remaining).toBe(120);
    expect(progressLabel(p)).toBe("380 of 500 · 120 to go");
  });
});

describe("the per-employee number", () => {
  it("is the campaign's number for everybody by default", () => {
    expect(targetFor(perEmployee, "emp-1")).toBe(25);
    expect(targetFor(perEmployee, "emp-2")).toBe(25);
  });

  it("is overridden for one person by id", () => {
    const overrides = new Map([["emp-2", 10]]);
    expect(targetFor(perEmployee, "emp-1", overrides)).toBe(25);
    expect(targetFor(perEmployee, "emp-2", overrides)).toBe(10);
  });

  it("treats an override of ZERO as a decision, not an absence", () => {
    /*
     * "This RSO is out of this campaign" is a real instruction. Reading 0 as
     * "no override" would silently put them back in at the campaign's number.
     */
    expect(targetFor(perEmployee, "emp-3", new Map([["emp-3", 0]]))).toBe(0);
    expect(targetFor(perEmployee, "emp-3", { "emp-3": 0 })).toBe(0);
  });

  it("accepts a plain object as well as a Map", () => {
    expect(targetFor(perEmployee, "emp-2", { "emp-2": 40 })).toBe(40);
  });

  it("is null when the campaign set no base number and this person has no override", () => {
    const blank = { ...perEmployee, perEmployeeTarget: null };
    expect(targetFor(blank, "emp-1")).toBeNull();
    expect(targetFor(blank, "emp-1", new Map([["emp-1", 5]]))).toBe(5);
  });
});

describe("a team's campaign total", () => {
  /** A row with no BP outlets: `own` is everything. */
  const plain = (target: number | null, own: number) => ({ target, own, bpByRetailer: {} });

  it("adds the targets of the people who have one", () => {
    const total = groupTotal([plain(25, 10), plain(25, 30), plain(10, 4)]);
    expect(total.target).toBe(60);
    expect(total.achieved).toBe(44);
    expect(total.withTarget).toBe(3);
  });

  it("does not let someone with no target drag the team down", () => {
    /*
     * An RSO left out of the campaign still sells SIMs. Their achievement is
     * real and counts; their absent target must not be added as a zero, and
     * they must not be counted as a member who is behind.
     */
    const total = groupTotal([plain(25, 10), plain(null, 7), plain(0, 3)]);
    expect(total.target).toBe(25);
    expect(total.achieved, "their SIMs are real").toBe(20);
    expect(total.members).toBe(3);
    expect(total.withTarget, "only one of the three is in this campaign").toBe(1);
  });

  it("is honest about a team where nobody has a target", () => {
    const total = groupTotal([plain(null, 4)]);
    const p = progressOf(total.withTarget ? total.target : null, total.achieved);
    expect(p.percent).toBeNull();
    expect(progressLabel(p)).toBe("4 SIMs · no target set");
  });

  it("counts an outlet held by two RSOs of the same team ONCE", () => {
    /*
     * The defect the v189 audit found on its first run: a team read 67,409
     * against SQL's 67,398 — eleven SIMs from one outlet held by two RSOs.
     * Each row carries the whole outlet, correctly, because each holder is
     * measured on the whole outlet; adding the rows is what invents the second
     * one. Same rule as `teamTotals()` in lib/bp-rollup.ts.
     */
    const shared = { "shared-outlet": 11 };
    const total = groupTotal([
      { target: 25, own: 100, bpByRetailer: shared },
      { target: 25, own: 80, bpByRetailer: shared },
    ]);
    expect(total.achieved, "100 + 80 + 11, not + 22").toBe(191);
    // And the wrong answer, stated so it cannot creep back.
    expect(total.achieved).not.toBe(202);
  });

  it("still adds two DIFFERENT BP outlets", () => {
    const total = groupTotal([
      { target: 25, own: 10, bpByRetailer: { a: 5 } },
      { target: 25, own: 10, bpByRetailer: { b: 7 } },
    ]);
    expect(total.achieved).toBe(32);
  });

  it("counts a BP outlet a single RSO holds", () => {
    const total = groupTotal([{ target: 25, own: 10, bpByRetailer: { a: 5 } }]);
    expect(total.achieved).toBe(15);
  });
});

describe("progress", () => {
  it("does not clamp over-achievement", () => {
    const p = progressOf(25, 40);
    expect(p.percent).toBe(160);
    expect(p.complete).toBe(true);
    expect(p.remaining, "nothing left to sell").toBe(0);
    expect(progressLabel(p)).toBe("40 of 25 · complete");
  });

  it("reads 'complete' at exactly the target", () => {
    expect(progressOf(25, 25).complete).toBe(true);
    expect(progressOf(25, 24).complete).toBe(false);
  });
});

describe("pace", () => {
  it("says what the remaining days must average", () => {
    // 13 to go over 3 days is 5 a day, not 4.33.
    expect(campaignPace(progressOf(25, 12), 3).perDay).toBe(5);
  });

  it("says nothing when there is nothing to average", () => {
    expect(campaignPace(progressOf(25, 25), 3).perDay, "already complete").toBeNull();
    expect(campaignPace(progressOf(25, 12), 0).perDay, "no days left").toBeNull();
    expect(campaignPace(progressOf(null, 12), 3).perDay, "no target").toBeNull();
  });
});

describe("the scopes are named for the reader", () => {
  it("in the reader's own terms, not the enum's", () => {
    expect(CAMPAIGN_SCOPE_LABEL.DISTRIBUTION).toBe("Whole distribution");
    expect(CAMPAIGN_SCOPE_LABEL.PER_EMPLOYEE).toBe("Per RSO / BP");
  });
});

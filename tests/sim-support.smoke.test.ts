import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  nextStep,
  schemeIsEmpty,
  slabAmount,
  slabFor,
  slabLabel,
  sortedSlabs,
  ssoBonusFor,
  ssoQualifies,
  supportEarning,
  supportNudge,
  isSplit,
  ladder,
  offerMessage,
  rateDrops,
  supportNudges,
  type SupportSchemeRule,
  type SupportSlabRule,
} from "../lib/sim-support";
import { SSO_MIN_MONTHLY_STANDARD_GA } from "../lib/business-rules";

/**
 * The owner's own arithmetic, pinned.
 *
 * A slab reprices the WHOLE day; it does not pay a margin on the SIMs above
 * the threshold. The owner gave the numbers, and they are the test:
 *
 *     "kau jodi 14ta sim kore tahole tar oi jagai show korbe 700taka pabe...
 *      but jodi aro 1ta kore thale she 15 tar jono 1500 pabe"
 *
 *     14 SIMs -> 14 x ৳50  = ৳700
 *     15 SIMs -> 15 x ৳100 = ৳1,500
 *
 * The marginal reading — ৳50 on the first fourteen and ৳100 on the fifteenth,
 * ৳800 — is the one a developer reaches for and it is wrong. One more SIM at 14
 * is worth ৳800, and showing that is the entire purpose of the RSO's screen.
 */

/** The scheme from the owner's example. */
const OWNER: SupportSchemeRule = {
  slabs: [
    { minSims: 11, ratePerSim: 50 },
    { minSims: 15, ratePerSim: 100 },
  ],
};

/** The other scheme they described: "3tar basi 10 taka, 5tar basi 50 taka". */
const SMALL: SupportSchemeRule = {
  slabs: [
    { minSims: 4, ratePerSim: 10 },
    { minSims: 6, ratePerSim: 50 },
  ],
};

describe("a slab reprices the whole day", () => {
  it("pays 14 SIMs at the rate 14 SIMs reaches", () => {
    expect(slabAmount(OWNER, 14)).toBe(700);
  });

  it("pays 15 SIMs at the rate 15 SIMs reaches — every one of them", () => {
    expect(slabAmount(OWNER, 15)).toBe(1_500);
  });

  it("does not pay a margin on the SIMs above the threshold", () => {
    // The wrong answer, stated so it cannot creep back: 14x50 + 1x100.
    expect(slabAmount(OWNER, 15)).not.toBe(800);
  });

  it("pays nothing below the lowest threshold", () => {
    expect(slabAmount(OWNER, 10)).toBe(0);
    expect(slabFor(OWNER, 10)).toBeNull();
    expect(slabAmount(SMALL, 3)).toBe(0);
  });

  it("takes the highest slab reached, whatever order the slabs arrive in", () => {
    const jumbled: SupportSchemeRule = {
      slabs: [
        { minSims: 15, ratePerSim: 100 },
        { minSims: 4, ratePerSim: 10 },
        { minSims: 11, ratePerSim: 50 },
      ],
    };
    expect(slabFor(jumbled, 20)?.minSims).toBe(15);
    expect(slabAmount(jumbled, 20)).toBe(2_000);
    expect(slabAmount(jumbled, 5)).toBe(50);
  });

  it("does not reorder the caller's own array", () => {
    const slabs = [
      { minSims: 15, ratePerSim: 100 },
      { minSims: 4, ratePerSim: 10 },
    ];
    const scheme = { slabs };
    expect(sortedSlabs(scheme).map((s) => s.minSims)).toEqual([4, 15]);
    // The page renders this array too.
    expect(slabs.map((s) => s.minSims)).toEqual([15, 4]);
  });

  it("pays nothing for no SIMs even when a slab starts at zero", () => {
    expect(slabAmount({ slabs: [{ minSims: 0, ratePerSim: 25 }] }, 0)).toBe(0);
  });

  it("a rate that is higher at a LOWER threshold still pays the higher threshold's rate", () => {
    /*
     * Nothing stops an operator typing a scheme that pays less further up. The
     * rule is "the highest threshold reached", not "the best rate", because
     * the highest threshold is what the reader sees and chases — and silently
     * picking the better rate would make the screen disagree with the scheme
     * they typed.
     */
    const odd: SupportSchemeRule = {
      slabs: [
        { minSims: 5, ratePerSim: 90 },
        { minSims: 10, ratePerSim: 20 },
      ],
    };
    expect(slabAmount(odd, 10)).toBe(200);
  });
});

describe("the one-more-SIM nudge", () => {
  it("is the whole-day gain, not the next slab's rate", () => {
    const step = nextStep(OWNER, 14)!;
    expect(step.atSims).toBe(15);
    expect(step.moreSims).toBe(1);
    expect(step.amount).toBe(1_500);
    expect(step.gain, "one more SIM at 14 is worth ৳800").toBe(800);
  });

  it("counts the SIMs still needed, not the threshold", () => {
    const step = nextStep(OWNER, 8)!;
    expect(step.atSims).toBe(11);
    expect(step.moreSims).toBe(3);
    expect(step.gain).toBe(550);
  });

  it("is silent above the top slab", () => {
    expect(nextStep(OWNER, 15)).toBeNull();
    expect(nextStep(OWNER, 40)).toBeNull();
    expect(supportNudge(supportEarning(OWNER, 20))).toBeNull();
  });

  it("names the total, the count and the gain", () => {
    const text = supportNudge(supportEarning(OWNER, 14))!;
    expect(text).toContain("1 more SIM");
    expect(text).toContain("15 in total");
    expect(text).toContain("৳1,500");
    expect(text).toContain("৳800");
  });

  it("counts the SSO bonus into the total it promises", () => {
    /*
     * The bonus is already earned and does not move. Leaving it out told an
     * RSO on ৳6,400 of SSO money that four more SIMs "takes today's support to
     * ৳40" — a cut of ৳6,360 for selling more.
     */
    const text = supportNudge(supportEarning(OWNER, 14, 6_400))!;
    expect(text, "the total includes what is already earned").toContain("৳7,900");
    expect(text, "but the gain is still what the extra SIM is worth").toContain("৳800");
  });
});

describe("the SSO offer", () => {
  const t = SSO_MIN_MONTHLY_STANDARD_GA;

  /*
   * The owner restated the two conditions, so both are written out here in
   * their own words and checked at the edges rather than at one example each:
   *
   *   1. "jara age kono sim kore nai but oi din 2ta ba tar basi sim korce
   *       tahole oi din tar sso complete hobe"
   *   2. "jodi age 1ta sim kore thake and ajke 1ta ba tar basi sim korle ajke
   *       tar sso complete hobe"
   *
   * Both are one rule — the month's count crosses the threshold WITH today's
   * SIMs — and that is what makes a third case fall out correctly: an outlet
   * already at or past the threshold yesterday does not complete again.
   */
  it("condition 1: nothing before, two OR MORE today", () => {
    expect(ssoQualifies({ simSeller: true, threshold: t, beforeToday: 0, today: 2 })).toBe(true);
    expect(ssoQualifies({ simSeller: true, threshold: t, beforeToday: 0, today: 3 })).toBe(true);
    expect(ssoQualifies({ simSeller: true, threshold: t, beforeToday: 0, today: 9 })).toBe(true);
    // ...and one today is not enough, because the month is still at one.
    expect(ssoQualifies({ simSeller: true, threshold: t, beforeToday: 0, today: 1 })).toBe(false);
    expect(ssoQualifies({ simSeller: true, threshold: t, beforeToday: 0, today: 0 })).toBe(false);
  });

  it("condition 2: one before, one OR MORE today", () => {
    expect(ssoQualifies({ simSeller: true, threshold: t, beforeToday: 1, today: 1 })).toBe(true);
    expect(ssoQualifies({ simSeller: true, threshold: t, beforeToday: 1, today: 2 })).toBe(true);
    expect(ssoQualifies({ simSeller: true, threshold: t, beforeToday: 1, today: 5 })).toBe(true);
    // Nothing today is nothing completed today.
    expect(ssoQualifies({ simSeller: true, threshold: t, beforeToday: 1, today: 0 })).toBe(false);
  });

  it("pays when today's SIMs are what completed it", () => {
    // Nothing before, two today — the owner's "2ta sim korle pabe".
    expect(ssoQualifies({ simSeller: true, threshold: t, beforeToday: 0, today: 2 })).toBe(true);
    // One before, one today — their "age 1ta korce and oi din 1ta korce".
    expect(ssoQualifies({ simSeller: true, threshold: t, beforeToday: 1, today: 1 })).toBe(true);
  });

  it("pays for the SIMs done on the completing day, not for the month", () => {
    expect(ssoBonusFor({ slabs: [], ssoRatePerSim: 50 }, 1)).toBe(50);
    expect(ssoBonusFor({ slabs: [], ssoRatePerSim: 50 }, 3)).toBe(150);
  });

  it("does not pay an outlet that was already complete", () => {
    // Completing is what the offer is for. An outlet at 5 for the month does
    // not complete again by selling a sixth.
    expect(ssoQualifies({ simSeller: true, threshold: t, beforeToday: 5, today: 1 })).toBe(false);
  });

  it("does not pay an outlet that still has not completed", () => {
    expect(ssoQualifies({ simSeller: true, threshold: t, beforeToday: 0, today: 1 })).toBe(false);
  });

  it("does not pay an outlet that is not a SIM seller", () => {
    expect(ssoQualifies({ simSeller: false, threshold: t, beforeToday: 0, today: 2 })).toBe(false);
  });

  it("honours the stricter form of the offer", () => {
    /*
     * The owner's third case, in their words: "onk somoy company offer dai je
     * age 1ta kora chilo but ajke oi code a 2ta korle tar por taka pabe — mane
     * tar kintu 1ta korle SSO complete hoye jaito, but company sorto dice
     * minimum 2ta korle taka pabe."
     *
     * So the outlet completes SSO either way; the OFFER adds a condition on
     * today's count, and the money follows the offer.
     */
    expect(
      ssoQualifies({ simSeller: true, threshold: t, beforeToday: 1, today: 1, minSimsSameDay: 2 }),
      "one today completes SSO but does not meet the day's condition",
    ).toBe(false);
    expect(
      ssoQualifies({ simSeller: true, threshold: t, beforeToday: 1, today: 2, minSimsSameDay: 2 }),
      "two today meets it, and the outlet is paid for both",
    ).toBe(true);
    expect(ssoQualifies({ simSeller: true, threshold: t, beforeToday: 0, today: 2, minSimsSameDay: 2 })).toBe(true);
    expect(ssoQualifies({ simSeller: true, threshold: t, beforeToday: 0, today: 1, minSimsSameDay: 2 })).toBe(false);
  });

  it("pays for every SIM the completing outlet did today, not for the month", () => {
    // One before and three today: the month is four, but the offer pays three.
    const scheme = { slabs: [], ssoRatePerSim: 50 };
    expect(ssoQualifies({ simSeller: true, threshold: t, beforeToday: 1, today: 3 })).toBe(true);
    expect(ssoBonusFor(scheme, 3)).toBe(150);
  });

  it("without the stricter condition, the default is no condition at all", () => {
    for (const minSimsSameDay of [undefined, null, 0, 1])
      expect(ssoQualifies({ simSeller: true, threshold: t, beforeToday: 1, today: 1, minSimsSameDay })).toBe(true);
  });

  it("pays nothing on a day with no SSO rate, which is most days", () => {
    expect(ssoBonusFor({ slabs: [] }, 3)).toBe(0);
    expect(ssoBonusFor({ slabs: [], ssoRatePerSim: null }, 3)).toBe(0);
    expect(ssoBonusFor({ slabs: [], ssoRatePerSim: 0 }, 3)).toBe(0);
  });
});

describe("the two are added, not chosen between", () => {
  it("a day with both pays both", () => {
    // 14 SIMs of slab support, and one outlet that completed SSO with 2 of them.
    const scheme: SupportSchemeRule = { ...OWNER, ssoRatePerSim: 50 };
    const earning = supportEarning(scheme, 14, ssoBonusFor(scheme, 2));
    expect(earning.slabAmount).toBe(700);
    expect(earning.ssoBonus).toBe(100);
    expect(earning.total, "they are paid for two different things").toBe(800);
  });

  it("an SSO bonus with no slab reached is still paid", () => {
    const scheme: SupportSchemeRule = { ...OWNER, ssoRatePerSim: 50 };
    const earning = supportEarning(scheme, 2, ssoBonusFor(scheme, 2));
    expect(earning.slabAmount).toBe(0);
    expect(earning.total).toBe(100);
  });
});

describe("a day with no offer says so", () => {
  it("an empty scheme is recognisable", () => {
    expect(schemeIsEmpty({ slabs: [] })).toBe(true);
    expect(schemeIsEmpty({ slabs: [{ minSims: 5, ratePerSim: 0 }] })).toBe(true);
    expect(schemeIsEmpty({ slabs: [], ssoRatePerSim: 50 })).toBe(false);
    expect(schemeIsEmpty(OWNER)).toBe(false);
  });

  it("earns nothing and offers no nudge", () => {
    const earning = supportEarning({ slabs: [] }, 12);
    expect(earning.total).toBe(0);
    expect(earning.next).toBeNull();
    expect(supportNudge(earning)).toBeNull();
  });
});

describe("the label a slab shows", () => {
  it("reads as a threshold, not a range", () => {
    // "From 6 SIMs" cannot be misread as "6 SIMs exactly" or "up to 6".
    expect(slabLabel({ minSims: 6, ratePerSim: 50 })).toBe("From 6 SIMs — ৳50 each");
    expect(slabLabel({ minSims: 1, ratePerSim: 10 })).toBe("From 1 SIM — ৳10 each");
  });
});

describe("the two payments count different outlets", () => {
  /**
   * The rule that decides who gets paid what, stated where it can be checked.
   *
   * These are source assertions rather than arithmetic, because the arithmetic
   * above cannot see which outlets it was handed. The split is the owner's
   * ruling and it is the part most likely to be "simplified" by someone
   * tidying later:
   *
   *   slab  — the codes the office PICKED (`Retailer.supportEligible`), plus a
   *           BP's own held outlet. No cap on how many are picked.
   *   SSO   — EVERY outlet under the RSO, picked or not. RSOs only; a BP earns
   *           the slab and nothing else.
   */
  const DATA = fs.readFileSync(path.join(__dirname, "..", "lib", "sim-support-data.ts"), "utf8");
  const code = DATA.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

  it("the slab counts only the picked codes", () => {
    expect(code).toMatch(/slabOutlets[\s\S]{0,200}r\.supportEligible/);
  });

  it("a code held as a BP that day is not also counted for its RSO", () => {
    // One outlet's SIMs paid to two people is the one error that cannot be
    // argued about.
    expect(code).toMatch(/bpHeldToday/);
    expect(code).toMatch(/r\.supportEligible && !bpHeldToday\.has\(r\.id\)/);
  });

  it("the SSO offer is NOT filtered to the picked codes", () => {
    /*
     * `mine` is every outlet under the RSO. If a future edit narrows this to
     * `supportEligible`, outlets that really completed SSO stop being paid and
     * nothing on any screen says so.
     */
    expect(code).toMatch(/ssoOutlets[\s\S]{0,120}mine\.filter\(completedSsoToday\)/);
    expect(code, "the SSO list must not be narrowed to picked codes").not.toMatch(
      /completedSsoToday[\s\S]{0,80}supportEligible/,
    );
  });

  it("a BP draws no SSO bonus", () => {
    const bpBlock = code.slice(code.indexOf("for (const a of bpAssignments)"));
    expect(bpBlock).toMatch(/ssoOutlets: \[\]/);
  });

  it("the picked-code count has no cap in the API", () => {
    const api = fs.readFileSync(path.join(__dirname, "..", "app", "api", "support", "codes", "route.ts"), "utf8");
    const apiCode = api.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    expect(apiCode, "the owner's ruling: the number must not live in the code").not.toMatch(/retailerIds\.length > /);
  });
});

/**
 * v198 — the two SIM ladders, from the owner's own offer message:
 *
 *     💸 300৳ SIM Bonus            💸 170৳ SIM Bonus
 *     • 5 GA ➜ ৳50/SIM             • 5 GA ➜ ৳20
 *     • 7 GA ➜ ৳65/SIM             • 7 GA ➜ ৳30
 *     • 10 GA ➜ ৳75/SIM            • 10 GA ➜ ৳40
 *     • 15 GA ➜ ৳100/SIM           • 15 GA ➜ ৳50
 *                                  • 20 GA ➜ ৳70
 *                                  • 25 GA ➜ ৳10   (as sent — see rateDrops)
 */
const L300: SupportSlabRule[] = [
  { tier: "GA_300", minSims: 5, ratePerSim: 50 },
  { tier: "GA_300", minSims: 7, ratePerSim: 65 },
  { tier: "GA_300", minSims: 10, ratePerSim: 75 },
  { tier: "GA_300", minSims: 15, ratePerSim: 100 },
];
const L170: SupportSlabRule[] = [
  { tier: "GA_170", minSims: 5, ratePerSim: 20 },
  { tier: "GA_170", minSims: 7, ratePerSim: 30 },
  { tier: "GA_170", minSims: 10, ratePerSim: 40 },
  { tier: "GA_170", minSims: 15, ratePerSim: 50 },
  { tier: "GA_170", minSims: 20, ratePerSim: 70 },
  { tier: "GA_170", minSims: 25, ratePerSim: 10 },
];
const WARRIORS: SupportSchemeRule = { slabs: [...L300, ...L170], dailyTarget: 25, basis: "TOTAL" };
const OWN: SupportSchemeRule = { ...WARRIORS, basis: "OWN" };
const c = (ga300: number, ga170: number) => ({ total: ga300 + ga170, ga300, ga170 });

describe("v198: two SIM ladders", () => {
  it("knows a split scheme from a single ladder", () => {
    expect(isSplit(WARRIORS)).toBe(true);
    expect(isSplit(OWNER)).toBe(false);
    expect(ladder(WARRIORS, "GA_300").slabs).toHaveLength(4);
    expect(ladder(WARRIORS, "GA_170").slabs).toHaveLength(6);
  });

  it("TOTAL: the day's GA picks the step, each SIM paid at its own ladder's rate", () => {
    // 6 × 300 + 4 × 170 = 10 GA → the 10 step: 6 × ৳75 + 4 × ৳40
    const e = supportEarning(WARRIORS, c(6, 4));
    expect(e.split).toBe(true);
    expect(e.slabAmount).toBe(6 * 75 + 4 * 40);
    expect(e.ladders.map((l) => l.stepCount)).toEqual([10, 10]);
  });

  it("TOTAL: the 300 ladder stays on its top step past 15, the 170 ladder keeps climbing", () => {
    const e = supportEarning(WARRIORS, c(12, 8)); // 20 GA
    expect(e.slabAmount).toBe(12 * 100 + 8 * 70);
  });

  it("OWN: each SIM type climbs its own ladder on its own count", () => {
    // 6 × 300 → the 5 step at ৳50; 4 × 170 is below the 170 ladder's first step
    const e = supportEarning(OWN, c(6, 4));
    expect(e.slabAmount).toBe(6 * 50);
    expect(e.ladders.find((l) => l.tier === "GA_170")!.slab).toBeNull();
  });

  it("the SSO bonus is added on top, as on a single-ladder day", () => {
    const e = supportEarning(WARRIORS, c(6, 4), 300);
    expect(e.total).toBe(6 * 75 + 4 * 40 + 300);
  });

  it("a single-ladder scheme still pays exactly what it paid before the split", () => {
    expect(supportEarning(OWNER, c(10, 4)).slabAmount).toBe(slabAmount(OWNER, 14));
    expect(supportEarning(OWNER, 14).slabAmount).toBe(700);
  });

  it("TOTAL nudge: the next shared step reprices the SIMs already done", () => {
    // 5 + 3 = 8 GA on the 7 step (5×65 + 3×30 = 415). The 10 step: 5×75 + 3×40 = 495.
    const e = supportEarning(WARRIORS, c(5, 3));
    expect(e.slabAmount).toBe(415);
    expect(e.nextSplit).toHaveLength(1);
    expect(e.nextSplit[0]).toMatchObject({ tier: null, atSims: 10, moreSims: 2, amount: 495, gain: 80 });
    const [text] = supportNudges(e);
    expect(text).toContain("2 more GA");
    expect(text).toContain("৳80 more");
  });

  it("OWN nudge: one sentence per ladder, each counting its own SIMs", () => {
    const e = supportEarning(OWN, c(6, 4));
    const texts = supportNudges(e);
    expect(texts).toHaveLength(2);
    expect(texts[0]).toContain("1 more 300৳ SIM");
    expect(texts[1]).toContain("1 more 170৳ SIM");
  });

  it("flags a step that pays LESS for more GA — the owner's '25 GA ➜ ৳10'", () => {
    expect(rateDrops(WARRIORS)).toEqual([{ tier: "GA_170", minSims: 25, rate: 10, previousRate: 70 }]);
    expect(rateDrops({ slabs: L300 })).toEqual([]);
  });

  it("writes the owner's message from the saved numbers, 300 first", () => {
    const text = offerMessage(WARRIORS, { dateYmd: "2026-09-23" });
    expect(text).toContain("🔥🚨 BP & RSO WARRIORS 🚨🔥");
    expect(text).toContain("23/09/26");
    expect(text).toContain("🎯 আজকের টার্গেট: 25+ GA 💪");
    expect(text).toContain("• 5 GA ➜ ৳50/SIM");
    expect(text).toContain("• 20 GA ➜ ৳70/SIM");
    expect(text.indexOf("300৳ SIM Bonus")).toBeLessThan(text.indexOf("170৳ SIM Bonus"));
    expect(text).toContain("🚀 25+ GA করুন, Bonus জিতুন!");
  });

  it("the API refuses an offer that mixes one ladder with the split ladders", () => {
    const api = fs.readFileSync(path.join(__dirname, "..", "app", "api", "support", "schemes", "route.ts"), "utf8");
    expect(api).toMatch(/not both in one offer/);
  });

  it("counts today's SIMs by type with the same tier filters as every GA screen", () => {
    const data = fs.readFileSync(path.join(__dirname, "..", "lib", "sim-support-data.ts"), "utf8");
    expect(data).toMatch(/withGa170\(tariff/);
    expect(data).toMatch(/withGa300\(tariff/);
  });
});

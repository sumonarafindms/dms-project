import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { rel as relativeTo } from "./paths";
import { groupSizes, groupTotals, hasBp, teamTotals, withBp, type BpPortion, type RollupRow } from "../lib/bp-rollup";
import { assignmentGaTarget, assignmentWindow } from "../lib/bp-period";

/**
 * A Business Partner's sales belong to the BP, not to its RSO — and to the
 * territory above it.
 *
 * ## The rule
 *
 * A retailer that has been made a BP sells SIMs and recharge on its own
 * account, against its own target. Counting that toward the RSO who services
 * the outlet flattered the RSO and hid the BP. So an RSO's figures now exclude
 * their BPs, and every level above the RSO — supervisor, manager, company —
 * adds them straight back, because those levels answer for the whole
 * territory.
 *
 * ## Why this suite is mostly about the rollup, not the split
 *
 * The dangerous half is the addition, not the subtraction. If a page forgets to
 * add the BP share back, a supervisor's GA is simply too small: no error, no
 * empty screen, just a wrong number on a screen whose only job is that number.
 * So the tests below check the arithmetic AND that no page does the arithmetic
 * itself.
 */

const ROOT = path.join(__dirname, "..");
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const rel = relativeTo(ROOT);
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(e.name)) acc.push(full);
  }
  return acc;
}

/*
 * A BP portion, with its per-retailer breakdown filled in to match.
 *
 * `byRetailer` is not decoration: since a BP may be held by several RSOs at
 * once, it is what lets a team total count one outlet once. So the helper
 * builds the breakdown from the same numbers rather than leaving it empty,
 * which would make every rollup test quietly assert zero BP contribution.
 *
 * Pass an explicit `retailerId` to model the case that matters — the SAME
 * outlet appearing under two RSOs.
 */
let bpSeq = 0;
const bp = (over: Partial<BpPortion> = {}, retailerId = `bp-retailer-${++bpSeq}`): BpPortion => {
  const figures = {
    gaTarget: over.gaTarget ?? 0,
    gaAchieved: over.gaAchieved ?? 0,
    // Default the split to the whole of the GA sitting at the 170 tier, so a
    // fixture that only says `gaAchieved` still satisfies ga170 + ga300 = total
    // and cannot accidentally assert a broken invariant.
    ga170: over.ga170 ?? over.gaAchieved ?? 0,
    ga300: over.ga300 ?? 0,
    ssoAchieved: over.ssoAchieved ?? 0,
    c2cAchieved: over.c2cAchieved ?? 0,
    lsoAchieved: over.lsoAchieved ?? 0,
    c2sAmount: over.c2sAmount ?? 0,
    c2sTransactions: over.c2sTransactions ?? 0,
  };
  return {
    count: 0,
    ...figures,
    ...over,
    byRetailer: over.byRetailer ?? { [retailerId]: figures },
  };
};

/*
 * A row, built the way `employeePerformance` builds one.
 *
 * The fixture states the RSO's OWN figures and the BP they hold; the helper
 * then folds the BP's SSO, LSO, C2C and C2S into the row exactly as v183 made
 * the real builder do, because no BP target exists for those metrics and the
 * RSO's target covers the outlets they hold. GA is NOT folded — a BP carries
 * its own GA target, so that one stays apart on the row and is added only by
 * `withBp` and `teamTotals`.
 *
 * Building fixtures by hand in the old shape would have made every assertion
 * below a test of a row shape the application no longer produces.
 */
const row = (over: Partial<RollupRow> = {}): RollupRow => {
  const partner = over.bp ?? bp();
  const ownC2c = over.c2cAchieved ?? 0;
  const ownSc = over.scAchieved ?? 0;
  return {
    gaTarget: 0,
    gaAchieved: 0,
    ga170: 0,
    ga300: 0,
    ssoTarget: 0,
    c2cTarget: 0,
    lsoTarget: 0,
    scTarget: 0,
    totalRechargeTarget: 0,
    retailerCount: 0,
    ...over,
    bp: partner,
    ssoAchieved: (over.ssoAchieved ?? 0) + partner.ssoAchieved,
    c2cAchieved: ownC2c + partner.c2cAchieved,
    scAchieved: ownSc,
    lsoAchieved: (over.lsoAchieved ?? 0) + partner.lsoAchieved,
    c2sAmount: (over.c2sAmount ?? 0) + partner.c2sAmount,
    c2sTransactions: (over.c2sTransactions ?? 0) + partner.c2sTransactions,
    // Always C2C + SC, as the real builder computes it.
    totalRechargeAchieved: ownC2c + partner.c2cAchieved + ownSc,
  };
};

describe("a BP's sales reach the team, not the RSO", () => {
  const rso = row({
    gaAchieved: 40,
    gaTarget: 60,
    c2cAchieved: 100_000,
    scAchieved: 5_000,
    ssoAchieved: 3,
    lsoAchieved: 2,
    c2sAmount: 20_000,
    c2sTransactions: 90,
    bp: bp({
      count: 1,
      gaAchieved: 25,
      gaTarget: 30,
      c2cAchieved: 50_000,
      ssoAchieved: 1,
      lsoAchieved: 1,
      c2sAmount: 9_000,
      c2sTransactions: 11,
    }),
  });

  it("credits the holder with the BP's SSO, LSO, C2C and C2S", () => {
    /*
     * v183. A BP assignment carries a GA target and nothing else, while the
     * RSO's SSO, LSO and C2C targets are set against their whole base — the
     * outlets they hold as a BP included. Holding the achievement aside
     * measured them against a goal that still covered those shops, so an SSO
     * completed at a BP outlet is the holder's SSO and appears on their own
     * row, not only on their team's.
     */
    expect(rso.ssoAchieved).toBe(4);
    expect(rso.lsoAchieved).toBe(3);
    expect(rso.c2cAchieved).toBe(150_000);
    expect(rso.c2sAmount).toBe(29_000);
    expect(rso.c2sTransactions).toBe(101);
  });

  it("keeps GA apart on the row, because a BP has its own GA target", () => {
    expect(rso.gaAchieved).toBe(40);
    expect(rso.gaTarget).toBe(60);
    expect(rso.bp.gaAchieved).toBe(25);
    expect(rso.bp.gaTarget).toBe(30);
  });

  it("adds only GA at territory level, and adds it once", () => {
    const t = withBp(rso);
    expect(t.gaAchieved).toBe(65);
    expect(t.gaTarget).toBe(90);
    // Already on the row. Adding the BP share again here would count one
    // outlet twice on every territory view.
    expect(t.c2cAchieved).toBe(150_000);
    expect(t.ssoAchieved).toBe(4);
    expect(t.lsoAchieved).toBe(3);
    expect(t.c2sAmount).toBe(29_000);
    expect(t.c2sTransactions).toBe(101);
    expect(t.bpCount).toBe(1);
  });

  it("keeps total recharge equal to C2C plus SC, wherever it is read", () => {
    // The invariant that survives the change: whatever else moves, recharge is
    // the money figure plus the manually entered SC, never a stale field.
    expect(rso.totalRechargeAchieved).toBe(rso.c2cAchieved + rso.scAchieved);
    const t = withBp(rso);
    expect(t.totalRechargeAchieved).toBe(t.c2cAchieved + t.scAchieved);
    expect(t.totalRechargeAchieved).toBe(155_000);
  });

  it("leaves the RSO's own row untouched", () => {
    withBp(rso);
    expect(rso.gaAchieved).toBe(40);
    expect(rso.bp.gaAchieved).toBe(25);
  });
});

describe("team totals", () => {
  it("sums several RSOs with their BPs", () => {
    const total = teamTotals([
      row({ gaAchieved: 10, gaTarget: 20, retailerCount: 5, bp: bp({ count: 1, gaAchieved: 4, gaTarget: 6 }) }),
      row({ gaAchieved: 7, gaTarget: 15, retailerCount: 3, bp: bp({ count: 2, gaAchieved: 9, gaTarget: 12 }) }),
    ]);
    expect(total.gaAchieved).toBe(30);
    expect(total.gaTarget).toBe(53);
    expect(total.retailerCount).toBe(8);
    /*
     * DISTINCT BP retailers, not assignments — and this assertion used to say
     * 3, summing the rows' `count` fields.
     *
     * Both meanings are defensible on one RSO's row, where they are the same
     * number. In a TEAM total they are not: one outlet held by three RSOs is
     * one Business Partner and three assignments, and "3 BPs" on a company
     * dashboard would be three outlets that do not exist. The helper gives
     * each bp() its own retailer, so two rows here are two outlets.
     */
    expect(total.bpCount).toBe(2);
  });

  it("counts an outlet held by two RSOs once, and its GA once", () => {
    /*
     * The whole reason `byRetailer` exists.
     *
     * "Each RSO sees the whole thing; the company counts it once" — so both
     * rows below carry the same BP's full 12 GA against a target of 20, and
     * the team total carries them exactly once. Summing the aggregates would
     * report 24 against 40: a doubling that no screen would flag, on the
     * number the dashboard exists to show.
     */
    const shared = { gaAchieved: 12, gaTarget: 20, ssoAchieved: 1, c2cAchieved: 5_000 };
    const total = teamTotals([
      row({ gaAchieved: 10, gaTarget: 30, bp: bp({ count: 1, ...shared }, "shared-outlet") }),
      row({ gaAchieved: 8, gaTarget: 25, bp: bp({ count: 1, ...shared }, "shared-outlet") }),
    ]);
    expect(total.gaAchieved).toBe(10 + 8 + 12);
    expect(total.gaTarget).toBe(30 + 25 + 20);
    expect(total.ssoAchieved).toBe(1);
    expect(total.c2cAchieved).toBe(5_000);
    expect(total.bpCount).toBe(1);
  });

  it("still gives each holder the whole BP on its own row", () => {
    // The other half of the rule: dedup belongs to the team total, never to
    // the individual row. An RSO working a shared outlet is working all of it.
    const shared = bp({ count: 1, gaAchieved: 12, gaTarget: 20 }, "shared-outlet");
    expect(withBp(row({ gaAchieved: 10, gaTarget: 30, bp: shared })).gaAchieved).toBe(22);
    expect(withBp(row({ gaAchieved: 8, gaTarget: 25, bp: shared })).gaAchieved).toBe(20);
  });

  it("is a no-op when there are no BPs at all", () => {
    // The change must not move a single number for a team without BPs.
    const rows = [row({ gaAchieved: 10, gaTarget: 20, c2cAchieved: 500, scAchieved: 100 })];
    const total = teamTotals(rows);
    expect(total.gaAchieved).toBe(10);
    expect(total.gaTarget).toBe(20);
    expect(total.totalRechargeAchieved).toBe(600);
    expect(hasBp(rows)).toBe(false);
  });

  it("handles an empty team", () => {
    expect(teamTotals([]).gaAchieved).toBe(0);
    expect(teamTotals([]).bpCount).toBe(0);
  });

  it("tolerates rows with no C2S fields", () => {
    // The dashboard's API rows carry no C2S figures; one helper serves both
    // shapes rather than a second implementation drifting out of step.
    const total = teamTotals([row({ c2sAmount: undefined, c2sTransactions: undefined, bp: bp({ c2sAmount: 5 }) })]);
    expect(total.c2sAmount).toBe(5);
    expect(total.c2sTransactions).toBe(0);
  });
});

describe("the RSO's GA target is used exactly as entered", () => {
  /*
   * v136 reduced it by the BPs' own targets. v139 removed that, because the
   * owner confirmed RSO and BP targets are set INDEPENDENTLY — the number typed
   * against an RSO is already that RSO's alone.
   *
   * Subtracting the BP's target from it removed the same SIMs twice: once from
   * achieved, and again from the goal. The RSO then looked better than they
   * were, against a target quietly smaller than the one their manager set.
   * Nothing errored; no screen was empty.
   */
  it("is never reduced by the BP's target, in either aggregation path", () => {
    for (const file of ["lib/performance.ts", "app/api/dashboard/summary/route.ts"]) {
      const src = stripComments(read(file));
      expect(src, file).not.toMatch(/-\s*bp\.gaTarget/);
      expect(src, file).not.toMatch(/gaTarget[\s\S]{0,40}Math\.max\(0,[^)]*bp\.gaTarget/);
    }
  });

  it("passes the stored target straight through", () => {
    expect(stripComments(read("lib/performance.ts"))).toMatch(/gaTarget:\s*targets\.ga,/);
    expect(stripComments(read("app/api/dashboard/summary/route.ts"))).toMatch(/gaTarget:\s*target\?\.gaTarget \|\| 0,/);
  });

  it("adds the two only for a territory total, and only in one place", () => {
    // RSO target + BP target IS the territory's goal — that sum is legitimate,
    // and withBp() is where it is allowed to happen.
    const t = withBp(row({ gaTarget: 60, bp: bp({ count: 1, gaTarget: 30 }) }));
    expect(t.gaTarget).toBe(90);
  });

  it("uses one definition of a BP's target", () => {
    // It was written out three times — in listBpAssignments, in the assignment
    // detail, and on the supervisor detail page. The RSO's target is now
    // reduced by exactly this number, so a fourth spelling would mean the same
    // SIM targeted twice.
    const offenders = sourceFiles(path.join(ROOT, "app"))
      .concat(sourceFiles(path.join(ROOT, "lib")))
      .filter((f) => path.basename(f) !== "bp-period.ts")
      .filter((f) => /monthlyTargets\.map\(\([\s\S]{0,40}gaTarget\]\)/.test(stripComments(fs.readFileSync(f, "utf8"))))
      .map(rel);
    expect(offenders, "use assignmentGaTarget from lib/bp-period").toEqual([]);
  });

  it("computes a BP target from monthly overrides, falling back to the standing one", () => {
    const months = [new Date("2026-07-01T00:00:00.000Z"), new Date("2026-08-01T00:00:00.000Z")];
    const assignment = {
      gaTarget: 10,
      monthlyTargets: [{ month: new Date("2026-08-01T00:00:00.000Z"), gaTarget: 25 }],
    };
    expect(assignmentGaTarget(assignment, months)).toBe(35);
    expect(assignmentGaTarget({ gaTarget: 10, monthlyTargets: [] }, months)).toBe(20);
  });
});

describe("a BP that changed hands mid-period", () => {
  const rangeStart = new Date("2026-08-01T00:00:00.000Z");
  const rangeEnd = new Date("2026-09-01T00:00:00.000Z");

  it("clips the assignment to the reported window", () => {
    // A retailer that became a BP on the 12th produced GA for its RSO on the
    // 11th and for itself on the 13th, and one report must say both.
    const w = assignmentWindow(
      { startDate: new Date("2026-08-12T00:00:00.000Z"), endDate: null },
      rangeStart,
      rangeEnd,
    );
    expect(w.effectiveStart.toISOString().slice(0, 10)).toBe("2026-08-12");
    expect(w.effectiveEnd.toISOString().slice(0, 10)).toBe("2026-09-01");
  });

  it("treats endDate as the last effective day, inclusive", () => {
    const w = assignmentWindow(
      { startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2026-08-10T00:00:00.000Z") },
      rangeStart,
      rangeEnd,
    );
    expect(w.effectiveStart.toISOString().slice(0, 10)).toBe("2026-08-01");
    // Exclusive end is the day AFTER the last effective day.
    expect(w.effectiveEnd.toISOString().slice(0, 10)).toBe("2026-08-11");
  });

  it("is tested by DAY in both aggregation paths", () => {
    // Grouping C2C or GA by retailer alone would leave no day to test, and the
    // whole month would land on one side of the split.
    for (const file of ["lib/performance.ts", "app/api/dashboard/summary/route.ts"]) {
      const src = stripComments(read(file));
      // The GA groupBy also carries sellingPrice and productCode for the
      // standard-GA classification, so what matters is that the DATE is one of
      // the grouping keys — not the exact key list.
      expect(src, file).toMatch(/by:\s*\[[^\]]*"activationDate"[^\]]*\]/);
      expect(src, file).toMatch(/by:\s*\["retailerId",\s*"date"\]/);
      /*
       * Both paths go through the SHARED ledger, which is stronger than the
       * old check that each defined its own `bpOwnsDay`.
       *
       * They each used to hold a copy of the rule, and the comments in both
       * said they must agree. Now that a BP can be held by several RSOs — each
       * seeing the whole thing, the company counting it once — the rule is
       * harder, and a second copy would be a second chance to get it wrong.
       */
      expect(src, file).toMatch(/bpLedger\(/);
      expect(src, file).toMatch(/ledger\.ownsDay\(/);
    }
  });
});

describe("grouping into teams", () => {
  it("dedupes a shared BP inside each group", () => {
    /*
     * The bug groupTotals() exists to make unrepeatable. Two RSOs on one team
     * hold the same outlet, so both rows carry its whole 12 GA against a 20
     * target — and the team is one outlet, not two.
     */
    const shared = { gaAchieved: 12, gaTarget: 20 };
    const rows = [
      { ...row({ gaAchieved: 10, gaTarget: 30, bp: bp({ count: 1, ...shared }, "shared") }), team: "north" },
      { ...row({ gaAchieved: 8, gaTarget: 25, bp: bp({ count: 1, ...shared }, "shared") }), team: "north" },
    ];
    const totals = groupTotals(rows, (r) => r.team);
    expect(totals.get("north")!.gaAchieved).toBe(10 + 8 + 12);
    expect(totals.get("north")!.gaTarget).toBe(30 + 25 + 20);
    expect(totals.get("north")!.bpCount).toBe(1);
  });

  it("keeps groups apart, and lets two teams each count a shared outlet once", () => {
    // A supervisor answers for their own territory; the outlet really is worked
    // in both. Only a total ACROSS groups needs teamTotals over the rows.
    const shared = { gaAchieved: 12, gaTarget: 20 };
    const rows = [
      { ...row({ gaAchieved: 10, bp: bp({ count: 1, ...shared }, "shared") }), team: "north" },
      { ...row({ gaAchieved: 8, bp: bp({ count: 1, ...shared }, "shared") }), team: "south" },
    ];
    const totals = groupTotals(rows, (r) => r.team);
    expect(totals.get("north")!.gaAchieved).toBe(22);
    expect(totals.get("south")!.gaAchieved).toBe(20);
    // And the company, over the same rows, still counts the outlet once.
    expect(teamTotals(rows).gaAchieved).toBe(10 + 8 + 12);
  });

  it("puts rows with no group in their own 'unassigned' group (v200), never drops them", () => {
    /*
     * v200: they used to be skipped, so an RSO with no supervisor was in the
     * company strip and in no supervisor row — the strip was 300 GA bigger
     * than the rows under it.
     */
    const rows = [
      { ...row({ gaAchieved: 5 }), team: "north" },
      { ...row({ gaAchieved: 7 }), team: null },
    ];
    const totals = groupTotals(rows, (r) => r.team);
    expect([...totals.keys()].sort()).toEqual(["north", null].sort());
    expect(totals.get(null)!.gaAchieved).toBe(7);
    expect(groupSizes(rows, (r) => r.team).get("north")).toBe(1);
    expect(groupSizes(rows, (r) => r.team).get(null)).toBe(1);
  });

  it("counts people separately from outlets", () => {
    // `retailerCount` is outlets; how many RSOs are in the bucket is its own
    // question, which the totals deliberately do not answer.
    const rows = [
      { ...row({ retailerCount: 40 }), team: "north" },
      { ...row({ retailerCount: 35 }), team: "north" },
    ];
    expect(groupTotals(rows, (r) => r.team).get("north")!.retailerCount).toBe(75);
    expect(groupSizes(rows, (r) => r.team).get("north")).toBe(2);
  });
});

describe("no page adds the BP share by hand", () => {
  /** The legitimate ways to combine BP figures — all of them in bp-rollup.ts. */
  const HELPER = /\b(withBp|teamTotals|groupTotals)\(/;
  const pages = sourceFiles(path.join(ROOT, "app")).filter((f) => !f.includes(`${path.sep}api${path.sep}`));

  it("has no page reading row.bp directly", () => {
    // The one legitimate exception is a page that shows the BP figures as their
    // own card; there is none today, and a new one should extend
    // lib/bp-rollup.ts rather than open-code the addition.
    const offenders = pages
      .filter((f) => /\.bp\.(ga|sso|c2c|lso|c2s)/.test(stripComments(fs.readFileSync(f, "utf8"))))
      .map(rel);
    expect(offenders, "use withBp() or teamTotals() from lib/bp-rollup").toEqual([]);
  });

  it("routes every team and company total through the helper", () => {
    // A page that ADDS UP a metric across RSO rows must use the helper —
    // otherwise it silently reports a team without its Business Partners.
    //
    // Counting rows is not adding up a metric: /supervisor/rsos and
    // /manager/rsos tally how many RSOs are on track, which is a per-RSO
    // judgment and correctly uses the RSO-owned figures. An earlier version of
    // this test flagged both, which is how the wording below got specific.
    const SUMS_A_METRIC =
      /(reduce|\+=)[\s\S]{0,120}\b(gaAchieved|gaTarget|totalRechargeAchieved|totalRechargeTarget|c2cAchieved|ssoAchieved|lsoAchieved|retailerCount)\b/;
    const rollups = pages.filter((f) => {
      const src = stripComments(fs.readFileSync(f, "utf8"));
      return /employeePerformance\(|ApiRow\[\]/.test(src) && (SUMS_A_METRIC.test(src) || HELPER.test(src));
    });
    expect(rollups.length, "no rollup pages found — the pattern stopped matching").toBeGreaterThanOrEqual(6);
    const offenders = rollups.filter((f) => !HELPER.test(stripComments(fs.readFileSync(f, "utf8")))).map(rel);
    expect(offenders).toEqual([]);
  });

  it("never accumulates a withBp() result across rows", () => {
    /*
     * The hole this suite had, and the bug it let through.
     *
     * `withBp()` is for ONE row: it gives an RSO their own figures plus their
     * Business Partners', which is exactly right on a screen about that RSO.
     * Four pages then summed those results into supervisor buckets by hand:
     *
     *     const t = withBp(r);
     *     bucket.gaAchieved += t.gaAchieved;
     *
     * The old guard above accepted that, because the page did call a helper.
     * It was correct for as long as a BP had one holder — and the moment one
     * outlet could sit under two RSOs on the same team, that bucket added its
     * GA and its target once per holder. Measured: 3,765 GA against a 440
     * target where the truth was 3,744 against 415.
     *
     * Adding up rows is what `teamTotals()` and `groupTotals()` are for, and
     * the dedup lives inside them. So: bind `withBp()` to a variable and that
     * variable must not be accumulated.
     */
    const offenders: string[] = [];
    for (const f of pages) {
      const src = stripComments(fs.readFileSync(f, "utf8"));
      for (const m of src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*withBp\(/g)) {
        const v = m[1];
        // `x += t.gaAchieved`, or a reduce that folds `t.` into an accumulator.
        if (new RegExp(`\\+=\\s*${v}\\.|\\+\\s*${v}\\.\\w`).test(src)) offenders.push(rel(f));
      }
    }
    expect(
      [...new Set(offenders)],
      "use groupTotals() to bucket rows — withBp() gives each holder the whole BP, so summing double counts a shared one",
    ).toEqual([]);
  });

  it("groups with the helper rather than by hand", () => {
    // The four pages that used to bucket by supervisor. Named, so that
    // reverting one is a failure rather than a silent regression.
    for (const f of [
      "app/admin/performance/supervisors/page.tsx",
      "app/manager/supervisors/page.tsx",
      "app/manager/page.tsx",
      "app/dashboard/page.tsx",
    ])
      expect(stripComments(read(f)), f).toMatch(/groupTotals\(/);
  });

  it("accumulates from the helper's result, not from the row itself", () => {
    /*
     * The check above only notices a page that never calls the helper at all.
     * A page that calls it for one figure and then accumulates another straight
     * off the row would slip past — and that is the likelier mistake, because
     * the page looks like it is doing the right thing.
     *
     * So: inside a `for (const r of rows)` loop, `+= r.<metric>` is banned. The
     * legitimate shape is `const t = withBp(r); ... += t.<metric>`.
     */
    const METRICS =
      "gaAchieved|gaTarget|totalRechargeAchieved|totalRechargeTarget|c2cAchieved|ssoAchieved|lsoAchieved|retailerCount";
    /*
     * The one page that sums target fields legitimately, with its reason.
     *
     * `/targets` adds up TargetRow — rows straight out of the targets API,
     * which are stored figures and carry no BP share at all — to show a
     * supervisor what their RSOs' targets come to. There is nothing for the
     * helper to de-duplicate, and there is no `withBp` shape to use.
     *
     * The exemption is checked back against the file below, so it cannot
     * quietly start covering a page that DOES handle performance rows.
     */
    const SUMS_STORED_TARGETS: Record<string, string> = {
      "app/targets/page.tsx":
        "sums TargetRow, the stored targets themselves — no performance row, no BP share, nothing to dedupe",
    };
    for (const [file, why] of Object.entries(SUMS_STORED_TARGETS)) {
      const src = stripComments(read(file));
      expect(why.length, `${file}: an exemption with no reason`).toBeGreaterThan(20);
      for (const forbidden of ["withBp(", "employeePerformance", ".bp.byRetailer"])
        expect(src.includes(forbidden), `${file} is exempt from the hand-sum rule and yet uses ${forbidden}`).toBe(
          false,
        );
    }
    const offenders: string[] = [];
    for (const file of pages) {
      if (SUMS_STORED_TARGETS[rel(file)]) continue;
      const src = stripComments(fs.readFileSync(file, "utf8"));
      for (const loop of src.matchAll(/for \(const (\w+) of (?:rows|all)\)\s*\{([\s\S]*?)\n  \}/g)) {
        const [, variable, body] = loop;
        if (new RegExp(`\\+=\\s*(?:Number\\()?${variable}\\.(?:${METRICS})\\b`).test(body)) offenders.push(rel(file));
      }
    }
    expect([...new Set(offenders)], "accumulate from withBp(row), not from row").toEqual([]);
  });
});

describe("the rollup module stays usable from the browser", () => {
  it("imports nothing from Prisma, directly or by type", () => {
    // The dashboard is a client component and uses teamTotals. Importing
    // EmployeePerformance from lib/performance.ts here would be a type-only
    // import and therefore safe — but the structural RollupRow keeps even that
    // dependency out, so the module cannot drift into pulling Prisma later.
    const src = read("lib", "bp-rollup.ts");
    expect(src).not.toMatch(/@prisma\/client/);
    expect(src).not.toMatch(/from "\.\/prisma"/);
    expect(src).not.toMatch(/from "\.\/performance"/);
  });
});

describe("both aggregation paths credit a BP's execution the same way", () => {
  /**
   * v183, and the reason it needs a guard of its own.
   *
   * The app has two places that build an RSO's row — `lib/performance.ts` for
   * every role screen and `/api/dashboard/summary` for the admin dashboard —
   * and the comments in both have said for several versions that they must
   * apply one rule or the same RSO reads differently on two screens. The fold
   * added here is exactly the kind of thing that gets applied to one and
   * forgotten in the other.
   *
   * The rule: SSO, LSO and C2C are folded into the RSO's own figures, because
   * a BP assignment carries a GA target and nothing else while the RSO's
   * targets cover their whole base. GA is NOT folded.
   */
  const PRODUCERS = {
    "lib/performance.ts": "every role screen",
    "app/api/dashboard/summary/route.ts": "the admin dashboard",
  };

  it("folds SSO, LSO and C2C into the row in both", () => {
    for (const [file, what] of Object.entries(PRODUCERS)) {
      const src = stripComments(read(file));
      for (const field of ["ssoAchieved", "lsoAchieved"])
        expect(src, `${file} (${what}) does not credit the holder with the BP's ${field}`).toMatch(
          new RegExp(`${field}:[^,]*\\+ bp\\.${field}`),
        );
      expect(src, `${file} (${what}) does not credit the holder with the BP's C2C`).toMatch(
        /c2cAchieved:[^,]*\+ bp\.c2cAchieved/,
      );
    }
  });

  it("does NOT fold GA, which has a BP target of its own", () => {
    // Folding GA would target the same SIMs twice — v139's ruling, and the
    // reason the split exists at all.
    for (const file of Object.keys(PRODUCERS)) {
      const src = stripComments(read(file));
      expect(src, `${file} folds the BP's GA into the RSO's own figure`).not.toMatch(
        /gaAchieved:[^,]*\+ bp\.gaAchieved/,
      );
    }
  });

  it("takes the share back out before a team total, so a shared outlet counts once", () => {
    const src = stripComments(read("lib/bp-rollup.ts"));
    for (const field of ["ssoAchieved", "c2cAchieved", "lsoAchieved"])
      expect(src, `teamTotals does not remove each row's ${field} BP share`).toMatch(
        new RegExp(`${field}[^\\n]*- row\\.bp\\.${field}`),
      );
    // And withBp must not add them a second time.
    const withBpBody = src.slice(src.indexOf("export function withBp("), src.indexOf("export function teamTotals("));
    expect(withBpBody, "withBp adds the BP's SSO again").not.toMatch(/ssoAchieved: row\.ssoAchieved \+/);
    expect(withBpBody, "withBp adds the BP's C2C again").not.toMatch(/c2cAchieved: row\.c2cAchieved \+/);
  });

  it("still adds GA at territory level", () => {
    const src = stripComments(read("lib/bp-rollup.ts"));
    const withBpBody = src.slice(src.indexOf("export function withBp("), src.indexOf("export function teamTotals("));
    expect(withBpBody).toMatch(/gaAchieved: row\.gaAchieved \+ bp\.gaAchieved/);
  });
});

describe("no screen adds a shared BP up twice", () => {
  /**
   * The mistake, measured.
   *
   * `teamTotals()` and `groupTotals()` are tested above until the rule cannot
   * move. What nothing checked is whether a SCREEN uses them. Each RSO row
   * carries its BP's whole figures — correctly, because each holder is measured
   * on the whole outlet — so adding `r.bp.gaAchieved` across rows is one line
   * of ordinary-looking code that silently counts a shared outlet once per
   * holder.
   *
   * The v186 audit wrote that line, in the audit script itself, and the
   * September figures answered:
   *
   *     own GA 67,278 + BP rows added   = 67,409
   *     own GA 67,278 + BP rows unioned = 67,398   <- SQL agrees
   *
   * Eleven SIMs from ONE outlet held by two RSOs. Nothing looked wrong; the
   * number was simply larger than the company had sold. That is the whole
   * failure mode this project keeps finding, so the union stays the only way in
   * and a naive sum is a test failure rather than a discrepancy someone notices
   * a quarter later.
   */
  const BP_ACHIEVEMENT = ["gaAchieved", "ga170", "ga300", "ssoAchieved", "c2cAchieved", "lsoAchieved", "c2sAmount"];

  const walk = (dir: string, out: string[] = []) => {
    for (const name of fs.readdirSync(dir)) {
      if (name === "node_modules" || name === ".next" || name === ".scratch") continue;
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full, out);
      else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
    }
    return out;
  };

  it("nothing outside lib/bp-rollup.ts accumulates a BP figure across rows", () => {
    const files = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "lib"))].filter(
      (f) => !f.endsWith(path.join("lib", "bp-rollup.ts")),
    );
    const offenders: string[] = [];
    for (const file of files) {
      const src = stripComments(fs.readFileSync(file, "utf8"));
      for (const field of BP_ACHIEVEMENT) {
        /*
         * An ACCUMULATION, not a read. `x + bp.gaAchieved` on one row is the
         * fold every role page does and is right; `acc + r.bp.gaAchieved`
         * inside a reduce over rows is the bug. The difference on the page is
         * the accumulator on the left.
         */
        const pattern = new RegExp(String.raw`\b(acc|a|sum|total|totals)\s*(\+=|\+\s*[\w.?]*\bbp\??\.${field})`, "g");
        for (const m of src.matchAll(pattern))
          if (m[0].includes(`bp`) && m[0].includes(field))
            offenders.push(`${relativeTo(file)}: ${m[0].replace(/\s+/g, " ")}`);
      }
    }
    expect(
      offenders,
      `a shared BP counted once per holder — use teamTotals()/groupTotals(), which union by retailer:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("the union is what makes the company total right, on the audit's own numbers", () => {
    // The September shape, reduced to three rows: two RSOs holding one outlet
    // worth 11, and a third RSO holding nothing.
    const held = bp({ count: 1, gaAchieved: 11 }, "shared-outlet");
    const rows = [row({ gaAchieved: 100, bp: held }), row({ gaAchieved: 80, bp: held }), row({ gaAchieved: 60 })];
    const naive = rows.reduce((a, r) => a + r.gaAchieved + r.bp.gaAchieved, 0);
    expect(naive, "adding the rows invents a second outlet").toBe(100 + 80 + 60 + 11 + 11);
    expect(teamTotals(rows).gaAchieved, "the union counts it once").toBe(100 + 80 + 60 + 11);
  });
});

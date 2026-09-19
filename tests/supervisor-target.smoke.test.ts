/**
 * A supervisor's target is a number somebody set, not a number that fell out.
 *
 * ## What changed
 *
 * Until v181 a supervisor held no target. Every supervisor figure in the app
 * was the SUM of their RSOs' `MonthlyTarget` rows, plus their BPs' GA target on
 * the dashboard path. Two comments in the source stated it as settled law —
 * `app/manager/page.tsx` said "Supervisors hold no targets of their own, so a
 * supervisor's target is the sum of their RSOs'", and `lib/report-data.ts` said
 * the same about the daily report.
 *
 * The owner's ruling is that the sum is not a target anybody can manage
 * against: an RSO's target is what that RSO must sell, a supervisor's job is
 * not the addition of eight of those, and adding the BP targets on top made it
 * higher again. So a supervisor's target is now set on `/targets` and stands on
 * its own, exactly as v139 established for RSO and BP targets — and a manager's
 * and the company's target is the sum of the supervisors' own, so that a
 * manager's headline row and the supervisor cards beneath it are built from the
 * same thing.
 *
 * What is guarded here is that rule, at every screen that shows it.
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { rel } from "./paths";
import {
  emptySupervisorTarget,
  sumSupervisorTargets,
  targetFor,
  targetWindow,
  withSupervisorTarget,
  type SupervisorTarget,
} from "../lib/supervisor-target";
import type { RollupTotals } from "../lib/bp-rollup";

const ROOT = path.join(__dirname, "..");
const relative = rel(ROOT);
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/^(\s*)\/\/.*$/gm, (_m, i) => i);

const target = (over: Partial<SupervisorTarget> = {}): SupervisorTarget => ({
  ...emptySupervisorTarget(),
  set: true,
  ...over,
});

const totals = (over: Partial<RollupTotals> = {}): RollupTotals => ({
  gaTarget: 999,
  gaAchieved: 120,
  ga170: 90,
  ga300: 30,
  ssoTarget: 999,
  ssoAchieved: 12,
  c2cTarget: 999,
  c2cAchieved: 5000,
  lsoTarget: 999,
  lsoAchieved: 7,
  scTarget: 999,
  scAchieved: 100,
  totalRechargeTarget: 999,
  totalRechargeAchieved: 5100,
  c2sAmount: 200,
  c2sTransactions: 9,
  retailerCount: 40,
  bpCount: 2,
  ...over,
});

describe("the target is replaced, the achievement is not", () => {
  it("takes all six targets from the supervisor's own row", () => {
    const out = withSupervisorTarget(
      totals(),
      target({ gaTarget: 300, c2cTarget: 10, scTarget: 20, totalRechargeTarget: 30, ssoTarget: 4, lsoTarget: 5 }),
    );
    expect(out.gaTarget).toBe(300);
    expect(out.c2cTarget).toBe(10);
    expect(out.scTarget).toBe(20);
    expect(out.totalRechargeTarget).toBe(30);
    expect(out.ssoTarget).toBe(4);
    expect(out.lsoTarget).toBe(5);
  });

  it("leaves every achieved figure exactly as the rollup computed it", () => {
    /*
     * The half that must NOT change. A supervisor's achievement is genuinely
     * what their territory sold — Business Partners included, a shared outlet
     * counted once — and that arithmetic belongs to lib/bp-rollup.ts. If this
     * helper ever touched an achieved field, the territory rules would have a
     * second, quieter implementation.
     */
    const before = totals();
    const out = withSupervisorTarget(before, target({ gaTarget: 1 }));
    for (const k of [
      "gaAchieved",
      "ga170",
      "ga300",
      "ssoAchieved",
      "c2cAchieved",
      "lsoAchieved",
      "scAchieved",
      "totalRechargeAchieved",
      "c2sAmount",
      "c2sTransactions",
      "retailerCount",
      "bpCount",
    ] as const)
      expect(out[k], k).toBe(before[k]);
  });

  it("makes an unset supervisor show no target rather than a zero of its own", () => {
    // `KpiCard` reads target > 0 as "has a target"; at zero it draws no ring
    // and says "No target set" (v175). So an unset supervisor lands in the
    // honest empty state and NOT on the old roll-up.
    const out = withSupervisorTarget(totals(), emptySupervisorTarget());
    expect(out.gaTarget).toBe(0);
    expect(out.totalRechargeTarget).toBe(0);
    expect(out.gaAchieved).toBe(120);
  });
});

describe("a manager's target is the supervisors' targets", () => {
  it("adds the six fields across the scope", () => {
    const sum = sumSupervisorTargets([
      target({ gaTarget: 100, c2cTarget: 5, ssoTarget: 2, lsoTarget: 1, scTarget: 3, totalRechargeTarget: 8 }),
      target({ gaTarget: 250, c2cTarget: 7, ssoTarget: 3, lsoTarget: 4, scTarget: 1, totalRechargeTarget: 8 }),
    ]);
    expect(sum).toEqual({
      set: true,
      gaTarget: 350,
      c2cTarget: 12,
      scTarget: 4,
      totalRechargeTarget: 16,
      ssoTarget: 5,
      lsoTarget: 5,
    });
  });

  it("ignores supervisors who have no target rather than counting them as zero", () => {
    const sum = sumSupervisorTargets([target({ gaTarget: 100 }), emptySupervisorTarget()]);
    expect(sum.gaTarget).toBe(100);
    expect(sum.set).toBe(true);
  });

  it("is unset when nobody in the scope has one", () => {
    const sum = sumSupervisorTargets([emptySupervisorTarget(), emptySupervisorTarget()]);
    expect(sum.set).toBe(false);
    expect(sum.gaTarget).toBe(0);
  });

  it("gives the honest empty target for an unknown or missing supervisor", () => {
    const map = new Map([["a", target({ gaTarget: 9 })]]);
    expect(targetFor(map, "a").gaTarget).toBe(9);
    expect(targetFor(map, "b").set).toBe(false);
    expect(targetFor(map, null).set).toBe(false);
  });
});

describe("the target covers the same window the achievement does", () => {
  it("is the whole month when no range is given", () => {
    const w = targetWindow("2026-09-01");
    expect(w.start.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(w.endExclusive.toISOString().slice(0, 10)).toBe("2026-10-01");
  });

  it("follows a from/to overlay, with `to` included", () => {
    const w = targetWindow("2026-09-01", "2026-09-08", "2026-09-14");
    expect(w.start.toISOString().slice(0, 10)).toBe("2026-09-08");
    // Half-open: the 15th is the first instant NOT reported, so the 14th is in.
    expect(w.endExclusive.toISOString().slice(0, 10)).toBe("2026-09-15");
  });

  it("falls back to the month rather than producing an empty window", () => {
    const w = targetWindow("2026-09-01", "2026-09-20", "2026-09-01");
    expect(w.endExclusive.getTime()).toBeGreaterThan(w.start.getTime());
  });
});

describe("every screen showing a supervisor figure applies the rule", () => {
  /**
   * The pages that show a supervisor's target, and what each must do.
   *
   * Named one by one rather than swept, because the failure this guards
   * against is a page being FORGOTTEN — and a sweep cannot notice an absence.
   */
  const PAGES: Record<string, string> = {
    "app/supervisor/page.tsx": "the supervisor's own home: four KPI cards",
    "app/manager/page.tsx": "the manager's headline row and their supervisor cards",
    "app/manager/supervisors/page.tsx": "one card per supervisor",
    "app/manager/supervisors/[id]/page.tsx": "one supervisor's KPI cards",
    "app/admin/performance/supervisors/page.tsx": "the supervisor performance list and its Total Target",
    "app/dashboard/page.tsx": "the company total and the supervisor section",
  };

  it("reads the stored target on every one of them", () => {
    const missing: string[] = [];
    for (const [file, what] of Object.entries(PAGES)) {
      const src = stripComments(read(file));
      if (!/withSupervisorTarget\(/.test(src)) missing.push(`${file} (${what})`);
    }
    expect(missing, `a supervisor figure still built from RSO targets:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  it("names a real file for every entry, so the list cannot rot", () => {
    for (const file of Object.keys(PAGES))
      expect(fs.existsSync(path.join(ROOT, file)), `${file} is listed and does not exist`).toBe(true);
  });

  it("builds a manager's and the company's target from the supervisors'", () => {
    // The second half of the ruling: a headline figure built from RSO targets
    // above supervisor cards built from supervisor targets would be two
    // different numbers wearing one word — the v178 defect.
    for (const file of ["app/manager/page.tsx", "app/dashboard/page.tsx"])
      expect(stripComments(read(file)), `${file} does not total the supervisors' own targets`).toMatch(
        /sumSupervisorTargets\(/,
      );
  });

  it("keeps the achievement coming from the rollup", () => {
    // withSupervisorTarget replaces targets only, so every one of these pages
    // must still be asking bp-rollup for the achieved side.
    for (const file of Object.keys(PAGES)) {
      const src = stripComments(read(file));
      expect(src, `${file} no longer computes its achievement from the rollup`).toMatch(/teamTotals\(|groupTotals\(/);
    }
  });
});

describe("the Reporting Center uses the same rule", () => {
  const DATA = stripComments(read("lib", "report-data.ts"));

  it("no longer sums RSO monthly targets to make a supervisor's", () => {
    /*
     * The exact shape that used to be here:
     *
     *     prisma.monthlyTarget.findMany({ ... select: { employeeId, gaTarget } })
     *     targetByEmployee.set(t.employeeId, ... + t.gaTarget)
     *
     * with the comment "Supervisors hold no targets of their own". Both the
     * query and the comment are gone; this asserts they stay gone.
     */
    expect(DATA).not.toMatch(/Supervisors hold no targets of their own/);
    // The supervisor rollup must not read the RSO target table at all.
    const fn = DATA.slice(DATA.indexOf("export async function rollUpToSupervisor"));
    expect(fn.slice(0, fn.indexOf("\n}\n"))).not.toMatch(/monthlyTarget\./);
  });

  it("reads the stored supervisor target instead", () => {
    expect(DATA).toMatch(/supervisorTargets\(/);
    expect(DATA).toMatch(/targetFor\(/);
  });

  it("gives the daily report and the target report one calculation, not two", () => {
    // `supervisorSummary` is now a thin mapping over `rollUpToSupervisor`, so
    // the daily report's supervisor GA and the Target vs Achievement report's
    // cannot disagree.
    const fn = DATA.slice(DATA.indexOf("export async function supervisorSummary"));
    expect(fn.slice(0, fn.indexOf("\n}\n"))).toMatch(/rollUpToSupervisor\(range/);
  });
});

describe("the Target page can set one", () => {
  const PAGE = stripComments(read("app", "targets", "page.tsx"));
  const API = stripComments(read("app", "api", "targets", "route.ts"));

  it("offers a supervisor section with the same dialog", () => {
    expect(PAGE).toMatch(/Supervisor targets/);
    // Two call sites each, as the RSO and BP rows have: the table and the
    // phone card. A control on only one of them is unusable at the other width.
    expect(PAGE.match(/openSup\(/g)?.length, "openSup must be reachable from the table AND the card").toBeGreaterThan(
      2,
    );
  });

  it("still saves the whole month in one write", () => {
    // The page has always had exactly one save. A second endpoint for
    // supervisors would let half a month's targets land and the other half
    // fail, leaving one month disagreeing with itself.
    expect(PAGE).toMatch(/apiSend\("\/api\/targets", "POST", \{ month, rows, supRows, bpRows \}\)/);
    expect(PAGE.match(/apiSend[<(]|apiUpload[<(]/g)?.length, "exactly two writes: save and import").toBe(2);
  });

  it("offers the six targets and not scAchieved", () => {
    // `scAchieved` is a manually entered ACHIEVEMENT and belongs to an RSO.
    expect(PAGE).toMatch(/const targetFields = \[/);
    const list = PAGE.slice(PAGE.indexOf("const targetFields = ["));
    expect(list.slice(0, list.indexOf("]"))).not.toMatch(/scAchieved/);
  });

  it("writes to the supervisor's own table", () => {
    expect(API).toMatch(/supervisorMonthlyTarget\.upsert/);
    expect(API).toMatch(/supervisorId_month/);
  });

  it("shows what the old roll-up came to, so a first target is not a guess", () => {
    // Reference only — it decides nothing. Without it an operator opening this
    // page for the first time has to remember the number they are replacing.
    expect(PAGE).toMatch(/referenceNote/);
    expect(PAGE).toMatch(/what this used to show/);
  });

  it("tells an unset supervisor apart from one set to zero", () => {
    expect(PAGE).toMatch(/not set/);
    expect(API).toMatch(/set: Boolean\(t\)/);
  });

  it("does not turn every supervisor into a zero target on the first save", () => {
    /*
     * Caught in the browser, not by reading the code.
     *
     * The page posts every supervisor row it is showing, touched or not. The
     * first version upserted all of them, so one press of "Save all changes"
     * wrote a row of zeros for every supervisor in the company — turning "no
     * target set" into "a target of zero" for all of them, silently, and
     * destroying the one distinction this whole feature rests on.
     */
    const post = API.slice(API.indexOf("if (Array.isArray(body.supRows))"));
    expect(post.slice(0, post.indexOf("bpRows"))).toMatch(/row\.set !== true\) continue/);
  });
});

describe("the rules stay usable from the browser", () => {
  it("imports nothing from Prisma, directly or by type", () => {
    /*
     * The company dashboard is a client component and applies these rules to
     * the rows it fetched. Importing a Prisma-touching module into client code
     * is how ~50KB of Prisma's browser stub reached the bundle in v134, which
     * is why the one function that queries the database lives in
     * lib/supervisor-target-query.ts.
     */
    const src = read("lib", "supervisor-target.ts");
    expect(src).not.toMatch(/from "\.\/prisma"/);
    expect(src).not.toMatch(/@prisma\/client/);
    expect(relative(path.join(ROOT, "lib", "supervisor-target-query.ts"))).toBe("lib/supervisor-target-query.ts");
    expect(read("lib", "supervisor-target-query.ts")).toMatch(/from "\.\/prisma"/);
  });
});

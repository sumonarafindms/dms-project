/**
 * One question, one calculation — including in the Reporting Center.
 *
 * ## The bug
 *
 * The owner reported that the Reporting Center's figures were wrong, GA first
 * and "the others too". They were, and for one reason.
 *
 * Every report that showed a number per RSO built it by walking the retailers
 * that RSO OWNS (`Retailer.employeeId`) and adding them up. Every dashboard in
 * the app does something different: an outlet held as a Business Partner has
 * its sales credited to the BP holder and removed from the owner's own figure.
 * That is the ledger v139 and v142 established and v178 spelled out. So the
 * same RSO, the same month, read one way on their own screen and another way
 * in the Reporting Center.
 *
 * Measured on the production-volume database (2,190 retailers, 77,084 GA rows)
 * for September, per RSO:
 *
 *     RSO 10   GA  1,575 on their page   1,680 in the report   (-105)
 *     RSO 1    GA    470 on their page     481 in the report   ( -11)
 *     RSO 3    GA    447 on their page     451 in the report   (  -4)
 *
 * with SSO (48 vs 49), LSO (45 vs 48) and C2C (৳1,691,300 vs ৳1,818,560) wrong
 * the same way. And because the TARGET came from the RSO's own `MonthlyTarget`
 * — which excludes the BP target by design — the achievement percentage
 * divided a figure covering somebody else's BP outlets by a target that never
 * covered them. The percentage was wrong even where the count looked close.
 *
 * ## The fix
 *
 * Every RSO-level report asks `employeePerformance`, the one function every
 * role screen already asks, and every supervisor-level report asks
 * `groupTotals`, the one place allowed to add a BP's figures to a team's. After
 * the change the two paths agree per RSO to the unit, on all four metrics.
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "..");
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/^(\s*)\/\/.*$/gm, (_m, i) => i);

const DATA = stripComments(read("lib", "report-data.ts"));

/** The body of one exported function, by brace matching from its signature. */
function body(src: string, name: string) {
  const at = src.indexOf(`export async function ${name}(`);
  expect(at, `${name} not found — has it been renamed?`).toBeGreaterThan(-1);
  const open = src.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`${name}: unbalanced braces`);
}

describe("the Reporting Center credits a BP the way every screen does", () => {
  const PER_RSO = ["rsoSummary", "rsoActivation"];
  const PER_SUPERVISOR = ["supervisorSummary", "rollUpToSupervisor"];

  it("asks the one performance function for every per-RSO report", () => {
    // `reportPerformanceRows` IS `employeePerformance`, named so that one
    // request can fetch the rows once and hand them to both the table and the
    // company figure above it. Asserted, so the indirection cannot become a
    // second implementation.
    expect(DATA).toMatch(/export const reportPerformanceRows = \(range: ReportRange\) =>\s*employeePerformance\(/);
    for (const fn of PER_RSO)
      expect(body(DATA, fn), `${fn} does not go through employeePerformance`).toMatch(
        /employeePerformance\(|reportPerformanceRows\(/,
      );
  });

  it("asks the one rollup for every per-supervisor report", () => {
    // `groupTotals` is where a Business Partner's figures are added to a
    // team's, and where an outlet held by two RSOs on one team is counted
    // once. A report doing that by hand would drift from the dashboards again.
    expect(body(DATA, "rollUpToSupervisor")).toMatch(/groupTotals\(/);
    // The daily report is a mapping over the same rollup, not a second one.
    expect(body(DATA, "supervisorSummary")).toMatch(/rollUpToSupervisor\(range/);
  });

  it("never rebuilds an RSO's figure from the retailers they own", () => {
    /*
     * The exact shape that was wrong, in all four functions:
     *
     *     const employeeOfRetailer = new Map(retailers.map(r => [r.id, r.employeeId]))
     *     ...
     *     acc.ga += r.ga        // per owned retailer
     *
     * `retailerReport` still rolls up per RETAILER and must — a retailer row
     * is about the outlet, and the outlet is where the sale happened. What is
     * banned is turning that into a per-PERSON figure.
     */
    for (const fn of [...PER_RSO, ...PER_SUPERVISOR]) {
      const src = body(DATA, fn);
      expect(src, `${fn} maps retailers to owners again`).not.toMatch(/employeeOfRetailer/);
      expect(src, `${fn} sums retailer rows into a person's figure`).not.toMatch(/byEmployee/);
      // The specific route back: rolling the retailer-level report up by owner.
      expect(src, `${fn} rolls retailer rows up into a person's figure again`).not.toMatch(/retailerReport\(/);
      expect(src, `${fn} reads the retailer table to attribute sales again`).not.toMatch(/prisma\.retailer\./);
    }
  });

  it("takes each figure and its target from the same place", () => {
    /*
     * The heart of it. A numerator covering outlets the denominator does not
     * cover is not an achievement percentage, and it is the failure that
     * survives a spot-check of the counts.
     */
    const rso = body(DATA, "rsoSummary");
    expect(rso, "rsoSummary reads a target table directly again").not.toMatch(/monthlyTarget\./);
    expect(rso).toMatch(/gaTarget: r\.gaTarget/);
    const act = body(DATA, "rsoActivation");
    expect(act, "rsoActivation reads a target table directly again").not.toMatch(/monthlyTarget\./);
  });

  it("keeps the retailer-level report about retailers", () => {
    // The one roll-up that is correct as it stands: `retailerReport` answers
    // "what happened at this outlet", which does not depend on who is credited.
    expect(body(DATA, "retailerReport")).toMatch(/retailerOpportunities\(/);
  });

  it("carries the supervisor's id so a rollup can group on it", () => {
    // Grouping on the NAME merged two supervisors who share one, and gave the
    // rollup no way to look up a stored target.
    expect(DATA).toMatch(/supervisorId: r\.supervisorId/);
  });
});

describe("an RSO card shows the same four metrics everywhere", () => {
  /**
   * The lists that show one card per RSO.
   *
   * They disagreed: the admin performance list showed GA, SSO and Recharge;
   * the supervisor's and the manager's showed GA, LSO and Recharge. So an RSO
   * had an LSO target that the screen called "Performance" never mentioned,
   * and the answer to "how is this RSO doing" depended on who was asking.
   */
  const LISTS = [
    "app/admin/performance/rsos/page.tsx",
    "app/supervisor/rsos/page.tsx",
    "app/manager/rsos/page.tsx",
    "app/admin/performance/supervisors/[id]/page.tsx",
    "app/manager/supervisors/[id]/page.tsx",
  ];

  it("shows GA, SSO, LSO and Recharge on all of them", () => {
    const missing: string[] = [];
    for (const file of LISTS) {
      const src = stripComments(read(file));
      for (const [label, field] of [
        ["GA", "gaAchieved"],
        ["SSO", "ssoAchieved"],
        ["LSO", "lsoAchieved"],
      ] as const)
        if (!new RegExp(`label: "${label}",\\s*\\n?\\s*achieved: r\\.${field}`).test(src))
          missing.push(`${file} has no ${label} metric`);
    }
    expect(missing, missing.join("\n  ")).toEqual([]);
  });

  it("names a real file for every entry", () => {
    for (const file of LISTS)
      expect(fs.existsSync(path.join(ROOT, file)), `${file} is listed and does not exist`).toBe(true);
  });
});

describe("the retailer drill-down can be asked about SSO", () => {
  const VIEW = stripComments(read("app", "components", "EmployeeDetailView.tsx"));

  it("orders by SSO as well as LSO", () => {
    // Every row already carried its SSO verdict — `lib/employee-detail.ts` has
    // computed it all along — and the list offered no way to lead with the
    // outlets that still owe one. SSO is the closable half of the pair: two
    // standard GA in the month, which an RSO can go and do today.
    expect(VIEW).toMatch(/value: "sso-pending"/);
    expect(VIEW).toMatch(/label: "SSO pending first"/);
    expect(VIEW).toMatch(/label: "LSO pending first"/);
  });

  it("shows the verdict it can now be ordered by", () => {
    // A list ordered by something it does not show is a list nobody can read.
    expect(VIEW).toMatch(/SSO complete/);
    expect(VIEW).toMatch(/SSO pending/);
  });

  it("does not call a non-seller an SSO failure", () => {
    // SSO applies to SIM sellers only. A shop that does not sell SIMs is not
    // behind on anything, and a red "SSO pending" against it is a false alarm
    // on somebody's worklist.
    expect(VIEW).toMatch(/Not a SIM seller/);
  });

  it("carries the field the sort reads", () => {
    expect(VIEW).toMatch(/sso: boolean/);
  });
});

describe("a report's total strip is the company, not the sum of what is shown", () => {
  /**
   * Found by auditing v181 rather than reported.
   *
   * Every grouped report built its summary strip with `rows.reduce(...)` over
   * the rows on screen, and that is wrong in two opposite directions. Measured
   * on the production-volume database for September:
   *
   *     grouped by RSO         GA 67,278  — 120 short of the company's 67,398
   *                            GA target 300 — 175 short
   *                            SSO −4, LSO −3, C2C −৳127,260
   *     grouped by supervisor  GA 67,409  — 11 MORE than the company
   *                            SSO +1
   *
   * An RSO row is that RSO's own credit with the Business Partner share held
   * aside, so adding them leaves it out. A supervisor row counts an outlet
   * worked by two teams once per team — correctly — so adding the teams counts
   * it twice. `lib/bp-rollup.ts` already stated the rule: "Only a total ACROSS
   * groups needs teamTotals() over the underlying rows, never a sum of these."
   */
  it("has one helper that knows the difference", () => {
    const fn = body(DATA, "companyTotals");
    expect(fn, "companyTotals does not use the rollup").toMatch(/teamTotals\(/);
    expect(fn, "companyTotals does not read the supervisors' own targets").toMatch(/sumSupervisorTargets\(/);
  });

  it("uses it on every report grouped by a person", () => {
    // The builders compute it; the pages read what the builder returned, so
    // the rows are fetched once per request rather than twice.
    const BUILDERS = stripComments(read("lib/report-builders.ts"));
    for (const fn of ["buildTarget", "buildPerformance", "buildValue"])
      expect(
        BUILDERS.slice(
          BUILDERS.indexOf(`export async function ${fn}(`),
          BUILDERS.indexOf(`export async function ${fn}(`) + 2600,
        ),
        fn,
      ).toMatch(/companyTotals\(/);
    const PAGES: Record<string, string> = {
      "app/it/reports/target/page.tsx": "Target vs Achievement — GA, SSO and LSO in the strip",
      "app/it/reports/performance/[kind]/page.tsx": "Entity performance — Total GA, Total Target, Achievement",
    };
    for (const [file, what] of Object.entries(PAGES))
      expect(stripComments(read(file)), `${file} (${what}) still sums the rows on screen`).toMatch(/built\.totals/);
  });

  it("leaves the sum alone where the rows ARE the things", () => {
    /*
     * A BP row and a retailer row are the outlet itself: nothing is held aside
     * and nothing is shared, so adding them IS the total. Switching those to
     * the company figure would be a different error, not a fix.
     */
    const perf = stripComments(read("app/it/reports/performance/[kind]/page.tsx"));
    expect(perf, "the retailer and BP groupings must still sum their rows").toMatch(
      /rows\.reduce\(\(a, r\) => a \+ r\.achieved, 0\)/,
    );
    // The builder decides: null totals for a BP or retailer grouping.
    const B = stripComments(read("lib/report-builders.ts"));
    expect(B).toMatch(/let company: CompanyTotals \| null = null;/);
  });

  it("fetches the performance rows once per report, not twice", () => {
    /*
     * The first version of this fix called `companyTotals` from the PAGE while
     * the builder had already fetched the same rows. `employeePerformance`
     * company-wide costs about 0.9s at production volume, so the Target report
     * went to five seconds and the C2C report to thirteen. The builder fetches
     * and passes the rows down.
     */
    const B = stripComments(read("lib/report-builders.ts"));
    for (const fn of ["buildTarget", "buildValue"]) {
      const src = B.slice(B.indexOf(`export async function ${fn}(`)).slice(0, 2600);
      expect((src.match(/reportPerformanceRows\(/g) || []).length, `${fn} fetches more than once`).toBe(1);
    }
    expect(DATA, "the helpers must accept rows that were already fetched").toMatch(
      /prefetched\?: EmployeePerformanceRows/,
    );
  });

  it("takes the target from the same basis as the rows", () => {
    // The numerator is the company either way. The denominator has to follow
    // the grouping, or the percentage compares two different questions — the
    // defect this version fixed one level down.
    const fn = body(DATA, "companyTotals");
    expect(fn).toMatch(/basis === "supervisor"/);
    expect(fn).toMatch(/sup \? sup\.gaTarget : t\.gaTarget/);
  });

  it("does not add up supervisor achievements on the supervisor performance list", () => {
    const src = stripComments(read("app/admin/performance/supervisors/page.tsx"));
    expect(src, "the Achieved figure still sums the supervisor rows").toMatch(
      /totalA = teamTotals\(rows\)\.totalRechargeAchieved/,
    );
  });
});

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * An RSO may hold several Business Partners at once.
 *
 * ## The bug
 *
 * Reported as "the new BP's name does not appear in the target list". It did
 * appear — and the previous one had gone.
 *
 * Assigning a BP found that RSO's existing active assignment, ended it with
 * `endDate = startDate - 1`, and moved its BP login to the new retailer. All of
 * it silently, reported back as a successful "assign". So adding a second BP
 * gave you a second BP and cost you the first, and the target list showed one
 * name where two were expected.
 *
 * Nothing errored. The screen said "BP assigned". The only way to notice was to
 * go looking for the BP that had quietly ended — which is the shape of failure
 * this project keeps finding.
 *
 * ## The rule now
 *
 * The constraint belongs to the RETAILER, not the RSO: one outlet cannot be an
 * active BP twice. Ending an assignment is its own deliberate action, because a
 * side-effect of adding is not a decision anyone made.
 */

const ROOT = path.join(__dirname, "..");
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const ROUTE = stripComments(read("app", "api", "admin", "bp-assignments", "route.ts"));
/** Only the POST handler — PATCH ends an assignment and legitimately does. */
const POST = ROUTE.slice(ROUTE.indexOf("export async function POST"), ROUTE.indexOf("export async function PATCH"));

describe("assigning a BP", () => {
  it("does not end another assignment as a side effect", () => {
    // The whole bug. `active: false` inside POST is what made adding one BP
    // remove another.
    expect(POST).not.toMatch(/active:\s*false/);
    expect(POST).not.toMatch(/endDate/);
  });

  it("does not look for the RSO's existing BP at all", () => {
    // It used to find `{ employeeId, active: true }` — an RSO-shaped question,
    // which is what made one-BP-per-RSO an unstated rule.
    expect(POST).not.toMatch(/employeeId,\s*active:\s*true/);
  });

  it("checks the retailer instead, which is the real constraint", () => {
    expect(POST).toMatch(/findFirst\(\{\s*where:\s*\{\s*retailerId,\s*active:\s*true\s*\}\s*\}\)/);
    expect(POST).toMatch(/already an active BP under another RSO/);
  });

  it("no longer moves a BP login between retailers", () => {
    // A consequence of the one-BP model: there was an "existing" BP whose login
    // had to go somewhere. With several BPs there is no such thing.
    expect(POST).not.toMatch(/bpRetailerId/);
    expect(POST).not.toMatch(/transferredLogin/);
    expect(stripComments(read("app", "admin", "bp-management", "BpManager.tsx"))).not.toMatch(/transferredLogin/);
  });

  it("edits in place when the same retailer is reassigned to the same RSO", () => {
    // Otherwise a correction to the start date or target would create a second
    // active assignment for one outlet.
    expect(POST).toMatch(/existing\.employeeId !== employeeId/);
    expect(POST).toMatch(/bpAssignment\.update/);
  });

  it("still refuses an outlet already assigned under a different RSO", () => {
    expect(POST).toMatch(/throw new Error\("This retailer is already an active BP under another RSO\."\)/);
  });
});

describe("ending a BP assignment stays deliberate", () => {
  const PATCH = ROUTE.slice(ROUTE.indexOf("export async function PATCH"));

  it("is what PATCH is for, and it still clears the login", () => {
    expect(PATCH).toMatch(/active:\s*false/);
    expect(PATCH).toMatch(/bpRetailerId:\s*null/);
  });
});

describe("every BP reaches the target list", () => {
  const api = stripComments(read("app", "api", "targets", "route.ts"));

  it("selects BP assignments by month overlap, not by RSO", () => {
    // Nothing here caps the list per employee, so once POST stops ending the
    // previous assignment, all of an RSO's BPs arrive together.
    expect(api).toMatch(/bpAssignment\.findMany/);
    expect(api).toMatch(/startDate:\s*\{\s*lt:\s*end\s*\}/);
    expect(api).toMatch(/OR:\s*\[\{\s*endDate:\s*null\s*\}/);
  });

  it("has no row limit on the BP list", () => {
    /*
     * A `take` here would reintroduce the same symptom by a different route: a
     * BP that exists and is not shown.
     *
     * The end of the slice is searched FROM the start of the query. An earlier
     * version measured to the first `return NextResponse.json` in the file,
     * which is the 401 near the top — before the query — so the slice came out
     * empty and the assertion checked nothing. It passed with a `take: 20`
     * deliberately inserted, which is how it was caught.
     */
    const start = api.indexOf("bpAssignment.findMany");
    expect(start, "the BP query was not found").toBeGreaterThan(-1);
    const bpQuery = api.slice(start, api.indexOf("return NextResponse.json", start));
    expect(bpQuery.length, "the slice is empty, so this test would check nothing").toBeGreaterThan(100);
    // `monthlyTargets: { where: { month }, take: 1 }` is a nested include and
    // entirely correct — one month has one target. Only a `take` on the
    // assignment list itself would hide a BP.
    // Dropped by LINE: `[^}]*` stopped at the first brace — the inner
    // `{ month }` — and left `, take: 1 }` behind, so the test failed on
    // correct code.
    const assignmentLevel = bpQuery.replace(/^.*monthlyTargets:.*$/gm, " ");
    expect(assignmentLevel).not.toMatch(/take:\s*\d+/);
  });

  it("carries the month's own target, falling back to the standing one", () => {
    expect(api).toMatch(/monthlyTargets\[0\]\?\.gaTarget \?\? a\.gaTarget/);
  });

  it("saves a target per assignment", () => {
    expect(api).toMatch(/bpMonthlyTarget\.upsert/);
    expect(api).toMatch(/assignmentId_month/);
  });
});

describe("the BP management screen shows them all", () => {
  const page = stripComments(read("app", "admin", "bp-management", "page.tsx"));

  it("lists every active assignment without a cap", () => {
    const active = page.slice(page.indexOf("active: true"), page.indexOf("active: false"));
    expect(active).not.toMatch(/take:\s*\d+/);
  });
});

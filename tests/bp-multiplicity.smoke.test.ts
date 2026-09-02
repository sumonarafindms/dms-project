import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * One rule, checked everywhere: an RSO may hold several Business Partners.
 *
 * ## Why this file exists rather than three more assertions
 *
 * v139 allowed several BPs per RSO — and fixed exactly one of the places that
 * assumed otherwise. Three more were left behind, and each failed silently in
 * its own way:
 *
 *   - The employee form still ended the RSO's existing BP when creating a new
 *     one. The fix held at one entrance and not the other, so the behaviour
 *     depended on which screen you used — worse than not fixing it at all.
 *   - `/rso/bp` showed ONE active assignment, chosen arbitrarily by the
 *     database. An RSO with three BPs saw one and could not reach the others.
 *   - The RSO home's tile counted `bp ? 1 : 0`, so three BPs read as one.
 *
 * None of them errored. That is the pattern: a model changes, its consumers do
 * not, and nothing complains.
 *
 * So this suite does not test three places. It tests the RULE — by finding
 * every query that asks a one-BP-per-RSO question — which is what stops the
 * fourth consumer being missed the way these three were.
 */

const ROOT = path.join(__dirname, "..");
const rel = (f: string) => path.relative(ROOT, f);
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(e.name)) acc.push(full);
  }
  return acc;
}

const FILES = [...sourceFiles(path.join(ROOT, "app")), ...sourceFiles(path.join(ROOT, "lib"))].map((file) => ({
  file,
  src: stripComments(fs.readFileSync(file, "utf8")),
}));

/**
 * The braces-balanced body of every `bpAssignment.findFirst|findUnique` call.
 *
 * This started as one regex — `findFirst\(\{([\s\S]{0,400}?)\}\s*\)` — and it
 * was worse than no test. `/rso/bp` has a nested `include`, so its call is well
 * over 400 characters and the pattern simply did not match it: the offending
 * query was invisible to the rule meant to police it. Verified by putting the
 * bug back — this suite stayed green.
 *
 * A cap on how much of a call you are willing to read is a cap on which bugs
 * you can find, so the brace depth is counted instead.
 */
function objectAt(src: string, open: number): string {
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}" && --depth === 0) return src.slice(open + 1, j);
  }
  return "";
}

/**
 * A single-row lookup on BP assignments, with the `where` it uses.
 *
 * `findFirst`/`findUnique` are not wrong in themselves — keyed by RETAILER they
 * are exactly right, because one outlet can only be an active BP once. Keyed by
 * EMPLOYEE they encode "this RSO has one BP", which is the rule that changed.
 */
function singleLookups(src: string) {
  const out: string[] = [];
  const re = /bpAssignment\.(?:findFirst|findUnique)\(\s*\{/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const body = objectAt(src, src.indexOf("{", m.index));
    const k = body.indexOf("where:");
    // `where:` whose value is a variable or spread rather than a literal tells
    // us nothing; an empty string is not keyed by employeeId, which is right.
    out.push(k === -1 ? "" : objectAt(body, body.indexOf("{", k)));
  }
  return out;
}

describe("no query asks for an RSO's one BP", () => {
  it("finds the BP queries it is meant to police", () => {
    /*
     * Named call sites, not a count.
     *
     * This was `withLookups.length >= 4`, and nine files match — so the parser
     * could stop understanding a file entirely and the floor still cleared.
     * Verified by renaming the call in lib/bp-activations.ts: the suite stayed
     * green, which is the same failure the 400-character cap had.
     *
     * Each file below MUST yield a lookup with a readable `where`. If the
     * parser breaks, one of these goes missing and says which.
     */
    const mustFind = [
      "app/api/admin/bp-assignments/route.ts",
      "app/api/admin/employees/[role]/route.ts",
      "app/bp/page.tsx",
      "app/bp/sales/page.tsx",
      "lib/bp-activations.ts",
    ];
    for (const want of mustFind) {
      const f = FILES.find((x) => rel(x.file) === want);
      expect(f, `${want} is not being scanned`).toBeTruthy();
      const wheres = singleLookups(f!.src).filter((w) => w.trim().length > 0);
      expect(wheres.length, `no readable BP lookup parsed out of ${want}`).toBeGreaterThan(0);
    }
  });

  it("has no single-row lookup keyed by employeeId", () => {
    const offenders = FILES.filter((f) =>
      singleLookups(f.src).some((where) => /employeeId/.test(where) && !/retailerId/.test(where)),
    ).map((f) => rel(f.file));
    expect(offenders, "an RSO may hold several BPs — use findMany or count, not findFirst on employeeId").toEqual([]);
  });

  it("still allows a single-row lookup keyed by the retailer", () => {
    // One outlet cannot be an active BP twice, so this shape is correct and
    // must not be swept up by the rule above. /bp and /bp/sales rely on it.
    const retailerKeyed = FILES.filter((f) => singleLookups(f.src).some((where) => /retailerId/.test(where)));
    expect(retailerKeyed.length).toBeGreaterThanOrEqual(3);
  });
});

describe("neither creation path ends another assignment", () => {
  const paths = ["app/api/admin/bp-assignments/route.ts", "app/api/admin/employees/[role]/route.ts"];

  it("covers both entrances", () => {
    for (const p of paths) expect(fs.existsSync(path.join(ROOT, p)), p).toBe(true);
  });

  it("never deactivates an assignment while creating one", () => {
    for (const p of paths) {
      const src = stripComments(fs.readFileSync(path.join(ROOT, p), "utf8"));
      // Only the section that creates — PATCH legitimately ends an assignment.
      const post = src.slice(src.indexOf("export async function POST"), src.indexOf("export async function PATCH"));
      expect(post.length, `${p}: could not isolate POST`).toBeGreaterThan(200);
      expect(post, p).not.toMatch(/active:\s*false/);
      expect(post, p).not.toMatch(/endDate:\s*new Date/);
    }
  });

  it("moves no BP login between retailers", () => {
    for (const p of paths) {
      const src = stripComments(fs.readFileSync(path.join(ROOT, p), "utf8"));
      const post = src.slice(src.indexOf("export async function POST"), src.indexOf("export async function PATCH"));
      expect(post, p).not.toMatch(/transferableUser|transferredLogin/);
    }
  });

  it("still refuses an outlet that is already an active BP", () => {
    for (const p of paths) {
      const src = stripComments(fs.readFileSync(path.join(ROOT, p), "utf8"));
      expect(src, p).toMatch(/findFirst\(\{\s*where:\s*\{\s*retailerId,\s*active:\s*true\s*\}\s*\}\)/);
      expect(src, p).toMatch(/already an active BP/);
    }
  });
});

describe("the RSO's own screens show every BP", () => {
  const bpPage = stripComments(fs.readFileSync(path.join(ROOT, "app", "rso", "bp", "page.tsx"), "utf8"));
  const home = stripComments(fs.readFileSync(path.join(ROOT, "app", "rso", "page.tsx"), "utf8"));

  it("lists them rather than picking one", () => {
    expect(bpPage).toMatch(/bpAssignment\.findMany\(\{\s*where:\s*\{\s*employeeId[^}]*active:\s*true/);
    expect(bpPage).toMatch(/active\.map\(/);
  });

  it("counts GA in one query for all of them", () => {
    // A count per BP would be a query per BP, and standardGaByAssignment
    // already clips each assignment to its own window.
    expect(bpPage).toMatch(/standardGaByAssignment\(active,/);
    expect(bpPage).not.toMatch(/gaActivation\.count\(/);
  });

  it("reports the real number on the home tile", () => {
    // It was `bp ? 1 : 0`.
    expect(home).toMatch(/bpAssignment\.count\(/);
    expect(home).toMatch(/count=\{bpCount\}/);
    expect(home).not.toMatch(/count=\{bp \? 1 : 0\}/);
  });
});

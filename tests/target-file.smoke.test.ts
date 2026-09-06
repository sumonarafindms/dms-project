import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The target sheet is six columns, one row per person.
 *
 * ## Why the shape changed
 *
 *     CODE | GA | C2C | SC | SSO | LSO
 *
 * It used to be one row per TARGET — `RSO_NUMBER, BP_CODE, TARGET_TYPE,
 * TARGET` — so giving one RSO six numbers took six rows, and forty RSOs took
 * two hundred and forty. None of it could be pasted from anything, because
 * every value needed its own label typed beside it. A row per person and a
 * column per metric is the shape a spreadsheet is already in when you copy a
 * block of numbers out of one.
 *
 * CODE is one column, not two: an RSO's mobile number or a BP's retailer code.
 * A row is one or the other, and a blank column beside every value is a column
 * people mis-fill.
 *
 * ## What is actually load-bearing
 *
 * The column ORDER, because the point of the file is pasting into it — a sheet
 * whose columns move is a sheet that silently imports C2C as SC.
 *
 * And the BP rule: a code names an OUTLET, and an outlet can be a Business
 * Partner under several RSOs at once, so one row must set the target for every
 * one of them.
 */

const ROOT = path.join(__dirname, "..");
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const SAMPLE = read("app", "api", "samples", "[type]", "route.ts");
const IMPORT = stripComments(read("app", "api", "targets", "import", "route.ts"));

describe("the downloadable sample", () => {
  /** The `targets:` definition, sliced out by brace depth. */
  const targetsBlock = (() => {
    const at = SAMPLE.indexOf("  targets: {");
    expect(at, "the targets sample definition was not found").toBeGreaterThan(-1);
    const open = SAMPLE.indexOf("{", at);
    let depth = 0;
    for (let i = open; i < SAMPLE.length; i++) {
      if (SAMPLE[i] === "{") depth++;
      else if (SAMPLE[i] === "}" && --depth === 0) return SAMPLE.slice(open, i + 1);
    }
    return "";
  })();

  it("was sliced out, so the assertions below mean something", () => {
    expect(targetsBlock.length).toBeGreaterThan(100);
  });

  it("has the six columns in the order the file is pasted in", () => {
    // Read from the FIRST row literal, because json_to_sheet takes its column
    // order from the first object's keys — the order here is the order in the
    // spreadsheet, not a formality.
    const firstRow = targetsBlock.slice(targetsBlock.indexOf("rows: ["));
    const keys = [...firstRow.slice(0, firstRow.indexOf("}")).matchAll(/([A-Z0-9_]+):/g)].map((m) => m[1]);
    expect(keys).toEqual(["CODE", "GA", "C2C", "SC", "SSO", "LSO"]);
  });

  it("shows both kinds of row, so the one CODE column is self-explanatory", () => {
    // An RSO mobile number and a retailer code, in one file.
    expect(targetsBlock).toMatch(/CODE: "01\d{9}"/);
    expect(targetsBlock).toMatch(/CODE: "R\d+"/);
  });

  it("no longer ships the per-target layout", () => {
    expect(targetsBlock).not.toMatch(/TARGET_TYPE/);
    expect(targetsBlock).not.toMatch(/BP_CODE/);
  });
});

describe("the importer reads the six-column sheet", () => {
  it("keys the row on CODE and chooses the layout by heading", () => {
    expect(IMPORT).toMatch(/idx\("CODE"\)/);
    // TARGET_TYPE present means the old per-target sheet; absent means this one.
    expect(IMPORT).toMatch(/const wide = iType < 0/);
  });

  it("maps every column to its stored target", () => {
    for (const [head, key] of [
      ["GA", "gaTarget"],
      ["C2C", "c2cTarget"],
      ["SC", "scTarget"],
      ["SSO", "ssoTarget"],
      ["LSO", "lsoTarget"],
    ])
      expect(IMPORT, `${head} is not mapped`).toMatch(new RegExp(`head: "${head}", key: "${key}"`));
  });

  it("keeps counts whole and money decimal", () => {
    // GA, SSO and LSO are counts of things; C2C and SC are taka.
    const line = (h: string) => IMPORT.split("\n").find((l) => l.includes(`head: "${h}"`)) ?? "";
    for (const h of ["GA", "SSO", "LSO"]) expect(line(h), h).toMatch(/integer: true/);
    for (const h of ["C2C", "SC"]) expect(line(h), h).toMatch(/integer: false/);
  });

  it("still accepts the previous per-target sheet", () => {
    // A file that used to import must not start failing.
    expect(IMPORT).toMatch(/TARGET_TYPE/);
    expect(IMPORT).toMatch(/BP_CODE supports TARGET_TYPE BP_GA or GA/);
  });
});

describe("a BP code names an outlet, not one assignment", () => {
  it("sets the target on every RSO holding that code", () => {
    /*
     * This is the v142 rule in the importer. `bpByCode` used to keep the FIRST
     * assignment per code (`if (!bpByCode.has(code))`), which was correct while
     * an outlet had one holder and became a silent half-import the moment it
     * could have two: one RSO's target updated, the rest left as they were,
     * and the file reported success.
     */
    expect(IMPORT).toMatch(/const bpByCode = new Map<string, BpAssignmentRow\[\]>\(\)/);
    expect(IMPORT).not.toMatch(/if \(!bpByCode\.has\(code\)\)/);
    // Both layouts write through the same loop shape.
    expect(
      [...IMPORT.matchAll(/for \(const a of assignments\) bpTargets\.set\(a\.id,/g)].length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("only looks at assignments that are actually live", () => {
    expect(IMPORT).toMatch(/bpAssignment\.findMany\(\{\s*where:\s*\{\s*active:\s*true/);
  });

  it("reports the columns a BP row cannot use rather than dropping them", () => {
    // A BP has a GA target and nothing else in this schema. A number typed into
    // C2C on a BP row is a misunderstanding worth answering, not swallowing.
    expect(IMPORT).toMatch(/ignored/);
    expect(IMPORT).toMatch(/BPs carry a GA target only/);
  });

  it("refuses a code that could be either", () => {
    // Deterministic beats clever: if one string matches an RSO number and a
    // retailer code, the import says so instead of picking one.
    expect(IMPORT).toMatch(/matches both an RSO and a BP retailer code/);
  });

  it("treats a blank cell and a bad cell differently", () => {
    // Blank leaves the stored target alone; "abc" is an error. Reading both as
    // zero would wipe targets nobody meant to touch.
    expect(IMPORT).toMatch(/must be a valid non-negative number/);
    expect(IMPORT).toMatch(/if \(text\(row\[c\.at\]\)\) throw new Error/);
  });
});

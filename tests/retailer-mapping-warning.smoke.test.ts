import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { diagnoseRetailerMapping } from "../lib/master-import";

/**
 * A retailer master that imported perfectly and connected to nothing.
 *
 * ## The failure
 *
 * A retailer is matched to its RSO by `I_TOP_UP_SR_NUMBER`, which holds **the
 * RSO's** mobile number — not the retailer's. Put the retailer's number there
 * and every row still imports: the code is valid, the name is valid, nothing is
 * rejected. The screen says
 *
 *     Imported 2190/2190 · mapped 0 · unassigned 2190
 *
 * in the success tone, and afterwards every screen that groups by RSO is empty
 * with nothing anywhere explaining why.
 *
 * I made this exact mistake loading the owner's real files, read that green
 * message, and had to open the importer's source to understand it. The counts
 * were on screen the whole time. **A number is not a diagnosis.**
 *
 * ## What is guarded
 *
 * That the app now names the likely cause — and, just as importantly, that it
 * stays quiet when nothing is wrong. A warning that fires on a healthy import
 * is noise, and noise is ignored, which would put us back where we started.
 */

describe("diagnoseRetailerMapping", () => {
  it("blames the missing RSO master when there are no RSOs at all", () => {
    /*
     * Two causes produce mapped: 0, and they need different advice. If no RSO
     * has ever been imported, telling someone to check a column sends them to
     * inspect a file that is fine.
     */
    const w = diagnoseRetailerMapping({
      successRows: 2190,
      mappedRows: 0,
      employeeCount: 0,
      unmatchedNumbers: ["01900000001"],
    });
    expect(w).toMatch(/RSO master first/i);
    expect(w, "sent the operator to check a column when the real cause was no RSOs").not.toMatch(/I_TOP_UP_SR_NUMBER/);
  });

  it("names the column when RSOs exist but nothing matched", () => {
    const w = diagnoseRetailerMapping({
      successRows: 2190,
      mappedRows: 0,
      employeeCount: 20,
      unmatchedNumbers: ["01986652229", "01935527276"],
    });
    expect(w).toMatch(/I_TOP_UP_SR_NUMBER/);
    expect(w).toMatch(/RSO's mobile number, not the retailer's/i);
    // A value from their own file, so they can compare it against the RSO
    // master themselves instead of taking the explanation on trust.
    expect(w).toContain("01986652229");
    // And what it costs them, or there is no reason to act on it.
    expect(w).toMatch(/report.*empty/i);
  });

  it("warns when most rows missed, which is not ordinary attrition", () => {
    const w = diagnoseRetailerMapping({
      successRows: 1000,
      mappedRows: 200,
      employeeCount: 20,
      unmatchedNumbers: ["01900000009"],
    });
    expect(w).toMatch(/Only 200 of 1,000/);
    expect(w).toContain("01900000009");
  });

  it("says nothing about a healthy import", () => {
    /*
     * The half that keeps the warning worth reading. Some outlets genuinely
     * have no RSO — the owner's own Balance file has nine — and flagging that
     * every time would train people to ignore the box.
     */
    expect(
      diagnoseRetailerMapping({ successRows: 2190, mappedRows: 2181, employeeCount: 20, unmatchedNumbers: ["01"] }),
    ).toBeNull();
    expect(
      diagnoseRetailerMapping({ successRows: 100, mappedRows: 100, employeeCount: 20, unmatchedNumbers: [] }),
    ).toBeNull();
    // Exactly on the line: half matched is not yet "most rows missed".
    expect(
      diagnoseRetailerMapping({ successRows: 100, mappedRows: 50, employeeCount: 20, unmatchedNumbers: [] }),
    ).toBeNull();
  });

  it("says nothing about an empty file", () => {
    // Zero of zero is not a mapping problem, and "0 of 0 matched" would be a
    // confusing thing to read.
    expect(
      diagnoseRetailerMapping({ successRows: 0, mappedRows: 0, employeeCount: 0, unmatchedNumbers: [] }),
    ).toBeNull();
  });

  it("still works when no unmatched number was captured", () => {
    const w = diagnoseRetailerMapping({ successRows: 10, mappedRows: 0, employeeCount: 5, unmatchedNumbers: [] });
    expect(w).toMatch(/I_TOP_UP_SR_NUMBER/);
    expect(w, "left a dangling 'Example from your file:' with nothing after it").not.toMatch(
      /Example from your file:\s*\./,
    );
  });
});

describe("the warning actually reaches the operator", () => {
  const ROOT = path.join(__dirname, "..");
  const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
  const codeOf = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("is returned by the importer", () => {
    const src = codeOf(read("lib", "master-import.ts"));
    expect(src).toMatch(/mappingWarning = diagnoseRetailerMapping\(/);
    // Returned, not merely computed.
    expect(src).toMatch(/\n\s*mappingWarning,\n/);
  });

  it("survives the API route", () => {
    /*
     * The route spreads the importer's result. A route that picked fields by
     * hand would drop a new one silently, which is how a warning ends up
     * existing in the code and never on a screen.
     */
    const route = codeOf(read("app", "api", "master", "import", "[type]", "route.ts"));
    expect(route).toMatch(/\.\.\.result/);
  });

  it("is shown on both upload screens", () => {
    for (const file of [
      ["app", "admin", "upload", "retailers", "page.tsx"],
      ["app", "master-data", "page.tsx"],
    ] as const) {
      const src = read(...file);
      expect(codeOf(src), `${file.join("/")} ignores mappingWarning`).toMatch(/mappingWarning/);
    }
  });

  it("changes the tone, so it is not delivered as good news", () => {
    // The whole failure was a problem reported in green.
    expect(codeOf(read("app", "master-data", "page.tsx"))).toMatch(/setTone\(data\.mappingWarning \? "bad" : "ok"\)/);
    expect(codeOf(read("app", "admin", "upload", "retailers", "page.tsx"))).toMatch(
      /kit-note is-bad[\s\S]{0,200}mappingWarning/,
    );
  });
});

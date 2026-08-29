import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * A source-level rule, asserted rather than remembered.
 *
 * `pacing()` answers a monthly question — "22 days left, need 44/day". Several
 * pages accept `from`/`to` search params, so the figures they display may
 * describe an eight-day window instead. On those pages the monthly answer is a
 * confidently wrong number, and `pacingForView()` exists to return null there.
 *
 * Getting this wrong is silent: the page renders, the figure looks
 * authoritative, and only someone checking the arithmetic would notice. So the
 * pairing is checked here instead of relying on the next person to know.
 */

const APP = path.join(__dirname, "..", "app");

function tsxFiles(dir = APP, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) tsxFiles(full, acc);
    else if (e.name.endsWith(".tsx")) acc.push(full);
  }
  return acc;
}

/** A file is range-aware if it can receive a narrowed date range. */
const isRangeAware = (src: string) => /\bfrom\?: string\b/.test(src) || /\bfrom\?:\s*string\s*\|/.test(src);

const rel = (f: string) => path.relative(path.join(__dirname, ".."), f);

/** Block and line comments removed, so prose cannot satisfy or fail a rule. */
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

describe("pacing wiring", () => {
  const users = tsxFiles()
    .map((file) => ({ file, src: fs.readFileSync(file, "utf8") }))
    .filter(({ src }) => /from "[^"]*lib\/pacing"/.test(src));

  it("is actually used somewhere", () => {
    // Guards against this suite quietly passing because nothing imports it.
    expect(users.length).toBeGreaterThan(4);
  });

  it("never calls the unguarded pacing() from a page that accepts from/to", () => {
    const offenders = users
      .filter(({ file, src }) => {
        // Kit.tsx only re-exports types and helpers; it renders what it is given.
        if (path.basename(file) === "Kit.tsx") return false;
        if (!isRangeAware(src)) return false;
        // `pacingForView` contains "pacing" too, so match the bare call.
        return /(^|[^A-Za-z])pacing\s*\(/.test(src);
      })
      .map(({ file }) => rel(file));
    expect(offenders, "these accept from/to and must use pacingForView").toEqual([]);
  });

  it("keeps the range-aware pages on pacingForView", () => {
    const rangeAware = users.filter(({ file, src }) => path.basename(file) !== "Kit.tsx" && isRangeAware(src));
    // If this ever drops to zero the rule above has become vacuous.
    expect(rangeAware.length).toBeGreaterThan(0);
    for (const { file, src } of rangeAware) expect(src, `${rel(file)} is range-aware`).toMatch(/pacingForView\s*\(/);
  });

  it("passes the server clock into the one client component that shows pacing", () => {
    // EmployeeDetailView is "use client", so it renders twice — once on the
    // server for the HTML, once in the browser on hydration. Reading the clock
    // itself would let the two disagree across a Dhaka midnight.
    const view = fs.readFileSync(path.join(APP, "components", "EmployeeDetailView.tsx"), "utf8");
    expect(view).toMatch(/nowIso/);
    // Comments stripped first: the explanation of this very rule contains the
    // words `new Date()`, and an earlier version of this test failed on its
    // own prose rather than on any code.
    expect(stripComments(view), "must not read its own clock").not.toMatch(/new Date\(\)/);

    for (const parent of [
      ["supervisor", "rsos", "[id]"],
      ["admin", "rsos", "[id]"],
      ["manager", "rsos", "[id]"],
    ]) {
      const f = path.join(APP, ...parent, "page.tsx");
      expect(fs.readFileSync(f, "utf8"), `${parent.join("/")} must pass nowIso`).toMatch(/nowIso=/);
    }
  });
});

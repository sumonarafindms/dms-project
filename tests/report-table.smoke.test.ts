import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * A report's rows are rendered ONCE.
 *
 * ## What was shipping
 *
 * `ReportTable` drew every row twice — a `<table>` for wide screens and a
 * second list of cards for narrow ones — and CSS hid whichever did not apply.
 * Both went to every reader. Measured on `/it/reports/sso` at 60 rows and 8
 * columns, against the production-volume database:
 *
 *     desktop <tbody>           10.1KB
 *     phone .kit-report-cards   34.8KB   <- 3.4x, because every cell repeated
 *                                           its column label as text
 *     document total           217.5KB   (146.4KB of it the RSC flight
 *                                         payload, which carries a copy of each)
 *
 * So a phone downloaded the table it would never see, a desktop downloaded the
 * cards it would never see, and the flight payload carried both again.
 *
 * ## After
 *
 *     /it/reports/sso                  217.5KB -> 113.4KB   (-48%)
 *     /it/reports/ob                   183.2KB ->  95.9KB   (-48%)
 *     /it/reports/low-c2s              219.7KB -> 115.1KB   (-48%)
 *     /it/reports/performance/retailer 263.7KB -> 134.9KB   (-49%)
 *
 * The cell now carries `data-label` and the card layout is drawn from it by
 * CSS, so the label cannot drift from the column heading: it IS the column
 * heading.
 */

const ROOT = path.join(__dirname, "..");
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const TABLE = read("app", "components", "ReportTable.tsx");
const KIT_CSS = read("styles", "kit.css");
const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\/[^\n]*/g, " ");
const CODE = stripComments(TABLE);
const CSS = stripComments(KIT_CSS);

describe("the rows are in the markup once", () => {
  it("there is no second card rendering", () => {
    expect(CODE, "a second pass over the rows is a second copy in every document").not.toContain("kit-report-cards");
    expect(CODE).not.toContain("kit-report-cardrow");
    expect(CSS, "the stylesheet still styling a list nothing renders").not.toContain("kit-report-cardrow");
  });

  it("the rows are mapped exactly once", () => {
    const maps = [...CODE.matchAll(/slice\.rows\.map\(/g)];
    expect(maps, `slice.rows is mapped ${maps.length} times; once is the rule`).toHaveLength(1);
  });

  it("every cell carries its column's label", () => {
    expect(CODE, "the card layout prints this through content: attr(data-label)").toMatch(/data-label=\{c\.label\}/);
  });

  it("the label a cell carries is the same string the heading uses", () => {
    // Both read `c.label`. A second source would be a second thing to keep in
    // step, which is what the two renderings were.
    const th = CODE.match(/<th[\s\S]{0,200}?>\s*\{c\.label\}/);
    expect(th, "the <th> no longer prints c.label").toBeTruthy();
  });
});

describe("the phone still gets cards", () => {
  it("the table becomes a stack below 768px", () => {
    expect(CSS).toMatch(/@media \(max-width: 767px\)/);
    expect(CSS).toMatch(/\.kit-report-table thead\s*\{\s*display: none/);
    expect(CSS).toMatch(/\.kit-report-table tbody td::before\s*\{\s*content: attr\(data-label\)/);
  });

  it("a row is a card, not a table row, at that width", () => {
    const block = CSS.slice(CSS.indexOf("@media (max-width: 767px)"), CSS.indexOf("/* Paper is wide"));
    expect(block).toMatch(/\.kit-report-table tbody tr\s*\{[\s\S]*?border-radius/);
  });
});

describe("it is still a table to a screen reader", () => {
  it("the roles are written out", () => {
    /*
     * `display: block` on a table's elements removes the table from the
     * accessibility tree — rows stop being rows, cells stop being cells. The
     * card layout sets exactly that below 768px, so the roles are stated.
     * What this replaced offered nothing at all at that width: the card list
     * was plain divs.
     */
    expect(CODE).toMatch(/<table role="table">/);
    expect(CODE).toMatch(/<tr role="row">/);
    expect(CODE).toMatch(/role="columnheader"/);
    expect(CODE).toMatch(/role="cell"/);
  });

  it("the column headers say which direction they head", () => {
    expect(CODE).toMatch(/scope="col"/);
  });
});

describe("paper gets the table back", () => {
  it("print restores the table display roles", () => {
    const print = KIT_CSS.slice(KIT_CSS.indexOf("@media print"));
    for (const rule of [/table\s*\{\s*display: table !important/, /thead\s*\{\s*display: table-header-group/])
      expect(print).toMatch(rule);
  });

  it("print does not say every value twice", () => {
    // The column headings are back on paper, so the per-cell label would
    // repeat each one beside its own value.
    const print = KIT_CSS.slice(KIT_CSS.indexOf("@media print"));
    expect(print).toMatch(/td::before\s*\{\s*content: none !important/);
  });
});

describe("what did not change", () => {
  it("the table is still a Server Component", () => {
    /*
     * The columns carry `render` functions. Marking this file "use client"
     * means passing functions across the RSC boundary, which React refuses —
     * and every report answered 500 the last time that happened.
     */
    expect(TABLE.trimStart().startsWith('"use client"')).toBe(false);
  });

  it("the slice still happens here, over the whole report", () => {
    expect(CODE).toMatch(/pageOf\(rows, paging\.page/);
  });
});

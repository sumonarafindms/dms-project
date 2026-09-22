/**
 * The stock exports and the daily report.
 *
 * The rules guarded here are the ones that make an export trustworthy, and
 * each has already broken somewhere in this app:
 *
 *   - a file must carry the SCOPE of its page, resolved from the session;
 *   - a file is the whole report, never the page on screen;
 *   - an unknown figure is a blank cell, never a 0.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BOOKS_READ_ROLES, SIM_CHECK_ROLES } from "../lib/lifting-data";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const ROUTE = "app/api/stock/export/route.ts";

describe("every file carries its page's scope", () => {
  const src = code(ROUTE);

  it("resolves scope from the session, never from the URL", () => {
    expect(src).toContain("await stockScope(actor)");
    expect(src).toContain("await simCheckScope(actor)");
    // No parameter names a role or a scope.
    expect(src).not.toMatch(/searchParams\.get\(["'](role|scope|holders|employeeIds)["']\)/);
  });

  it("one person's stock file refuses a person outside the caller's scope", () => {
    expect(src).toContain("if (!mayOpen(scope, type, id)) return deny();");
  });

  it("the buying side is Accounts, IT and Admin", () => {
    // margin, expenses and daily all gate on `books` before building.
    for (const r of ["margin", "expenses", "daily"]) {
      const at = src.indexOf(`report === "${r}"`);
      expect(at, `no branch for ${r}`).toBeGreaterThan(0);
      expect(src.slice(at, at + 120), `${r} does not check the buying-side roles`).toContain(
        "if (!books) return deny();",
      );
    }
    expect(src).toContain("BOOKS_READ_ROLES.includes(actor.role)");
  });

  it("the SIM check reaches exactly its page's roles", () => {
    const at = src.indexOf('report === "simcheck"');
    expect(src.slice(at, at + 120)).toContain("SIM_CHECK_ROLES.includes(actor.role)");
    expect([...SIM_CHECK_ROLES].sort()).toEqual(["ACCOUNTS", "ADMIN", "IT", "MANAGER", "SUPERVISOR"]);
  });

  it("it is rate limited in its own body", () => {
    expect(src).toContain("consumeRateLimit(RATE_LIMITS.download");
  });
});

describe("a file is the whole report", () => {
  it("reads neither page nor search", () => {
    /*
     * Somebody on page one who exports sixty rows and believes they have the
     * report is the failure mode — the same rule /api/reports/export has
     * followed since v152.
     */
    const src = code(ROUTE);
    expect(src).not.toMatch(/["']page["']/);
    expect(src).not.toMatch(/["']q["']/);
  });

  it("an empty report is a 204, not an empty workbook", () => {
    expect(code(ROUTE)).toContain("if (!built.rows.length) return new NextResponse(null, { status: 204 });");
  });

  it("reads through the same functions the pages render from", () => {
    const src = code("lib/stock-export.ts");
    for (const fn of ["holderDues", "holderPosition", "houseBooks", "expensesIn", "simCheckRows"])
      expect(src, `the export does not reuse ${fn}`).toContain(`${fn}(`);
  });
});

describe("an unknown figure is a blank cell, never 0", () => {
  it("margin and godown value are blank for a product with no lifting cost", () => {
    /*
     * v194 found a missing cost read as zero made a whole sale look like
     * profit; v195 found the godown value doing the same. A blank cell is a
     * question; a 0 is an answer, and it would be the wrong one.
     */
    const src = code("lib/stock-export.ts");
    expect(src).toContain('"Avg cost": l.hasCost ? l.avgCost : ""');
    expect(src).toContain('"Margin sold": l.hasCost ? l.marginSold : ""');
    expect(src).toContain('"Godown value": l.hasCost ? l.godownValue : ""');
  });

  it("an unpriced SIM gap is blank", () => {
    expect(code("lib/stock-export.ts")).toContain('"Worth (at issue price)": r.unreportedValue ?? ""');
  });
});

describe("the daily report", () => {
  it("is on the buying side, like expenses and lifting", () => {
    expect([...BOOKS_READ_ROLES].sort()).toEqual(["ACCOUNTS", "ADMIN", "IT"]);
    expect(read("app/stock/day-report/page.tsx")).toContain('requireUser(["ACCOUNTS", "ADMIN", "IT"])');
  });

  it("shows sold and collected side by side and never nets them", () => {
    /*
     * Somebody sells on Monday and deposits on Tuesday. Netting the two would
     * print a "shortfall" for every day a deposit ran a day late.
     */
    const src = code("lib/daily-report.ts");
    expect(src).not.toMatch(/sold\.total\s*-\s*collected|collected\.total\s*-\s*sold/);
  });

  it("the drawer is cash in less cash spent, and the account likewise", () => {
    const src = code("lib/daily-report.ts");
    expect(src).toContain("cash: paisa(cashIn - cashOut)");
    expect(src).toContain("bank: paisa(bankIn - bankOut)");
  });

  it("the copy-to-message text leaves out what the company charged us", () => {
    /*
     * The text is how the report leaves the building, and it gets forwarded.
     * The buying price stays with Accounts, IT and Admin; the Excel file,
     * which only reaches those roles, carries it.
     */
    const fn = read("lib/daily-report.ts");
    const body = fn.slice(fn.indexOf("export function dailySummaryText"));
    expect(body).not.toMatch(/lifted|unitCost|cost/i);
  });

  it("an empty day says so rather than printing zeros", () => {
    // "Nothing recorded" and "a day of zeros" are different facts.
    expect(read("app/stock/day-report/page.tsx")).toContain("Nothing recorded for");
    expect(code("lib/daily-report.ts")).toContain("const empty =");
  });
});

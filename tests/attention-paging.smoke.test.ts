import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { retailerListPage } from "../lib/retailer-list";
import type { RetailerOpportunity } from "../lib/retailer-opportunities";

/**
 * The attention centres are worklists, and a worklist has to end.
 *
 * ## What was wrong
 *
 * `/rso/attention`, `/supervisor/attention` and `/manager/attention` each
 * rendered EVERY flagged retailer in scope, in one list, with nothing to search
 * or reorder. The manager's scope is every RSO under their supervisors, so that
 * list grows with the business — and it is read on a phone, in the field, by
 * the person deciding where to go next.
 *
 * It is the same shape `/retailers` had before v137, and it survived because
 * the three pages were near-identical copies: fixing one would not have fixed
 * the others, and nothing said they were the same page.
 *
 * ## The rule
 *
 * A page whose scope can span many RSOs pages its list through
 * `lib/retailer-list.ts` — the module every other retailer list already uses.
 * Not a second implementation: one definition of "page 2", one set of sort
 * orders.
 *
 * And the summary above it counts the SCOPE, never the page. "Flagged: 214"
 * over a list of 60 is useful; a summary computed from the visible rows would
 * say 60 and be a lie that looks like a fact.
 */

const ROOT = path.join(__dirname, "..");
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const ATTENTION_PAGES = [
  "app/rso/attention/page.tsx",
  "app/supervisor/attention/page.tsx",
  "app/manager/attention/page.tsx",
];
const VIEW = stripComments(read("app", "components", "RoleAttention.tsx"));

describe("every attention centre is paged", () => {
  it("routes all three roles through the shared view", () => {
    for (const p of ATTENTION_PAGES) {
      const src = stripComments(read(p));
      expect(src, p).toMatch(/RoleAttentionView/);
      // Rendering the raw list from a page is what left them unpaged: the page
      // held the array and handed all of it over.
      expect(src, p).not.toMatch(/<RoleAttentionList/);
    }
  });

  it("pages through the shared module rather than a second one", () => {
    expect(VIEW).toMatch(/retailerListPage\(/);
    expect(VIEW).toMatch(/sortOptionsFor\(true\)/);
    expect(VIEW).toMatch(/<Pager/);
  });

  it("passes the URL's paging inputs down", () => {
    // A pager that cannot read `?page=` is decoration.
    for (const p of ATTENTION_PAGES) {
      const src = stripComments(read(p));
      for (const param of ["q", "sort", "page"])
        expect(src, `${p} drops ${param}`).toMatch(new RegExp(`${param}=\\{s\\.${param}\\}`));
    }
  });

  it("gives them something to search and sort with", () => {
    expect(VIEW).toMatch(/<ServerSearchBar/);
    expect(VIEW).toMatch(/<ServerSelect/);
  });

  it("counts the scope in the summary, not the visible page", () => {
    /*
     * `list.scopeTotal` is the flagged rows across every page;
     * `list.rows.length` is at most one page of them. The second would turn a
     * summary into a description of the scroll position.
     */
    expect(VIEW).toMatch(/value: list\.scopeTotal\.toLocaleString\(\)/);
    expect(VIEW).not.toMatch(/value: list\.rows\.length/);
  });

  it("keeps the three pages thin", () => {
    // They exist to decide scope and wording. When they grow back past that,
    // the copies start drifting again — which is how this bug lasted.
    for (const p of ATTENTION_PAGES) {
      const lines = read(p).split("\n").length;
      expect(lines, `${p} is ${lines} lines — has page logic crept back in?`).toBeLessThan(60);
    }
  });
});

/**
 * The paging behaviour itself, executed rather than described.
 *
 * `retailerListPage` is already covered by tests/retailer-list.smoke.test.ts;
 * what matters here is the combination the attention centres rely on —
 * `attentionOnly` narrowing to flagged rows while the totals still describe the
 * whole scope.
 */
describe("attentionOnly paging", () => {
  const outlet = (i: number, flagged: boolean): RetailerOpportunity =>
    ({
      id: `r${i}`,
      retailerCode: `R${1000 + i}`,
      retailerName: `Retailer ${i}`,
      employeeName: "RSO 1",
      supervisor: "Dhaka North",
      route: "Route 1",
      category: "A",
      simSeller: true,
      ga: i,
      c2c: 0,
      c2s: 0,
      c2sTransactions: 0,
      ob: 0,
      ssoComplete: !flagged,
      lsoComplete: !flagged,
      priority: flagged ? 3 : 0,
      reasons: flagged ? ["SSO needs 1 GA"] : [],
    }) as unknown as RetailerOpportunity;

  // 150 flagged out of 200 in scope: more than two pages of 60.
  const all = Array.from({ length: 200 }, (_, i) => outlet(i, i < 150));

  it("shows one page while reporting the whole scope", () => {
    const p = retailerListPage(all, { attentionOnly: true });
    expect(p.rows.length).toBe(60);
    expect(p.scopeTotal).toBe(150);
    expect(p.total).toBe(150);
    expect(p.pageCount).toBe(3);
  });

  it("reaches the last flagged retailer", () => {
    // The point of paging: nothing is unreachable. The old pages rendered all
    // 150 at once, which was reachable but unusable; a cap would have been
    // neither.
    const last = retailerListPage(all, { attentionOnly: true, page: "3" });
    expect(last.rows.length).toBe(30);
    expect(last.page).toBe(3);
  });

  it("never lists an unflagged retailer", () => {
    for (let page = 1; page <= 3; page++)
      for (const r of retailerListPage(all, { attentionOnly: true, page: String(page) }).rows)
        expect(r.reasons.length, `${r.retailerCode} is not flagged`).toBeGreaterThan(0);
  });

  it("keeps the scope total when a search narrows the list", () => {
    // "Flagged: 150" must not change because someone typed in the search box —
    // the scope did not change, only what is shown.
    const p = retailerListPage(all, { attentionOnly: true, q: "R1005" });
    expect(p.scopeTotal).toBe(150);
    expect(p.total).toBeLessThan(150);
  });
});

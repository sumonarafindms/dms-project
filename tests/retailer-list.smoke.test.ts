import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  PAGE_SIZE,
  defaultSortFor,
  pageLabel,
  parsePage,
  retailerListPage,
  sortOptionsFor,
} from "../lib/retailer-list";
import type { RetailerOpportunity } from "../lib/retailer-opportunities";

/**
 * The retailer list is paged on the server.
 *
 * ## What was wrong
 *
 * About 2,500 active retailers were fetched, serialised into the page payload,
 * sent to the browser, and then rendered **at most 300**. Two costs:
 *
 *   - roughly half a megabyte on the wire to draw a twelfth of it, on every
 *     load of every one of seven pages;
 *   - and the 301st row was unreachable. The sub-line said "showing the first
 *     300" and offered no way to see more — the silent-truncation pattern the
 *     v132 audit kept finding, where output looks correct and is not the whole
 *     answer.
 *
 * ## The rule these tests hold
 *
 * Nothing is ever hidden without a way to reach it, and the count above a list
 * is always the true total.
 */

const ROOT = path.join(__dirname, "..");
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

let n = 0;
const retailer = (over: Partial<RetailerOpportunity> = {}): RetailerOpportunity =>
  ({
    id: `r${++n}`,
    retailerCode: `RC${String(n).padStart(4, "0")}`,
    retailerName: `Outlet ${n}`,
    simSeller: false,
    category: "",
    route: "",
    employeeId: "e1",
    employeeName: "Rahim",
    supervisor: "Karim",
    ga: 0,
    c2c: 0,
    c2s: 0,
    c2sTransactions: 0,
    ob: 0,
    ssoComplete: false,
    lsoComplete: false,
    reasons: [],
    priority: 0,
    ...over,
  }) as RetailerOpportunity;

const many = (count: number, over: (i: number) => Partial<RetailerOpportunity> = () => ({})) =>
  Array.from({ length: count }, (_, i) => retailer(over(i)));

describe("paging", () => {
  const rows = many(250, (i) => ({ ga: i }));

  it("returns one page and the true total", () => {
    const p = retailerListPage(rows, { page: 1 });
    expect(p.rows).toHaveLength(PAGE_SIZE);
    expect(p.total).toBe(250);
    expect(p.pageCount).toBe(Math.ceil(250 / PAGE_SIZE));
  });

  it("never hides a row — every one appears on exactly one page", () => {
    // This is the whole point. The old view showed 300 of 2,500 and the rest
    // could not be reached at all.
    const seen = new Set<string>();
    const first = retailerListPage(rows, { page: 1 });
    for (let page = 1; page <= first.pageCount; page++)
      for (const r of retailerListPage(rows, { page }).rows) {
        expect(seen.has(r.id), `${r.id} appeared twice`).toBe(false);
        seen.add(r.id);
      }
    expect(seen.size).toBe(250);
  });

  it("clamps a page past the end rather than showing nothing", () => {
    // An empty list with no explanation reads as "there are no retailers".
    const p = retailerListPage(rows, { page: 9999 });
    expect(p.page).toBe(p.pageCount);
    expect(p.rows.length).toBeGreaterThan(0);
  });

  it("treats junk as page one", () => {
    for (const junk of ["", "abc", "-3", "0", null, undefined, {}, "1e9999"]) expect(parsePage(junk)).toBe(1);
    expect(parsePage("4")).toBe(4);
    expect(parsePage("2.7")).toBe(2);
  });

  it("keeps at least one page when there is nothing to show", () => {
    const p = retailerListPage([], {});
    expect(p.pageCount).toBe(1);
    expect(p.page).toBe(1);
    expect(p.rows).toEqual([]);
  });
});

describe("search", () => {
  const rows = [
    retailer({ retailerCode: "AAA111", retailerName: "Dhaka Store" }),
    retailer({ retailerCode: "BBB222", retailerName: "Chittagong Mart", employeeName: "Salma" }),
    ...many(120),
  ];

  it("narrows the total, not just the page", () => {
    const p = retailerListPage(rows, { q: "Chittagong" });
    expect(p.total).toBe(1);
    expect(p.rows[0].retailerCode).toBe("BBB222");
  });

  it("is case-insensitive", () => {
    // matchesRetailerQuery lowercases the haystack and not the needle, so an
    // uppercase query used to match nothing. The server normalises now.
    expect(retailerListPage(rows, { q: "DHAKA" }).total).toBe(1);
    expect(retailerListPage(rows, { q: "dhaka" }).total).toBe(1);
    expect(retailerListPage(rows, { q: "  Dhaka  " }).total).toBe(1);
  });

  it("searches the RSO's name as well as the retailer's", () => {
    expect(retailerListPage(rows, { q: "Salma" }).total).toBe(1);
  });

  it("lands on the last page when a search shrinks the result", () => {
    // Searching from page 7 must not leave the user on a blank page.
    const p = retailerListPage(rows, { q: "Chittagong", page: 7 });
    expect(p.page).toBe(1);
    expect(p.rows).toHaveLength(1);
  });

  it("reports the untouched scope total separately", () => {
    // The summary strip above the list describes the whole period; narrowing to
    // one retailer must not make "Retailers: 2,431" read as 1.
    const p = retailerListPage(rows, { q: "Chittagong" });
    expect(p.scopeTotal).toBe(122);
    expect(p.total).toBe(1);
  });
});

describe("the attention view", () => {
  const rows = [
    retailer({ reasons: ["SSO pending"], priority: 1 }),
    retailer({ reasons: ["LSO pending", "No C2S"], priority: 3 }),
    retailer({ reasons: [], priority: 0 }),
  ];

  it("drops retailers with nothing open", () => {
    const p = retailerListPage(rows, { attentionOnly: true });
    expect(p.total).toBe(2);
    expect(p.scopeTotal).toBe(2);
  });

  it("leads with priority, which the directory does not offer", () => {
    expect(defaultSortFor(true)).toBe("priority-desc");
    expect(defaultSortFor(false)).not.toBe("priority-desc");
    const p = retailerListPage(rows, { attentionOnly: true });
    expect(p.rows[0].priority).toBe(3);
  });

  it("still lets the user choose another order", () => {
    // The pages used to pre-sort by priority before handing rows over, so this
    // was the only order available. It is now one choice among several.
    expect(sortOptionsFor(true).map((o) => o.value)).toContain("code-asc");
    const p = retailerListPage(rows, { attentionOnly: true, sort: "code-asc" });
    expect(p.rows.map((r) => r.retailerCode)).toEqual([...p.rows.map((r) => r.retailerCode)].sort());
  });
});

describe("sorting", () => {
  it("falls back to the default for an unknown sort key", () => {
    const p = retailerListPage(many(3), { sort: "../etc" });
    expect(p.sort).toBe(defaultSortFor(false));
  });

  it("orders by the chosen key", () => {
    const rows = [retailer({ ga: 5 }), retailer({ ga: 90 }), retailer({ ga: 40 })];
    expect(retailerListPage(rows, { sort: "ga-desc" }).rows.map((r) => r.ga)).toEqual([90, 40, 5]);
    expect(retailerListPage(rows, { sort: "ga-asc" }).rows.map((r) => r.ga)).toEqual([5, 40, 90]);
  });
});

describe("the label always tells the truth", () => {
  it("names the range and the real total", () => {
    const rows = many(250);
    expect(pageLabel(retailerListPage(rows, { page: 1 }))).toBe(`1–${PAGE_SIZE} of 250 retailers`);
    expect(pageLabel(retailerListPage(rows, { page: 2 }))).toBe(`${PAGE_SIZE + 1}–${PAGE_SIZE * 2} of 250 retailers`);
  });

  it("does not run past the total on the last page", () => {
    expect(pageLabel(retailerListPage(many(61), { page: 2 }))).toBe("61–61 of 61 retailers");
  });

  it("says so when there is nothing", () => {
    expect(pageLabel(retailerListPage([], {}))).toBe("No retailers");
  });
});

describe("nothing is silently truncated any more", () => {
  it("has no 'showing the first N' left in the retailer view", () => {
    const view = stripComments(read("app", "components", "RetailerOpportunityViews.tsx"));
    expect(view).not.toMatch(/showing the first/i);
    expect(view).not.toMatch(/MAX_CARDS/);
    // The pager is how a row past the first page is now reached.
    expect(view).toMatch(/<Pager\b/);
  });

  it("keeps the search a soft navigation, not a form submit", () => {
    // The v131 rule. Moving the search to the server is exactly the situation
    // ServerSearchBar exists for; a form here would bring back the reload.
    const view = stripComments(read("app", "components", "RetailerOpportunityViews.tsx"));
    expect(view).toMatch(/<ServerSearchBar\b/);
    expect(view).not.toMatch(/requestSubmit/);
  });

  it("pages by link, so a page can be shared and the back button works", () => {
    const kit = stripComments(read("app", "components", "Kit.tsx"));
    const pager = kit.slice(kit.indexOf("export function Pager("));
    expect(pager.slice(0, 2000)).toMatch(/<Link/);
    expect(pager.slice(0, 2000)).not.toMatch(/onClick=/);
  });
});

describe("the list module stays out of the browser bundle's way", () => {
  it("imports nothing that pulls Prisma", () => {
    // The client component needs sortOptionsFor for its dropdown. A value
    // import from a Prisma-touching module is how 50KB of Prisma's browser stub
    // reached the bundle in v134.
    const src = read("lib", "retailer-list.ts");
    expect(src).not.toMatch(/@prisma\/client/);
    expect(src).not.toMatch(/from "\.\/prisma"/);
    // The row type is imported, but as a type, which the compiler erases.
    expect(src).toMatch(/import type \{ RetailerOpportunity \}/);
  });
});

describe("every retailer page pages its list", () => {
  const PAGES = [
    "app/admin/retailers/page.tsx",
    "app/accounts/retailers/page.tsx",
    "app/rso/retailers/page.tsx",
    "app/supervisor/retailers/page.tsx",
    "app/admin/attention/page.tsx",
    "app/accounts/attention/page.tsx",
    "app/admin/performance/retailers/page.tsx",
  ];

  it("routes all seven through retailerListPage", () => {
    for (const file of PAGES) expect(stripComments(read(file)), file).toMatch(/retailerListPage\(/);
  });

  it("passes the page number through from the URL", () => {
    for (const file of PAGES) expect(stripComments(read(file)), file).toMatch(/page:\s*s\.page/);
  });

  it("no longer hands the whole result set to the view", () => {
    for (const file of PAGES) expect(stripComments(read(file)), file).not.toMatch(/<RetailerSearchView\s+rows=/);
  });
});

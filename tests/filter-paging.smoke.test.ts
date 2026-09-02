import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Changing what a list shows must send you back to page 1.
 *
 * ## The bug, reported as "the sort doesn't work"
 *
 * It always worked. The retailer list is server-paged at 60 rows, so ~2,500
 * retailers is 42 pages — and picking "GA — high to low" from page 20 kept
 * `page=20` in the URL. The screen filled with rows 1141-1200 of the new
 * order: middling numbers under a heading that said "sorted by GA — high to
 * low". There is no way to tell that apart from a dead dropdown, and the top of
 * an ordering is the entire reason anyone picks one.
 *
 * The search had the same fault with a second twist: narrowing 2,500 rows to
 * 300 while on page 20 asked for page 20 of five, and the server clamps rather
 * than erroring — so a search that DID find something showed its last page.
 *
 * And the date range was worse than either. `DateRangeFields` is a native GET
 * form, and a GET submit REPLACES the query string with the form's own fields,
 * so applying dates silently discarded the sort and the search along with the
 * page.
 *
 * ## The rule
 *
 * Every control that changes which rows appear, or in what order, drops `page`;
 * and no control may drop the others.
 */

const ROOT = path.join(__dirname, "..");
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const BAR = stripComments(read("app", "components", "ServerSearchBar.tsx"));
const LIST = stripComments(read("app", "components", "ListControls.tsx"));

/** The body of a named function/handler, by brace depth. */
function block(src: string, from: number): string {
  const open = src.indexOf("{", from);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
  }
  return "";
}

describe("the server-paged search bar", () => {
  const push = block(BAR, BAR.indexOf("function push("));

  it("was found", () => {
    expect(push.length, "could not isolate push() — this test would check nothing").toBeGreaterThan(80);
  });

  it("resets the page when the query changes", () => {
    expect(push).toMatch(/search\.delete\("page"\)/);
  });

  it("still writes the query itself", () => {
    // Guards against the test above passing on a gutted function.
    expect(push).toMatch(/search\.set\(paramName/);
    expect(push).toMatch(/router\.replace/);
  });
});

describe("the sort dropdown", () => {
  const onChange = block(BAR, BAR.indexOf("onChange={(e) =>", BAR.indexOf("ServerSelect")));

  it("was found", () => {
    expect(onChange.length, "could not isolate the ServerSelect handler").toBeGreaterThan(80);
  });

  it("resets the page when the order changes", () => {
    expect(onChange).toMatch(/search\.delete\("page"\)/);
  });

  it("keeps every other parameter", () => {
    // Built from the current params, not from scratch — otherwise picking a
    // sort would drop the search and the date range.
    expect(onChange).toMatch(/new URLSearchParams\(params\.toString\(\)\)/);
  });
});

describe("the date range form", () => {
  it("re-emits the rest of the URL as hidden fields", () => {
    // A native GET submit replaces the whole query string. Anything not
    // re-emitted here is silently lost.
    expect(LIST).toMatch(/const carried = Array\.from\(params\.entries\(\)\)/);
    expect(LIST).toMatch(/type="hidden"/);
  });

  it("drops the page and keeps the sort and the search", () => {
    const line = LIST.split("\n").find((l) => l.includes("const carried")) ?? "";
    expect(line, "the filter list was not found on one line").toContain("filter");
    expect(line).toMatch(/"page"/);
    expect(line).toMatch(/"from"/);
    expect(line).toMatch(/"to"/);
    // Excluding sort or q would reintroduce the worst half of the bug.
    expect(line).not.toMatch(/"sort"/);
    expect(line).not.toMatch(/"q"/);
  });
});

describe("an entry-point redirect keeps its query", () => {
  const perf = stripComments(read("app", "admin", "performance", "page.tsx"));

  it("forwards the selected period rather than dropping it", () => {
    // It was a bare redirect("/admin/performance/rsos"), so any link carrying
    // ?month= landed on the current month instead.
    expect(perf).toMatch(/searchParams/);
    expect(perf).toMatch(/redirect\(`\/admin\/performance\/rsos\$\{/);
    expect(perf).not.toMatch(/redirect\("\/admin\/performance\/rsos"\)/);
  });
});

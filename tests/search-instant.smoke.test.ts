import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Every search box must answer while the user types.
 *
 * This has now been reported twice, because "instant search" was done page by
 * page and two surfaces were missed each time. The failure is invisible to
 * every other check: the page renders, the search works, it is merely slow and
 * jarring — so it survives review and gets found by whoever uses the product.
 *
 * Hence a rule, asserted against the source:
 *
 *   A search input must never sit inside a form that submits.
 *
 * `LiveFilterForm` called `form.requestSubmit()` a few hundred milliseconds
 * after each keystroke. A native form submit is a real browser navigation: the
 * document reloads, the input is destroyed and rebuilt, and the caret is lost.
 * That is the "type, watch the page reload, then see results" behaviour.
 *
 * The two legitimate patterns are:
 *
 * - **Client filtering** (`ListControls`, `EntityGrid`, `SimActivationList`,
 *   or a plain controlled input) for rows already fetched — no request at all.
 * - **Soft navigation** (`ServerSearchBar`) when the server must narrow a set
 *   too large to ship, as on the Activity Log — `router.replace` inside a
 *   transition, so nothing unmounts and focus survives.
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

const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
const rel = (f: string) => path.relative(path.join(__dirname, ".."), f);

/** An input that a person types a query into. */
const SEARCH_INPUT = /<input[^>]*(name="q"|type="search"|placeholder=\{?["`]?Search|aria-label=\{?["`]?Search)/i;

/**
 * The regions of a file that are inside a <form>…</form>.
 *
 * Co-occurrence is not enough: ListControls contains BOTH a search input and a
 * form, and that is correct — the search is client state and the form is the
 * date range, which should navigate. An earlier version of this test flagged
 * it, which is how this function came to exist. What matters is whether the
 * search input is nested INSIDE the form.
 */
function formRegions(src: string): string[] {
  const out: string[] = [];
  let i = 0;
  for (;;) {
    const open = src.indexOf("<form", i);
    if (open === -1) break;
    const close = src.indexOf("</form>", open);
    if (close === -1) {
      out.push(src.slice(open));
      break;
    }
    out.push(src.slice(open, close));
    i = close + 7;
  }
  return out;
}

/** A component that auto-submits its form is a navigation per keystroke. */
const AUTO_SUBMITS = /requestSubmit\s*\(/;

describe("search is never a page reload", () => {
  const files = tsxFiles().map((file) => ({ file, src: stripComments(fs.readFileSync(file, "utf8")) }));

  it("finds the search surfaces it is meant to police", () => {
    // Guards against this suite passing because the pattern stopped matching.
    const withSearch = files.filter(({ src }) => SEARCH_INPUT.test(src));
    expect(withSearch.length).toBeGreaterThanOrEqual(4);
  });

  it("has no search input nested inside a form", () => {
    const offenders = files
      .filter(({ src }) => formRegions(src).some((region) => SEARCH_INPUT.test(region)))
      .map(({ file }) => rel(file));
    expect(offenders, "a search input inside a form reloads the page on every keystroke").toEqual([]);
  });

  it("has no component that auto-submits a form containing a search input", () => {
    const offenders = files
      .filter(({ src }) => AUTO_SUBMITS.test(src) && SEARCH_INPUT.test(src))
      .map(({ file }) => rel(file));
    expect(offenders).toEqual([]);
  });

  it("keeps LiveFilterForm away from search entirely", () => {
    // It still drives the date range, which SHOULD navigate — a date change
    // selects a different dataset. It must never wrap a search box again.
    const users = files.filter(({ src }) => /LiveFilterForm/.test(src) && !/ServerSearchBar/.test(src));
    for (const { file, src } of users)
      expect(SEARCH_INPUT.test(src), `${rel(file)} puts a search box in LiveFilterForm`).toBe(false);
  });

  it("navigates softly wherever the server has to do the searching", () => {
    const bar = fs.readFileSync(path.join(APP, "components", "ServerSearchBar.tsx"), "utf8");
    const code = stripComments(bar);
    // replace, not push: one history entry per keystroke would make the back
    // button useless.
    expect(code).toMatch(/router\.replace\(/);
    expect(code).not.toMatch(/router\.push\(/);
    // Inside a transition and without scrolling, so the page stays put.
    expect(code).toMatch(/startTransition\(/);
    expect(code).toMatch(/scroll:\s*false/);
    // A controlled input, so React owns it and it never unmounts mid-typing.
    expect(code).toMatch(/value=\{value\}/);
    expect(code).not.toMatch(/<form\b/);
  });

  it("debounces rather than querying on every character", () => {
    const code = stripComments(fs.readFileSync(path.join(APP, "components", "ServerSearchBar.tsx"), "utf8"));
    expect(code).toMatch(/setTimeout\(/);
    expect(code).toMatch(/clearTimeout\(/);
  });
});

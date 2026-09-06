import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { rel as relativeTo } from "./paths";
import { EXPECTED, PUBLIC } from "./route-map";

/**
 * The canonical route map, as a test rather than a document.
 *
 * A markdown table of "which role can reach which page" is out of date the
 * first time someone adds a page. This asserts the same thing against the
 * source, so a new page that forgets its guard, or a guard that quietly
 * widens, fails here instead of in production.
 *
 * A page's guard comes from its own `requireUser` / `requirePagePermission`
 * call or from the nearest ancestor layout that has one — both are read,
 * because the project uses both.
 */

const APP = path.join(__dirname, "..", "app");
const ROLE_RE = /require(?:User|PagePermission)\(\s*\[([^\]]*)\]/;

function guardOf(file: string): string[] | null {
  if (!fs.existsSync(file)) return null;
  const m = ROLE_RE.exec(fs.readFileSync(file, "utf8"));
  if (!m) return null;
  return m[1]
    .split(",")
    .map((r) => r.trim().replace(/['"]/g, ""))
    .filter(Boolean)
    .sort();
}

function pageFiles(dir = APP, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) pageFiles(full, acc);
    else if (e.name === "page.tsx") acc.push(full);
  }
  return acc;
}

function routeOf(file: string) {
  const rel = relativeTo(APP)(path.dirname(file));
  return rel === "" ? "/" : `/${rel}`;
}

/** Effective guard: the page's own, else the nearest guarding ancestor layout. */
function effectiveGuard(file: string): string[] | null {
  const own = guardOf(file);
  if (own) return own;
  let dir = path.dirname(file);
  for (;;) {
    const g = guardOf(path.join(dir, "layout.tsx"));
    if (g) return g;
    if (path.resolve(dir) === path.resolve(APP)) return null;
    dir = path.dirname(dir);
  }
}

describe("route guards", () => {
  const files = pageFiles();

  it("finds every page route", () => {
    expect(files.length).toBe(Object.keys(EXPECTED).length);
  });

  it("guards every page that is not deliberately public", () => {
    const unguarded = files.filter((f) => !effectiveGuard(f) && !PUBLIC.has(routeOf(f))).map(routeOf);
    // A new page under an unguarded tree is the realistic way this breaks:
    // /it/reports had no layout guard until v125 and relied on 12 individual
    // calls all staying correct.
    expect(unguarded).toEqual([]);
  });

  it("matches the canonical role map exactly", () => {
    for (const f of files) {
      const route = routeOf(f);
      const want = EXPECTED[route];
      expect(want, `route ${route} is not in the canonical map — add it deliberately`).toBeDefined();
      const got = effectiveGuard(f);
      if (want === "PUBLIC") expect(got, `${route} should be public`).toBeNull();
      else expect(got, `${route} guard changed`).toEqual(want);
    }
  });

  it("has no route in the map that no longer exists", () => {
    const actual = new Set(files.map(routeOf));
    const stale = Object.keys(EXPECTED).filter((r) => !actual.has(r));
    expect(stale).toEqual([]);
  });

  it("keeps every public route genuinely public", () => {
    for (const r of PUBLIC) expect(EXPECTED[r]).toBe("PUBLIC");
  });
});

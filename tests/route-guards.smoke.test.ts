import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

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
  const rel = path.relative(APP, path.dirname(file)).split(path.sep).join("/");
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

/**
 * Reachable without a session, deliberately. Adding to this list is a
 * security decision and should be argued for in review, which is the point of
 * making it an explicit constant rather than an absence.
 */
const PUBLIC = new Set(["/", "/login", "/sacool", "/setup"]);

/** Route -> the roles that may load it. Generated from the source, then frozen. */
const EXPECTED: Record<string, string[] | "PUBLIC"> = {
  "/": "PUBLIC",
  "/accounts": ["ACCOUNTS"],
  "/accounts/attention": ["ACCOUNTS"],
  "/accounts/operations": ["ACCOUNTS"],
  "/accounts/operations/c2c": ["ACCOUNTS"],
  "/accounts/operations/c2s": ["ACCOUNTS"],
  "/accounts/operations/ga": ["ACCOUNTS"],
  "/accounts/operations/ob": ["ACCOUNTS"],
  "/accounts/operations/targets": ["ACCOUNTS"],
  "/accounts/people": ["ACCOUNTS"],
  "/accounts/retailers": ["ACCOUNTS"],
  "/accounts/retailers/[id]": ["ACCOUNTS"],
  "/admin/attention": ["ADMIN", "IT"],
  "/admin/audit": ["ADMIN", "IT"],
  "/admin/bp-management": ["ADMIN", "IT"],
  "/admin/employees": ["ADMIN", "IT"],
  "/admin/employees/bps": ["ADMIN", "IT"],
  "/admin/employees/bps/[id]": ["ADMIN", "IT"],
  "/admin/employees/bps/new": ["ADMIN", "IT"],
  "/admin/employees/managers": ["ADMIN", "IT"],
  "/admin/employees/managers/[id]": ["ADMIN", "IT"],
  "/admin/employees/managers/new": ["ADMIN", "IT"],
  "/admin/employees/rsos": ["ADMIN", "IT"],
  "/admin/employees/rsos/[id]": ["ADMIN", "IT"],
  "/admin/employees/rsos/new": ["ADMIN", "IT"],
  "/admin/employees/supervisors": ["ADMIN", "IT"],
  "/admin/employees/supervisors/[id]": ["ADMIN", "IT"],
  "/admin/employees/supervisors/new": ["ADMIN", "IT"],
  "/admin/performance": ["ADMIN", "IT"],
  "/admin/performance/bps": ["ADMIN", "IT"],
  "/admin/performance/bps/[id]": ["ADMIN", "IT"],
  "/admin/performance/retailers": ["ADMIN", "IT"],
  "/admin/performance/rsos": ["ADMIN", "IT"],
  "/admin/performance/supervisors": ["ADMIN", "IT"],
  "/admin/performance/supervisors/[id]": ["ADMIN", "IT"],
  "/admin/permissions": ["ADMIN", "IT"],
  "/admin/permissions/[id]": ["ADMIN", "IT"],
  "/admin/retailers": ["ADMIN", "IT"],
  "/admin/retailers/[id]": ["ADMIN", "IT"],
  "/admin/rsos/[id]": ["ADMIN", "IT"],
  "/admin/upload": ["ADMIN", "IT"],
  "/admin/upload/retailers": ["ADMIN", "IT"],
  "/admin/users": ["ADMIN", "IT"],
  "/bp": ["BP"],
  "/bp/sales": ["BP"],
  "/c2c": ["ADMIN", "IT"],
  "/c2s": ["ADMIN", "IT"],
  "/dashboard": ["ADMIN", "IT"],
  "/ga": ["ADMIN", "IT"],
  "/it/readiness": ["ADMIN", "IT"],
  "/it/reports": ["ADMIN", "IT"],
  "/it/reports/activation": ["ADMIN", "IT"],
  "/it/reports/c2c": ["ADMIN", "IT"],
  "/it/reports/c2s": ["ADMIN", "IT"],
  "/it/reports/custom": ["ADMIN", "IT"],
  "/it/reports/daily": ["ADMIN", "IT"],
  "/it/reports/low-c2s": ["ADMIN", "IT"],
  "/it/reports/lso": ["ADMIN", "IT"],
  "/it/reports/ob": ["ADMIN", "IT"],
  "/it/reports/performance/[kind]": ["ADMIN", "IT"],
  "/it/reports/sso": ["ADMIN", "IT"],
  "/it/reports/target": ["ADMIN", "IT"],
  "/login": "PUBLIC",
  "/manager": ["MANAGER"],
  "/manager/attention": ["MANAGER"],
  "/manager/bp-activations": ["MANAGER"],
  "/manager/bp-activations/[id]": ["MANAGER"],
  "/manager/retailers/[id]": ["MANAGER"],
  "/manager/rsos": ["MANAGER"],
  "/manager/rsos/[id]": ["MANAGER"],
  "/manager/supervisors": ["MANAGER"],
  "/manager/supervisors/[id]": ["MANAGER"],
  "/master-data": ["ADMIN", "IT"],
  "/ob": ["ADMIN", "IT"],
  "/rso": ["RSO"],
  "/rso/attention": ["RSO"],
  "/rso/bp": ["RSO"],
  "/rso/bp/activations": ["RSO"],
  "/rso/bp/activations/[id]": ["RSO"],
  "/rso/lso": ["RSO"],
  "/rso/retailers": ["RSO"],
  "/rso/retailers/[id]": ["RSO"],
  "/rso/sso": ["RSO"],
  "/sacool": "PUBLIC",
  "/setup": "PUBLIC",
  "/supervisor": ["SUPERVISOR"],
  "/supervisor/attention": ["SUPERVISOR"],
  "/supervisor/bp-activations": ["SUPERVISOR"],
  "/supervisor/bp-activations/[id]": ["SUPERVISOR"],
  "/supervisor/retailers": ["SUPERVISOR"],
  "/supervisor/retailers/[id]": ["SUPERVISOR"],
  "/supervisor/rsos": ["SUPERVISOR"],
  "/supervisor/rsos/[id]": ["SUPERVISOR"],
  "/targets": ["ADMIN", "IT"],
  "/ui-preview": ["ADMIN", "IT"],
};

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

/**
 * A permission a role holds must open a door that exists.
 *
 * ## The bug
 *
 * `roleDefaults.MANAGER` has granted `retailers: { view: true }` since the
 * permissions were first written. There was no `/manager/retailers` page and no
 * "Retailers" entry in the manager's navigation. The permission was real, the
 * screen was not, and three things followed:
 *
 *   - A manager could not list the outlets they are responsible for at all.
 *   - `/manager/attention` links every row to `/manager/retailers/{id}` — the
 *     DETAIL page, which does exist — so the rows worked while the list behind
 *     them did not.
 *   - With no list to return to, `/manager/retailers/[id]` sent its back button
 *     to `/manager/rsos/{employeeId}`, a different screen about a different
 *     thing. Working a two-hundred row attention queue on a phone meant being
 *     thrown onto some RSO's performance page after every tap.
 *
 * Nothing errored, no test failed, and the role that exists to work the queue
 * could not work it. The RSO and the supervisor both had the page, which is
 * what makes this an omission rather than a decision.
 *
 * So the rule is checked directly: for every role, every module it may VIEW has
 * a navigation entry, or is on a list that says in writing why it does not.
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { roleDefaults, permissionModules } from "../lib/permissions";
import type { PermissionModule } from "../lib/permissions";

const ROOT = path.join(__dirname, "..");
const SHELL = fs.readFileSync(path.join(ROOT, "app", "components", "AppShell.tsx"), "utf8");

/**
 * Modules a role may view that deliberately have no menu entry of their own.
 *
 * Every line is a reason, not an exemption: a module lands here only when the
 * screen is genuinely reached another way. Anything that cannot be reached at
 * all belongs in the failure list, not here.
 */
const NO_MENU_ENTRY: Record<string, Partial<Record<PermissionModule, string>>> = {
  MANAGER: { employees: "reached as Supervisors and RSOs, which are the manager's two employee levels" },
  SUPERVISOR: {
    employees: "reached as My RSOs",
    performance: "My RSOs IS the performance list; each row opens that RSO's figures",
  },
  /*
   * v197: the Operations workspace is gone — uploading is IT's job — and with
   * it every exemption that pointed there. Accounts no longer holds those
   * modules, and this test's own check below would call the old lines dead.
   */
  ACCOUNTS: {
    employees: "reached as RSO & BP",
  },
  RSO: { bp: "reached as My BP" },
  BP: {
    ga: "the BP's own activations are its home screen and its Sales page",
    bp: "the BP IS the partner; there is no list of others to show them",
  },
  /*
   * ADMIN and IT are absent on purpose: they are not in `roleDefaults` — their
   * access is granted wholesale elsewhere — so there is nothing here to exempt
   * and a line for them would be dead text. `MENU_ROLES` leaves them out for
   * the same reason.
   */
};

/** The nav block for one role: from its home entry to the end of that array. */
function navFor(role: string): string {
  const home = role === "ACCOUNTS" ? "/accounts" : `/${role.toLowerCase()}`;
  const at = SHELL.indexOf(`href: "${home}",`);
  if (at < 0) return "";
  const end = SHELL.indexOf("]", at);
  return SHELL.slice(at, end < 0 ? at + 1200 : end);
}

/** Roles whose menu is built as a named list in AppShell. */
const MENU_ROLES = ["MANAGER", "SUPERVISOR", "RSO", "BP", "ACCOUNTS"];

describe("a viewable module is a reachable screen", () => {
  it("is reading a real navigation block for every role it checks", () => {
    // A sweep that found no menu would pass by matching nothing at all.
    for (const role of MENU_ROLES) {
      const nav = navFor(role);
      expect(nav.length, `no navigation block found for ${role}`).toBeGreaterThan(80);
      expect(nav, `${role}'s block has no module entries`).toMatch(/module: "/);
    }
  });

  it("gives every viewable module a menu entry, or a written reason", () => {
    const missing: string[] = [];
    for (const role of MENU_ROLES) {
      const nav = navFor(role);
      for (const { key } of permissionModules) {
        if (!roleDefaults[role]?.[key]?.view) continue;
        if (NO_MENU_ENTRY[role]?.[key]) continue;
        if (!nav.includes(`module: "${key}"`)) missing.push(`${role} may view "${key}" and has no way to open it`);
      }
    }
    expect(missing, `a granted permission with no screen behind it:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  it("every exemption names a module the role can actually view", () => {
    /*
     * The list above is how a real gap could be hidden, so it is checked back
     * against the permissions: an exemption for a module a role cannot view is
     * dead text that would silently cover a future grant.
     */
    const stale: string[] = [];
    for (const [role, mods] of Object.entries(NO_MENU_ENTRY))
      for (const key of Object.keys(mods) as PermissionModule[])
        if (!roleDefaults[role]?.[key]?.view) stale.push(`${role}/${key}`);
    expect(stale, `exemptions for permissions these roles do not hold: ${stale.join(", ")}`).toEqual([]);
  });
});

describe("the manager can work the attention queue", () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");

  it("has the list page its attention rows link into", () => {
    const base = read("app", "manager", "attention", "page.tsx").match(/base="([^"]+)"/)?.[1];
    expect(base).toBe("/manager/retailers");
    expect(
      fs.existsSync(path.join(ROOT, "app", "manager", "retailers", "page.tsx")),
      "attention rows link to /manager/retailers and no such list page exists",
    ).toBe(true);
  });

  it("sends a retailer's back button to the list, like the other two roles", () => {
    /*
     * The asymmetry is the tell: RSO and SUPERVISOR both return to their own
     * retailer list. The manager returned to an RSO's performance page.
     */
    for (const role of ["rso", "supervisor", "manager"]) {
      const src = read("app", role, "retailers", "[id]", "page.tsx");
      /*
       * Matched up to the first `${`, not to a closing backtick: every one of
       * these hrefs interpolates the month and the optional date range, so the
       * literal contains nested backticks and `[^`]+` stops inside it. What is
       * being asserted is where the link POINTS, which is the part before the
       * first substitution.
       */
      const back = src.match(/backHref=\{`([^`$]+)/)?.[1];
      expect(back, `${role}'s retailer detail has no back link`).toBeTruthy();
      expect(back, `${role} goes back to ${back} instead of its retailer list`).toMatch(
        new RegExp(`^/${role}/retailers\\?`),
      );
    }
  });

  it("scopes the list to the manager's own teams", () => {
    // A manager seeing every retailer in the company would be a permissions
    // bug wearing a list.
    const src = read("app", "manager", "retailers", "page.tsx");
    expect(src).toContain("managerScope(u.id)");
    expect(src).toMatch(/requirePagePermission\(\["MANAGER"\], "retailers"\)/);

    /*
     * The CALL, not the mention.
     *
     * The first version of this asserted that the file contained the string
     * "scope.employeeIds" — and it does, twice: once in the empty-scope check
     * and once in the query. Replacing the query's argument with `undefined`,
     * which makes `retailerOpportunities` return every retailer in the
     * company, left the other mention in place and the guard passed. Caught by
     * mutating it. A scope guard that can be satisfied by an `if` statement is
     * not a scope guard.
     */
    const call = src.match(/retailerOpportunities\(([^)]*)\)/)?.[1];
    expect(call, "no retailerOpportunities call found — has the page been rewritten?").toBeTruthy();
    const scopeArg = call!.split(",")[1]?.trim();
    expect(scopeArg, `the manager list is scoped by \`${scopeArg}\`, which is not their teams`).toBe(
      "scope.employeeIds",
    );
  });

  it("scopes the supervisor's list to their own team", () => {
    const src = read("app", "supervisor", "retailers", "page.tsx");
    const call = src.match(/retailerOpportunities\(([^)]*)\)/)?.[1];
    expect(call!.split(",")[1]?.trim()).toBe("ids");
  });

  it("says what an empty scope means rather than showing a strip of zeros", () => {
    for (const role of ["manager", "supervisor"]) {
      const src = read("app", role, "retailers", "page.tsx");
      expect(src, `${role}'s retailer list has no empty-scope notice`).toContain("<PageNotice");
    }
  });
});

describe("the RSO home says which accounting each figure uses", () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
  const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const HOME = code(read("app", "rso", "page.tsx"));

  it("reconciles the target cards with the BP share held aside", () => {
    /*
     * Measured on real data: the KPI card read SSO 48 while the pill below it
     * read 49, and the GA card read 470 for an RSO the territory credits with
     * 485. Both accountings are correct and neither was named.
     */
    expect(HOME).toContain("bpShareNote(r.bp)");
  });

  it("does not label an outlet count with the same word as a target card", () => {
    // "SSO Complete" beside a KPI card labelled "SSO" is two numbers wearing
    // one word. The pills count outlets and now say so.
    expect(HOME).not.toMatch(/label="SSO Complete"/);
    expect(HOME).not.toMatch(/label="LSO Complete"/);
    expect(HOME).toMatch(/label="Outlets at SSO"/);
    expect(HOME).toMatch(/label="Outlets at LSO"/);
  });

  it("warns that the quick-status counts include BP-held outlets", () => {
    const quick = HOME.slice(HOME.indexOf('title="Quick status"'), HOME.indexOf('title="Quick status"') + 420);
    expect(quick).toMatch(/OUTLETS/);
  });

  it("does not call an RSO's outlet base a team", () => {
    // Borrowed from the supervisor's page. An RSO has no team.
    expect(HOME).not.toMatch(/title="Team snapshot"/);
  });
});

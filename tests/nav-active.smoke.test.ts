/**
 * One click, one lit menu item — and no page without a way in.
 *
 * Two owner reports, both the same shape: the menu said something that was
 * not true about where you are or what you can do.
 *
 *   *"akta click korle 2ta menu select hoye thake"* — on /stock/daily both
 *   "Stock & Cash" and "Daily Entry" were highlighted, because the menu
 *   matched by URL prefix without asking whether a more specific item existed.
 *
 *   *"Accounts a dekhlam product add korar kono option nai"* — the Products
 *   page had existed since v192 with no menu entry, so for Accounts there was
 *   no way to add a product. Daily Entry had the same gap until v195.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { active, activeAmong } from "../lib/bottom-nav";
import { EXPECTED } from "./route-map";

const shell = readFileSync(join(process.cwd(), "app/components/AppShell.tsx"), "utf8");

const ACCOUNTS_MENU = [
  "/accounts",
  "/stock/daily",
  "/stock",
  "/stock/day-report",
  "/live-ga",
  "/accounts/people",
  "/accounts/retailers",
  "/support",
  "/stock/lifting",
  "/stock/profit",
  "/stock/products",
];

describe("exactly one item is current", () => {
  const isActive = activeAmong(ACCOUNTS_MENU);
  const lit = (path: string) => ACCOUNTS_MENU.filter((h) => isActive(path, h));

  it("the owner's case: Daily Entry alone, not Stock & Cash beside it", () => {
    expect(active("/stock/daily", "/stock")).toBe(true); // the old rule matched both…
    expect(lit("/stock/daily")).toEqual(["/stock/daily"]); // …the new one picks one.
  });

  it("every stock page lights its own item and only its own", () => {
    for (const p of ["/stock", "/stock/day-report", "/stock/lifting", "/stock/profit", "/stock/products"])
      expect(lit(p), p).toEqual([p]);
  });

  it("the older pairs with the same shape are fixed too", () => {
    // Sim Support and a page beneath it (v190's shape); Operations + SC &
    // Targets had it too until v197 removed both from this menu.
    const withCodes = activeAmong(["/support", "/support/codes"]);
    expect(withCodes("/support/codes", "/support")).toBe(false);
    expect(withCodes("/support/codes", "/support/codes")).toBe(true);
    expect(lit("/accounts/retailers/abc")).toEqual(["/accounts/retailers"]);
  });

  it("a page with no entry of its own lights its parent", () => {
    // A ledger has no menu item; Stock & Cash is the parent a person expects.
    expect(lit("/stock/RSO/abc123")).toEqual(["/stock"]);
  });

  it("a home entry is exact, never a prefix", () => {
    expect(lit("/accounts")).toEqual(["/accounts"]);
    expect(lit("/accounts/people")).toEqual(["/accounts/people"]);
  });

  it("a hidden specific item lets its parent light", () => {
    // If a role cannot see /stock/daily, being on a child of /stock lights /stock.
    const withoutDaily = activeAmong(["/stock", "/stock/profit"]);
    expect(withoutDaily("/stock/daily", "/stock")).toBe(true);
  });

  it("every consumer in the shell takes the one rule", () => {
    // Sidebar, bottom bar, More sheet and admin groups — no raw prefix checks left.
    const rendered = shell.slice(shell.indexOf("export default function AppShell"));
    const raw = rendered.match(/[^.\w]active\(path/g) || [];
    // Only currentLabel may still call it, and it already picks the most specific.
    expect(raw.length).toBeLessThanOrEqual(1);
    expect(rendered).toContain("const isActive = activeAmong(visibleNav.map((i) => i.href));");
    expect(rendered).toContain("bottomSlots(visibleBottom, path, isActive)");
  });
});

describe("every page Accounts can open has a way in", () => {
  it("each /stock page Accounts may reach is in its menu", () => {
    const start = shell.indexOf("  accounts: {");
    const menu = shell.slice(start, shell.indexOf("\n    ],", start));
    const reachable = Object.entries(EXPECTED)
      .filter(([r, roles]) => r.startsWith("/stock") && !r.includes("[") && roles !== "PUBLIC")
      .filter(([, roles]) => (roles as string[]).includes("ACCOUNTS"))
      .map(([r]) => r);
    expect(reachable.length).toBeGreaterThan(5);
    for (const r of reachable) expect(menu, `${r} has no Accounts menu entry`).toContain(`href: "${r}"`);
  });
});

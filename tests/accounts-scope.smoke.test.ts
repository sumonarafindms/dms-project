/**
 * What Accounts is for — and, as of v197, what it is not.
 *
 * The owner: *"file ja upload korbe IT, Account ar kaj holo stock updated
 * kora.. sob thik moto hoce naki check kora and taka management thik moto
 * rakha"*. Operations, Opportunity, SC & Targets and Campaigns were removed
 * from the role.
 *
 * Checked at three layers, because each alone is a claim the others could
 * contradict: the menu, the pages, and the APIs. A hidden menu over an open
 * endpoint is an upload button with the label peeled off.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { roleDefaults } from "../lib/permissions";
import { EXPECTED } from "./route-map";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const shell = read("app/components/AppShell.tsx");
const menu = shell.slice(shell.indexOf("  accounts: {"), shell.indexOf("\n    ],", shell.indexOf("  accounts: {")));

describe("Accounts does not upload, set targets, chase opportunities or read campaigns", () => {
  it("none of the four is in its menu", () => {
    for (const href of ["/accounts/operations", "/accounts/attention", "/accounts/operations/targets", "/campaigns"])
      expect(menu, `${href} is back in the Accounts menu`).not.toContain(`href: "${href}"`);
  });

  it("the pages are gone, not merely hidden", () => {
    for (const p of ["app/accounts/operations", "app/accounts/attention"])
      expect(existsSync(join(process.cwd(), p)), `${p} still exists`).toBe(false);
  });

  it("no route admits Accounts to an upload, a target or a campaign", () => {
    for (const [route, roles] of Object.entries(EXPECTED)) {
      if (roles === "PUBLIC") continue;
      if (!/^\/(ga|c2c|c2s|ob|targets|campaigns|admin\/upload)(\/|$)/.test(route)) continue;
      expect(roles as string[], `${route} admits ACCOUNTS`).not.toContain("ACCOUNTS");
    }
  });

  it("every upload and target API refuses the role outright", () => {
    for (const f of [
      "app/api/import/[type]/route.ts",
      "app/api/ga/summary/route.ts",
      "app/api/c2c/summary/route.ts",
      "app/api/c2s/summary/route.ts",
      "app/api/ob/summary/route.ts",
      "app/api/samples/[type]/route.ts",
      "app/api/targets/route.ts",
      "app/api/targets/import/route.ts",
    ]) {
      // The role list itself, so a custom permission row cannot reopen it.
      expect(read(f), `${f} admits ACCOUNTS`).not.toMatch(/apiUser\(\[[^\]]*"ACCOUNTS"/);
    }
  });

  it("the role holds none of those permissions by default", () => {
    const acc = roleDefaults.ACCOUNTS;
    for (const m of ["ga", "c2c", "c2s", "ob", "targets", "attention", "campaigns"] as const)
      expect(acc[m]?.view ?? false, `ACCOUNTS still views ${m}`).toBe(false);
  });
});

describe("what Accounts is for is all in reach", () => {
  it("Daily Entry is the first thing after Overview", () => {
    const hrefs = [...menu.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.slice(0, 2)).toEqual(["/accounts", "/stock/daily"]);
  });

  it("stock, cash, lifting, expenses and products are all in the menu", () => {
    for (const href of ["/stock", "/stock/lifting", "/stock/expenses", "/stock/products", "/stock/day-report"])
      expect(menu, `${href} missing from the Accounts menu`).toContain(`href: "${href}"`);
  });

  it("the home page no longer links anywhere Accounts cannot go", () => {
    const home = read("app/accounts/page.tsx");
    expect(home).not.toMatch(/accounts\/operations|accounts\/attention|dailyFeedItems|importBatch/);
  });
});

describe("a form never carries one person's numbers to the next", () => {
  /*
   * v197, found by walking an Accounts day through the real forms: the Daily
   * Entry form kept its state when the person or date changed, so RSO 48's 37
   * SIMs were still in the boxes after switching to RSO 47 — and Save would
   * have charged RSO 47 for them. It had been true since v192. The fix is a
   * key of person + date; this keeps it from being tidied away.
   */
  it("Daily Entry is keyed by person and day", () => {
    expect(read("app/stock/daily/page.tsx")).toMatch(/<StockDayEntry\s+key=\{`\$\{key\}\|\$\{date\}`\}/);
  });

  it("Opening Balance is keyed by person and date", () => {
    expect(read("app/stock/opening/page.tsx")).toMatch(
      /<StockOpeningForm\s+key=\{`\$\{holderKey\(holder\.type, holder\.id\)\}\|\$\{asOf\}`\}/,
    );
  });
});

describe("the godown and Daily Entry work as one system", () => {
  it("the Give tab knows what the godown holds", () => {
    const page = read("app/stock/daily/page.tsx");
    expect(page).toContain("godown={godownBefore}");
    // Added back so re-opening a saved day does not count its stock twice.
    expect(page).toContain("l.inGodown + (entry.given[l.product.id] || 0) - (entry.returned[l.product.id] || 0)");
  });

  it("a product never lifted gets no godown figure, not a false zero", () => {
    expect(read("app/stock/daily/page.tsx")).toContain("if (l.liftedQty > 0)");
    expect(read("app/components/StockDayEntry.tsx")).toContain("id in godown ?");
  });

  it("giving more than the godown holds warns but does not block", () => {
    const ui = read("app/components/StockDayEntry.tsx");
    expect(ui).toContain("More than the godown holds");
    // The save button is disabled only for a missing price or a fractional
    // quantity (v199) — and, v206, a closed month — never for this.
    expect(ui).toContain("const canSave = !locked && !busy && unpriced.length === 0 && fractional.length === 0;");
    expect(ui).toContain("<Btn onClick={save} disabled={!canSave}>");
    expect(ui).not.toMatch(/disabled=\{[^}]*overGodown/);
    expect(ui).not.toMatch(/canSave = [^;]*overGodown/);
  });
});

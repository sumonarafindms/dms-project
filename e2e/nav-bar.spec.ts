import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { login } from "./helpers";

/**
 * The phone's bottom bar, used rather than read.
 *
 * `tests/bottom-nav.smoke.test.ts` holds the slotting rule and carries the
 * measurement that justifies the five-cell cap. This is the other half: tap
 * More, see every destination, pick one from the overflow, and watch the bar
 * bring it forward so the screen still says where you are.
 *
 * That last part is the reason the cap is defensible at all. The bar is the
 * ONLY navigation below 900px — the sidebar is `display: none` — so an entry
 * that the bar cannot show has to be reachable another way, and the page you
 * land on has to be visible when you get there.
 */

const WIDTH_PROJECT = "w390";

/**
 * How many destinations the RSO role has, read from the shell.
 *
 * The sheet must hold every one of them; that is the whole bargain the
 * five-cell cap is allowed to exist under. Counting them here rather than
 * writing the number down means adding a destination changes the expectation
 * with it, and REMOVING one from the sheet still fails.
 */
function rsoNavCount() {
  const src = fs.readFileSync(path.join(__dirname, "..", "app", "components", "AppShell.tsx"), "utf8");
  const block = src.slice(src.indexOf("  rso: {"));
  const nav = block.slice(block.indexOf("nav: ["), block.indexOf("bottom:"));
  return [...nav.matchAll(/\bhref:/g)].length;
}

const user = process.env.E2E_RSO_USER;
const pass = process.env.E2E_RSO_PASS;

test.describe("the bottom bar on a phone", () => {
  test.skip(!user || !pass, "set E2E_RSO_USER and E2E_RSO_PASS to run");
  test.beforeEach(async ({}, testInfo) => {
    // The bar is `display: none` above 900px, and the rule is not per-width —
    // one project is the whole check.
    testInfo.setTimeout(90_000);
    test.skip(testInfo.project.name !== WIDTH_PROJECT, `the bottom bar runs at ${WIDTH_PROJECT} only`);
  });

  test("caps at five cells and keeps every destination reachable", async ({ page }) => {
    await login(page, user!, pass!);
    await page.goto("/rso");
    await page.waitForLoadState("networkidle").catch(() => {});

    const cells = page.locator(".bottom-nav .bottom-link");
    await expect(cells).toHaveCount(5);

    // Every cell is a real target. 44px is the floor; the seven-cell bar this
    // replaced measured 45px wide at 320px with no gap between neighbours.
    for (const box of await cells.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()))) {
      expect(box.width, "a bottom-bar cell narrower than the tap-target floor").toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    /*
     * The sheet lists the WHOLE nav, not only what the bar could not fit — and
     * the count comes from the shell's own config rather than a number typed
     * here. v189 added two destinations to this role and a hard-coded 7 failed
     * for the one reason that is not a defect: the app grew.
     */
    await page.locator(".bottom-more").click();
    const rows = page.locator(".kit-modal .kit-row");
    await expect(rows).toHaveCount(rsoNavCount());
    const names = (await rows.allInnerTexts()).map((t) => t.split("\n")[0].trim());
    for (const shown of await cells.allInnerTexts()) {
      const label = shown.trim().split("\n")[0];
      if (label === "More") continue;
      expect(names, `${label} is in the bar but missing from the sheet`).toContain(label);
    }
  });

  test("Escape closes the sheet and gives focus back", async ({ page }) => {
    await login(page, user!, pass!);
    await page.goto("/rso");
    await page.locator(".bottom-more").click();
    await expect(page.locator(".kit-modal")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator(".kit-modal")).toHaveCount(0);
    // The dialog promised `aria-modal`; returning focus is the other half of
    // that promise, and it was missing on every sheet in the app.
    await expect(page.locator(".bottom-more")).toBeFocused();
  });

  test("a destination picked from the sheet comes forward in the bar", async ({ page }) => {
    await login(page, user!, pass!);
    await page.goto("/rso");
    await page.locator(".bottom-more").click();
    await page.locator(".kit-modal .kit-row", { hasText: "Retailers" }).first().click();
    await page.waitForURL((u) => u.pathname === "/rso/retailers", { timeout: 30_000 });

    // The sheet gets out of the way...
    await expect(page.locator(".kit-modal")).toHaveCount(0);
    // ...the page you asked for is the one marked current...
    await expect(page.locator(".bottom-nav .bottom-link.active")).toHaveText(/Retailers/);
    // ...and the two cells that must never move have not.
    const labels = (await page.locator(".bottom-nav .bottom-link").allInnerTexts()).map((t) => t.trim().split("\n")[0]);
    expect(labels[0]).toBe("Home");
    expect(labels[1]).toBe("Live GA");
    expect(labels).toHaveLength(5);
  });
});

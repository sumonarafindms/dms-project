import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, expectUsableTapTargets } from "./helpers";

/**
 * The routes reachable without a session, at every width.
 *
 * This spec needs no database and no seeded users, so it runs anywhere the app
 * boots — including CI on a fresh checkout. `roles.spec.ts` covers the rest and
 * skips itself when credentials are absent.
 */

const PUBLIC = [
  { path: "/login", name: "team login" },
  { path: "/sacool", name: "admin login" },
];

for (const route of PUBLIC) {
  test(`${route.name} lays out correctly`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    // One expected message, documented in SECURITY.md: the CSP ships
    // Report-Only, and browsers say so about upgrade-insecure-requests. The
    // directive is kept because it takes effect on enforcement, so this spec
    // ignores exactly that line and nothing else.
    const EXPECTED = /upgrade-insecure-requests' is ignored when delivered in a report-only policy/;
    page.on("console", (m) => m.type() === "error" && !EXPECTED.test(m.text()) && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));

    const res = await page.goto(route.path);
    expect(res?.status(), `${route.path} should load`).toBeLessThan(400);

    await expectNoHorizontalOverflow(page, `${route.path} @ ${testInfo.project.name}`);
    await expectUsableTapTargets(page, `${route.path} @ ${testInfo.project.name}`);

    // The form must be usable, not merely present.
    await expect(page.locator('input[name="identifier"]')).toBeVisible();
    await expect(page.locator('input[name="credential"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeEnabled();

    expect(errors, `${route.path}: console errors`).toEqual([]);
  });
}

test("the root redirects to the team login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

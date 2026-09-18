import { expect, test } from "@playwright/test";

/**
 * What the login forms do while they are still only HTML.
 *
 * `tests/form-method.smoke.test.ts` states the rule against the source. This
 * states it against a browser, because the thing being asserted is the
 * browser's default behaviour and not ours: a `<form>` with no `method` is a
 * GET, and until React hydrates the page there is nothing to stop it.
 *
 * Hydration is prevented here the way a slow connection prevents it — the HTML
 * arrives and the JavaScript does not. Everything after that is a real Chrome
 * doing what Chrome does with the markup we shipped.
 *
 * Before the fix this test recorded:
 *
 *     /login?identifier=01700000001&credential=Test%401234
 *     /sacool?identifier=admin&credential=Test%401234
 *
 * No session, no database and no seeded users are needed, so this runs
 * wherever the app boots.
 */

const SECRET = "Test@1234";

const FORMS = [
  { path: "/login", name: "team login", identifier: "01700000001", button: "Sign in" },
  { path: "/sacool", name: "admin login", identifier: "admin", button: "Continue securely" },
];

for (const form of FORMS) {
  test(`${form.name} keeps the credential out of the URL before hydration`, async ({ page, context }) => {
    // The app's own JavaScript, and only that: the HTML, the CSS and the
    // images still load exactly as they would.
    await context.route("**/_next/static/chunks/**", (route) => route.abort());

    const res = await page.goto(form.path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${form.path} should render without its scripts`).toBeLessThan(400);

    await page.fill('input[name="identifier"]', form.identifier);
    await page.fill('input[name="credential"]', SECRET);

    // A real click on the real button. Nothing is intercepting it: React is
    // not here, so this is the browser's own submission.
    await page.locator("button[type=submit]").click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(500);

    const url = page.url();
    expect(url, `the PIN reached the address bar: ${url}`).not.toContain(encodeURIComponent(SECRET));
    expect(url, `the PIN reached the address bar: ${url}`).not.toContain(SECRET);
    expect(url, `the identifier reached the address bar: ${url}`).not.toContain("identifier=");
    // Nothing typed into the form may appear in the query string at all.
    expect(new URL(url).search, `${form.path} submitted its fields into the URL: ${url}`).toBe("");

    // And the submission must still land somewhere usable rather than on an
    // error page — a POST to a Next.js page route renders that page again.
    await expect(page.locator('input[name="credential"]')).toBeVisible();
  });
}

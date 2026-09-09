import { expect, test } from "@playwright/test";
import { login } from "./helpers";

/**
 * What a phone in the field actually sees when the request does not land.
 *
 * `tests/api-client.smoke.test.ts` holds the rules — the helper never throws,
 * it times out, it does not reword a wrong PIN. Those are checked against a
 * stubbed `fetch`, which is honest but proves nothing about the screen.
 *
 * This is the other half, at 390px, against the running app. Before the fix,
 * the first test here left the page saying **"Loading targets…"** indefinitely
 * with nothing else on screen — no error, no retry, no clue. That is the
 * failure being guarded, and it is invisible on office wi-fi, which is exactly
 * why it survived so long.
 */

const PHONE = "w390";
const user = process.env.E2E_IT_USER;
const pass = process.env.E2E_IT_PASS;

test.describe("A request that never lands", () => {
  test.skip(!user || !pass, "set E2E_IT_USER and E2E_IT_PASS to run");

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== PHONE, `runs at ${PHONE} only`);
    test.setTimeout(120_000);
    await login(page, user!, pass!, false);
  });

  test("says the connection is gone instead of loading forever", async ({ page }) => {
    // The signal drops before the page can fetch its data.
    await page.route("**/api/targets*", (r) => r.abort("internetdisconnected"));
    await page.goto("/targets", { waitUntil: "load" });

    await expect(page.getByText(/No connection/i)).toBeVisible({ timeout: 20_000 });
    // And the spinner has to stop, or the message reads as "still trying".
    await expect(page.getByText(/Loading targets/i)).toBeHidden();
  });

  test("survives an HTML error page from the platform", async ({ page }) => {
    /*
     * A 502 from the host is an HTML document. `await res.json()` threw on it
     * exactly the way a dead network did, and froze the screen the same way —
     * one bug, two causes, which is why both are tested.
     */
    await page.route("**/api/targets*", (r) =>
      r.fulfill({ status: 502, contentType: "text/html", body: "<html>Bad Gateway</html>" }),
    );
    await page.goto("/targets", { waitUntil: "load" });
    await expect(page.getByText(/unexpected response/i)).toBeVisible({ timeout: 20_000 });
  });

  test("tells the operator their session expired, in words", async ({ page }) => {
    await page.route("**/api/targets*", (r) =>
      r.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Unauthorized" }) }),
    );
    await page.goto("/targets", { waitUntil: "load" });

    await expect(page.getByText(/session has expired/i)).toBeVisible({ timeout: 20_000 });
    // The word the server actually sends, which used to be the whole message.
    await expect(page.getByText(/^Unauthorized$/)).toHaveCount(0);
  });
});

test.describe("The sign-in form keeps its own wording", () => {
  test.skip(!user, "set E2E_IT_USER to run");

  test("a wrong PIN says so, and says nothing about sessions", async ({ page }, testInfo) => {
    /*
     * The regression the 401 handling could most easily have caused. A wrong PIN
     * is a 401 too; rewording it as "your session expired" would send someone
     * off to reload the page, sign in successfully, and never find out they had
     * simply mistyped.
     *
     * One attempt only — this app locks an account after repeated failures, and
     * a test that locks the shared E2E login would break every spec after it.
     */
    test.skip(testInfo.project.name !== PHONE, `runs at ${PHONE} only`);
    await page.goto("/login", { waitUntil: "load" });
    await page.fill('input[name="identifier"]', user!);
    await page.fill('input[name="credential"]', "000000");
    await page.click('button[type="submit"]');

    await expect(page.getByText(/invalid login credentials/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/session has expired/i)).toHaveCount(0);
    // And the button has to come back, or one typo ends the session.
    await expect(page.locator('button[type="submit"]')).toBeEnabled();
  });
});

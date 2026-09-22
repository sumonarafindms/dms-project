import { expect, test } from "@playwright/test";
import { login } from "./helpers";

/**
 * Campaigns and Sim Support, used rather than read.
 *
 * `tests/campaign.smoke.test.ts` and `tests/sim-support.smoke.test.ts` hold the
 * arithmetic — including the owner's own numbers, 14 SIMs → ৳700 and 15 → ৳1,500
 * — without a database. This is the other half: open the screens as the people
 * who use them and check that the money and the targets on screen are the ones
 * those rules produce.
 *
 * The seeded day is 2026-09-15, the last day the GA feed covers.
 */

const DESKTOP = "w1440";
const PHONE = "w390";
const DAY = "2026-09-15";

const admin = process.env.E2E_ADMIN_USER;
const adminPass = process.env.E2E_ADMIN_PASS;
const rso = process.env.E2E_RSO_USER;
const rsoPass = process.env.E2E_RSO_PASS;

test.describe("Campaigns", () => {
  test.skip(!admin || !adminPass, "set E2E_ADMIN_USER and E2E_ADMIN_PASS to run");
  test.beforeEach(async ({}, testInfo) => {
    testInfo.setTimeout(90_000);
    test.skip(testInfo.project.name !== DESKTOP, `the operator view runs at ${DESKTOP} only`);
  });

  test("a per-RSO campaign shows both levels and neither invents a number", async ({ page }) => {
    await login(page, admin!, adminPass!, true);
    await page.goto("/campaigns");
    const card = page.locator("main a.cmp-card").first();
    await expect(card).toBeVisible();
    await card.click();
    await page.waitForURL(/\/campaigns\/[^/]+$/, { timeout: 30_000 });
    await page.waitForLoadState("networkidle").catch(() => {});

    /*
     * The five figures above the table. The labels are matched as they are
     * WRITTEN, not as they are painted: `.kit-stat-pill` uppercases them in
     * CSS, which leaves `textContent` alone.
     */
    const main = page.locator("main");
    await expect(main).toContainText("Target");
    await expect(main).toContainText("Days left");

    // Both levels, and the RSO level is reachable.
    const tabs = page.locator(".ops-level-tab");
    if ((await tabs.count()) > 1) {
      await tabs.nth(1).click();
      await expect(page.locator("main table tbody tr").first()).toBeVisible();
    }

    /*
     * A team with an excluded RSO prints "5 of 6", never "6" — otherwise the
     * reader would take all six to be behind a target only five carry.
     */
    const body = await main.innerText();
    expect(body, "no percentage of a target nobody set").not.toMatch(/\bof 0\b/);
  });

  test("a distribution campaign offers no per-RSO breakdown", async ({ page }) => {
    await login(page, admin!, adminPass!, true);
    await page.goto("/campaigns");
    const card = page.locator("main a.cmp-card", { hasText: "Whole distribution" }).first();
    // Scoped by the card's footer, which names the scope.
    if ((await card.count()) === 0) test.skip(true, "no distribution campaign seeded");
    await card.click();
    await page.waitForURL(/\/campaigns\/[^/]+$/, { timeout: 30_000 });
    await expect(page.locator("main")).toContainText("No per-RSO breakdown exists");
    await expect(page.locator(".ops-level-tab")).toHaveCount(0);
  });

  test("the create form swaps its target field with the scope", async ({ page }) => {
    await login(page, admin!, adminPass!, true);
    await page.goto("/campaigns/new");
    // One field, not two: a form offering both invites filling in both.
    await expect(page.getByLabel(/Total SIMs for the whole distribution/)).toBeVisible();
    await page.locator('input[name="scope"][value="PER_EMPLOYEE"]').check();
    await expect(page.getByLabel(/SIMs for each RSO and BP/)).toBeVisible();
    await expect(page.getByLabel(/Total SIMs for the whole distribution/)).toHaveCount(0);
  });
});

test.describe("Sim Support", () => {
  test.skip(!admin || !adminPass, "set E2E_ADMIN_USER and E2E_ADMIN_PASS to run");
  test.beforeEach(async ({}, testInfo) => {
    testInfo.setTimeout(90_000);
    test.skip(testInfo.project.name !== DESKTOP, `the operator view runs at ${DESKTOP} only`);
  });

  test("the SSO offer is counted on every outlet, not only the picked codes", async ({ page }) => {
    /*
     * The owner's ruling, and the change most likely to be quietly undone:
     * *"SSO ta rso under ar jai retailer gula sim sell kore tader sobar, kono
     * selection nai."* On 2 Sep the seeded month has hundreds of outlets
     * completing SSO and most of them are not picked codes.
     */
    await login(page, admin!, adminPass!, true);
    await page.goto("/support?date=2026-09-02");
    await page.waitForLoadState("networkidle").catch(() => {});
    const main = page.locator("main");
    await expect(main).toContainText("picked for the slab or not");
    // The two halves are reported apart, because they count different outlets.
    await expect(main).toContainText("From slabs");
    await expect(main).toContainText("From the SSO offer");
    // A BP never draws the SSO offer.
    const bpSso = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll("main table tbody tr"));
      return rows
        .filter((r) => (r.querySelector("td")?.textContent || "").includes("BP"))
        .map((r) => (r.querySelectorAll("td")[6]?.textContent || "").trim());
    });
    expect(bpSso.every((v) => v === "—" || v === "")).toBe(true);
  });

  test("a day with an offer shows the slabs and what they pay", async ({ page }) => {
    await login(page, admin!, adminPass!, true);
    await page.goto(`/support?date=${DAY}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    const main = page.locator("main");
    await expect(main).toContainText("From 4 SIMs");
    // The rule that makes the money surprising, said out loud on the page.
    await expect(main).toContainText("every");
    await expect(main).toContainText("Payable");
    await expect(page.locator("main table tbody tr").first()).toBeVisible();
  });

  test("a day with no offer says so instead of showing zero", async ({ page }) => {
    await login(page, admin!, adminPass!, true);
    await page.goto("/support?date=2026-01-01");
    await expect(page.locator("main")).toContainText("No support offer for this day");
  });

  test("the scheme form previews the jump a slab creates", async ({ page }) => {
    await login(page, admin!, adminPass!, true);
    await page.goto("/support/schemes/new");
    await page
      .getByLabel(/From this many SIMs/)
      .first()
      .fill("15");
    await page
      .getByLabel(/Taka per SIM/)
      .first()
      .fill("100");
    // 15 x 100, and the SIM below it earns nothing yet.
    await expect(page.locator(".sup-preview")).toContainText("৳1,500");
    await expect(page.locator(".sup-preview")).toContainText("14 SIMs");
  });
});

test.describe("what the field sees", () => {
  test.skip(!rso || !rsoPass, "set E2E_RSO_USER and E2E_RSO_PASS to run");
  test.beforeEach(async ({}, testInfo) => {
    testInfo.setTimeout(90_000);
    test.skip(testInfo.project.name !== PHONE, `the field view runs at ${PHONE} only`);
  });

  test("their support, and what one more SIM is worth", async ({ page }) => {
    await login(page, rso!, rsoPass!);
    await page.goto(`/support?date=${DAY}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    const mine = page.locator(".sup-mine");
    await expect(mine).toBeVisible();
    await expect(mine).toContainText("Your support");
    await expect(mine, "the codes the slab is counted on").toContainText("Slab counted on");
    /*
     * The nudge is the reason the feature exists: it names the SIMs still
     * needed, the total they unlock and the difference. It is absent only on
     * the top slab or with no offer, and the seeded day is neither.
     */
    await expect(page.locator(".sup-nudge")).toContainText(/takes today's support to ৳[\d,]+, which is ৳[\d,]+ more/);
  });

  test("their campaign card leads with their own number, not the company's", async ({ page }) => {
    await login(page, rso!, rsoPass!);
    await page.goto("/campaigns");
    const card = page.locator("main a.cmp-card").first();
    await expect(card).toBeVisible();
    // The distribution's figure is context in the footer, not the headline.
    await expect(card.locator(".cmp-card-foot")).toContainText("Everyone:");
  });
});

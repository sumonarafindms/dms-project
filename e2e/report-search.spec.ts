import { expect, test } from "@playwright/test";
import { login } from "./helpers";

/**
 * The search actually narrows a report, and the Daily drill-down actually
 * drills.
 *
 * `tests/report-search.smoke.test.ts` holds the rules — every report reads
 * `?q=`, the export URL never carries it, the supervisor name links into the
 * RSO view. Those are checked by reading source, which is the honest way to
 * hold a rule but proves nothing about what happens in a browser.
 *
 * This is the other half: type into the box and watch the table change, click
 * a supervisor and land on that supervisor's RSOs, and confirm the download
 * still contains every row while the screen shows a handful. That last one is
 * the deliberate disagreement the owner chose, and the only way to know it
 * behaves as intended is to open the file.
 */

const DESKTOP = "w1440";

const user = process.env.E2E_IT_USER;
const pass = process.env.E2E_IT_PASS;
const PERIOD = "from=2026-08-01&to=2026-08-31";

test.describe("Report search", () => {
  test.skip(!user || !pass, "set E2E_IT_USER and E2E_IT_PASS to run");

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== DESKTOP, `runs at ${DESKTOP} only`);
    test.setTimeout(120_000);
    await login(page, user!, pass!, false);
  });

  test("narrows the table as you type", async ({ page }) => {
    await page.goto(`/it/reports/ob?${PERIOD}`, { waitUntil: "load" });
    const rows = page.locator("table tbody tr");
    const before = await rows.count();
    expect(before, "seed too small to prove a search narrows anything").toBeGreaterThan(1);

    // Take a value that genuinely appears, so a zero result cannot be mistaken
    // for a working filter.
    const target = (await rows.first().locator("td").first().textContent())?.trim() ?? "";
    expect(target).not.toBe("");

    await page.getByRole("searchbox").fill(target);
    await expect(page).toHaveURL(/[?&]q=/, { timeout: 15_000 });
    await expect(rows).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator("table tbody tr").first()).toContainText(target);
  });

  test("says the export still holds everything while a search is on", async ({ page }) => {
    await page.goto(`/it/reports/ob?${PERIOD}`, { waitUntil: "load" });
    const first = (await page.locator("table tbody tr td").first().textContent())?.trim() ?? "";
    await page.getByRole("searchbox").fill(first);
    await expect(page).toHaveURL(/[?&]q=/, { timeout: 15_000 });

    // Predictable is not the same as obvious. A screen showing one row beside a
    // button that downloads 260 has to explain itself.
    await expect(page.getByText(/Export Excel still downloads the full report/i)).toBeVisible();
  });

  test("the export ignores the search, and the file proves it", async ({ page }) => {
    await page.goto(`/it/reports/ob?${PERIOD}`, { waitUntil: "load" });
    const total = Number(
      (/of ([\d,]+)/.exec((await page.locator(".kit-pager-label").first().textContent()) ?? "")?.[1] ?? "0").replace(
        /,/g,
        "",
      ),
    );
    expect(total, "no pager total to compare against").toBeGreaterThan(60);

    const first = (await page.locator("table tbody tr td").first().textContent())?.trim() ?? "";
    await page.getByRole("searchbox").fill(first);
    await expect(page.locator("table tbody tr")).toHaveCount(1, { timeout: 15_000 });

    const link = page.getByRole("link", { name: /export excel/i });
    expect(await link.getAttribute("href"), "the search reached the export URL").not.toMatch(/[?&]q=/);

    const download = page.waitForEvent("download", { timeout: 60_000 });
    await link.click();
    const file = await (await download).path();
    const XLSX = await import("exceljs");
    const wb = new XLSX.default.Workbook();
    await wb.xlsx.readFile(file!);
    expect(wb.worksheets[0].rowCount - 1, "the download followed the search").toBe(total);
  });

  test("clearing the search restores the report", async ({ page }) => {
    await page.goto(`/it/reports/ob?${PERIOD}`, { waitUntil: "load" });
    const rows = page.locator("table tbody tr");
    const before = await rows.count();
    const box = page.getByRole("searchbox");
    await box.fill((await rows.first().locator("td").first().textContent())?.trim() ?? "");
    await expect(rows).toHaveCount(1, { timeout: 15_000 });
    await box.fill("");
    await expect(rows).toHaveCount(before, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/[?&]q=/);
  });
});

test.describe("Daily Summary levels", () => {
  test.skip(!user || !pass, "set E2E_IT_USER and E2E_IT_PASS to run");

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== DESKTOP, `runs at ${DESKTOP} only`);
    test.setTimeout(120_000);
    await login(page, user!, pass!, false);
    await page.goto(`/it/reports/daily?${PERIOD}`, { waitUntil: "load" });
  });

  /*
   * Switching level is a SOFT navigation: React replaces the server tree in
   * place, and for a moment the previous level's table is still on screen.
   * Waiting for "a table row is visible" is therefore satisfied by the OLD
   * table, and whatever is read next belongs to the level just left.
   *
   * This is not hypothetical. The BP test below passed on a one-supervisor
   * database and failed the moment a second supervisor made the click slower —
   * it had been reading the supervisor view's headings and finding no C2C
   * column purely because it got there first. Waiting for the URL and then for
   * a heading unique to the destination is what makes the assertion about the
   * level it names.
   */
  async function switchTo(page: import("@playwright/test").Page, label: string, expectHeading: RegExp) {
    await page.getByRole("link", { name: label, exact: true }).click();
    await expect(page.locator("table thead th").filter({ hasText: expectHeading }).first()).toBeVisible({
      timeout: 15_000,
    });
  }

  test("offers all three levels and each one loads", async ({ page }) => {
    for (const [label, heading] of [
      ["By Supervisor", /^RSOs$/],
      ["By RSO", /^Supervisor$/],
      ["By BP", /^RSO$/],
    ] as const) {
      await switchTo(page, label, heading);
      // An error boundary or an empty shell would both fail here.
      await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 15_000 });
    }
  });

  test("clicking a supervisor lands on that supervisor's RSOs", async ({ page }) => {
    /*
     * The gesture that used to do nothing. Before v154 the supervisor's name
     * was plain text, so there was no route from "Shaheen's team did 7 GA" to
     * "which of Shaheen's ten RSOs did it".
     */
    const nameCell = page.locator("table tbody tr").first().locator("td").first();
    const supervisor = (await nameCell.textContent())?.trim() ?? "";
    expect(supervisor).not.toBe("");

    /*
     * With one supervisor in the data, "every row belongs to the one I clicked"
     * is true however broken the filter is. Skipping loudly is the honest
     * outcome — a test that cannot fail on the data in front of it should say
     * so rather than report a pass it did not earn.
     */
    const supervisorCount = await page.locator("table tbody tr").count();
    test.skip(
      supervisorCount < 2,
      `only ${supervisorCount} supervisor in this data — the filter cannot be shown to narrow anything`,
    );

    await nameCell.getByRole("link").click();
    await expect(page).toHaveURL(/level=rso/, { timeout: 15_000 });
    await expect(page).toHaveURL(/supervisor=/);

    // Every row on screen belongs to that supervisor, and the page says so.
    await expect(page.getByText(/Showing only/)).toContainText(supervisor);
    const supervisorCells = page.locator("table tbody tr td:nth-child(2)");
    const count = await supervisorCells.count();
    expect(count, "the drill-down produced no rows").toBeGreaterThan(0);
    for (let i = 0; i < count; i++) expect((await supervisorCells.nth(i).textContent())?.trim()).toBe(supervisor);
  });

  test("clearing the drill-down shows every RSO again", async ({ page }) => {
    const supervisors = await page.locator("table tbody tr").count();
    await page.locator("table tbody tr").first().locator("td").first().getByRole("link").click();
    await expect(page).toHaveURL(/supervisor=/, { timeout: 15_000 });
    const narrowed = await page.locator("table tbody tr").count();

    await page.getByRole("link", { name: /show every rso/i }).click();

    /*
     * The two halves of "cleared" are separated deliberately.
     *
     * The URL losing `supervisor=` and the notice disappearing are true on any
     * data, so they are asserted unconditionally. "More rows than before" needs
     * at least two supervisors to mean anything — with one, the filtered and
     * unfiltered lists are the same list, and asserting growth fails on a page
     * that is working correctly. That is what happened the first time this ran.
     */
    await expect(page).not.toHaveURL(/supervisor=/, { timeout: 15_000 });
    await expect(page.getByText(/Showing only/)).toBeHidden();

    if (supervisors > 1)
      expect(await page.locator("table tbody tr").count(), "clearing the filter showed no more rows").toBeGreaterThan(
        narrowed,
      );
  });

  test("the BP view shows no money columns it cannot fill", async ({ page }) => {
    await switchTo(page, "By BP", /^RSO$/);
    await expect(page).toHaveURL(/level=bp/);
    // No "Retailers" column is what tells the BP table apart from the others.
    await expect(page.locator("table thead th").filter({ hasText: /^Retailers$/ })).toHaveCount(0);
    const headings = await page.locator("table thead th").allTextContents();
    // A BP has a GA target and nothing else in this schema. Empty money columns
    // would read as "this BP sold nothing".
    expect(headings).not.toContain("C2C");
    expect(headings).not.toContain("C2S");
    expect(headings.join(" ")).toMatch(/GA/);
  });
});

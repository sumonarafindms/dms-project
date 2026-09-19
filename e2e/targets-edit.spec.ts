import { expect, test } from "@playwright/test";
import { login } from "./helpers";

/**
 * Targets are edited in a dialog, and scrolling cannot change one.
 *
 * ## The bug this exists for
 *
 * Every figure on the Targets page used to be a live `<input type="number">` —
 * seven per RSO, twenty RSOs, all editable at once. A focused number input
 * changes its value when the mouse wheel moves over it. So scrolling down the
 * page was enough to silently rewrite a target, and since the page saves the
 * whole grid in one request, the wrong number went to the database along with
 * everything the operator meant to change. Nothing in the UI said so.
 *
 * That is not something a static test can prove absent. `tests/export-shape`
 * checks the source has no number input outside the dialog, which is the rule;
 * this checks the behaviour — a wheel over the table changes nothing, and the
 * dialog's own field ignores the wheel too.
 */

/*
 * Two widths, because the page has two renderings and they are not the same
 * control.
 *
 * Below 640px the desktop table is `display: none` and one card per record
 * takes over, with a full-width "Edit targets" button instead of the table's
 * "Edit". The first version of this spec ran only at 390px and looked for the
 * table's button — it failed on all four tests while the page was working
 * perfectly, because the thing it was looking for was the hidden rendering.
 * A phone-only spec cannot cover a desktop table, and vice versa.
 */
const DESKTOP = "w1440";
const PHONE = "w390";

const user = process.env.E2E_ADMIN_USER;
const pass = process.env.E2E_ADMIN_PASS;

async function openTargets(page: import("@playwright/test").Page) {
  await login(page, user!, pass!, true);
  await page.goto("/targets", { waitUntil: "load" });
  // A client component that fetches after mount: the rows do not exist until
  // then, and asserting against the server shell proves nothing.
  await expect(page.getByRole("button", { name: /^edit( targets?)?$/i }).first()).toBeAttached({ timeout: 30_000 });
}

test.describe("Monthly target control, desktop table", () => {
  test.skip(!user || !pass, "set E2E_ADMIN_USER and E2E_ADMIN_PASS to run");

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== DESKTOP, `runs at ${DESKTOP} only`);
    test.setTimeout(120_000);
    await openTargets(page);
  });

  test("shows figures, not a grid of live inputs", async ({ page }) => {
    // The whole table, both the desktop and the phone-card rendering.
    const inputs = page.locator("table input[type=number], .kit-table-cards input[type=number]");
    expect(await inputs.count(), "a target is directly editable in the table again").toBe(0);
  });

  test("a wheel over the table changes nothing", async ({ page }) => {
    const firstFigure = page.locator("table tbody tr").first().locator("td.is-right strong").first();
    const before = await firstFigure.textContent();
    expect(before, "no figure to test against").toBeTruthy();

    // Click into the table, then scroll hard over it — the exact gesture that
    // used to rewrite whichever number the pointer happened to be over.
    await firstFigure.click({ force: true });
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 240);
    await page.mouse.wheel(0, -1440);

    expect(await firstFigure.textContent(), "scrolling changed a target").toBe(before);
  });

  test("the dialog edits one named record and applies it", async ({ page }) => {
    const firstRow = page.locator("table tbody tr").first();
    const name = (await firstRow.locator("td strong").first().textContent())?.trim() ?? "";
    expect(name, "the first row has no name").not.toBe("");

    await firstRow.getByRole("button", { name: /^edit$/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog, "no dialog opened").toBeVisible();
    // Which person is being edited must be stated, not inferred from the row
    // the cursor was on.
    await expect(dialog).toContainText(name);

    const ga = dialog.locator("input[type=number]").first();
    const next = String(Number((await ga.inputValue()) || "0") + 7);
    await ga.fill(next);

    // The dialog's own field must ignore the wheel as well: the dialog is short
    // today, but "short enough not to scroll" is not a guarantee.
    await ga.focus();
    await page.mouse.wheel(0, 300);
    expect(await ga.inputValue(), "the dialog's field changed on scroll").toBe(next);

    await dialog.getByRole("button", { name: /update target/i }).click();
    await expect(dialog).toBeHidden();

    // The table now shows what was typed — the dialog wrote to the page state.
    await expect(firstRow.locator("td.is-right strong").first()).toHaveText(Number(next).toLocaleString());
  });

  test("cancel leaves the record alone", async ({ page }) => {
    const firstRow = page.locator("table tbody tr").first();
    const cell = firstRow.locator("td.is-right strong").first();
    const before = await cell.textContent();

    await firstRow.getByRole("button", { name: /^edit$/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("input[type=number]").first().fill("99999");
    await dialog.getByRole("button", { name: /^cancel$/i }).click();
    await expect(dialog).toBeHidden();

    expect(await cell.textContent(), "Cancel kept the edit").toBe(before);
  });
});

test.describe("Monthly target control, phone cards", () => {
  test.skip(!user || !pass, "set E2E_ADMIN_USER and E2E_ADMIN_PASS to run");

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== PHONE, `runs at ${PHONE} only`);
    test.setTimeout(120_000);
    await openTargets(page);
  });

  test("the card view is the one on screen and it has a way in", async ({ page }) => {
    // If this ever inverts, the desktop tests above would still pass and the
    // phone — 90% of this app's users — would have no way to edit a target.
    await expect(page.locator(".kit-table-wrap").first()).toBeHidden();
    await expect(page.locator(".kit-table-cards .kit-card").first()).toBeVisible();
    expect(await page.locator(".kit-table-cards input[type=number]").count()).toBe(0);
  });

  test("editing from a card opens the dialog and applies", async ({ page }) => {
    const card = page.locator(".kit-table-cards .kit-card").first();
    const name = (await card.locator("strong").first().textContent())?.trim() ?? "";
    await card.getByRole("button", { name: /edit targets/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(name);

    const ga = dialog.locator("input[type=number]").first();
    const next = String(Number((await ga.inputValue()) || "0") + 3);
    await ga.fill(next);
    await dialog.getByRole("button", { name: /update target/i }).click();
    await expect(dialog).toBeHidden();

    /*
     * Matched on the FORMATTED figure.
     *
     * The card prints `toLocaleString("en-US")`, so a value of 1,203 renders
     * with a comma and `^1203$` misses it. This passed for as long as the
     * first card's target happened to be under a thousand — it failed the
     * first time a real four-figure target sat there, which is a test of the
     * data rather than of the page.
     */
    const shown = Number(next).toLocaleString("en-US");
    await expect(
      card
        .locator("strong")
        .filter({ hasText: new RegExp(`^${shown.replace(/,/g, ",")}$`) })
        .first(),
    ).toBeVisible();
  });
});

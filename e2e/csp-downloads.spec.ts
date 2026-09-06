import { expect, test } from "@playwright/test";
// Static, not `await import(...)`: this spec runs in Node, where the dynamic
// import of a CommonJS module hands back a namespace whose functions live
// under `.default` — the first version of this file failed with
// "XLSX.readFile is not a function" after the download had already succeeded.
import * as XLSX from "xlsx";
import { login } from "./helpers";

/**
 * The two things a Content-Security-Policy is most likely to break, exercised.
 *
 * ## Why this is separate from the route sweep
 *
 * `coverage.spec.ts` loads every route as every role and collects
 * `securitypolicyviolation` events, which is steps 1, 2 and 4 of the checklist
 * in SECURITY.md. Step 3 is different in kind: *"perform a spreadsheet export
 * and a file upload (the `blob:` paths)"*. Loading a page never touches those.
 *
 * Both are the awkward cases for a policy:
 *
 * - **Export** is a navigation to `/api/reports/export`, which answers with an
 *   attachment. That is what `form-action` governs. (Until v152 it built the
 *   workbook in the browser and handed it over as a `blob:` URL; moving it to
 *   the server removed a whole class of thing the policy had to allow, and is
 *   why this test no longer looks for a blob.)
 * - **Sample download** is a plain navigation to an API route, which is what
 *   `form-action` and `frame-ancestors` are about.
 *
 * The note in SECURITY.md was explicit that these had never been run: *"the
 * reporting centre's exports, the upload centre's file handling and the chart
 * components are exactly the places a policy is most likely to catch on
 * something, and none of them were reached."* This reaches them.
 */

const WIDTH_PROJECT = "w390";

/** Record every policy violation the page reports, before anything loads. */
async function watchCsp(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      const v = e as SecurityPolicyViolationEvent;
      (window as unknown as { __csp: string[] }).__csp.push(
        `${v.violatedDirective} blocked ${v.blockedURI || "inline"}`,
      );
    });
  });
}

const violations = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp || []).catch(() => [] as string[]);

/** Data rows in a downloaded workbook, header excluded. */
function countSheetRows(file: string) {
  const wb = XLSX.readFile(file);
  return (XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as unknown[]).length;
}

test.describe("Content-Security-Policy survives the file paths", () => {
  const user = process.env.E2E_IT_USER;
  const pass = process.env.E2E_IT_PASS;
  test.skip(!user || !pass, "set E2E_IT_USER and E2E_IT_PASS to run");

  test("a report export downloads the whole report, not the page on screen", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== WIDTH_PROJECT, `runs at ${WIDTH_PROJECT} only`);
    test.setTimeout(180_000);
    await watchCsp(page);
    await login(page, user!, pass!, false);

    /*
     * A retailer-level report, because that is the one that pages. Before v152
     * this screen rendered every retailer; it now renders sixty and the button
     * beside them has to still give all of them. That is the property this
     * test exists for — `tests/report-export.smoke.test.ts` can prove the URL
     * carries no page number, but only a real download proves the file is
     * bigger than the screen.
     */
    await page.goto("/it/reports/performance/retailer?from=2026-08-01&to=2026-08-31", { waitUntil: "load" });
    await page.waitForLoadState("networkidle").catch(() => null);

    const label = await page.locator(".kit-pager-label").first().textContent();
    const m = /of ([\d,]+)/.exec(label ?? "");
    expect(m, `the pager did not say how many rows the report has (saw ${JSON.stringify(label)})`).toBeTruthy();
    const total = Number(m![1].replace(/,/g, ""));
    // A report with fewer rows than a page would not exercise paging at all,
    // and would let this test pass without testing anything.
    expect(total, "seed too small to prove paging").toBeGreaterThan(60);
    expect(await page.locator("tbody tr").count(), "the screen rendered more than one page").toBeLessThanOrEqual(60);

    const link = page.getByRole("link", { name: /export excel/i });
    await expect(link, "the export control is a link to the server route now").toBeVisible();
    const href = await link.getAttribute("href");
    expect(href, "the export URL must not carry the page being viewed").not.toMatch(/[?&]page=/);

    const download = page.waitForEvent("download", { timeout: 60_000 });
    await link.click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.xlsx$/);

    // The file has every row; the screen had sixty. Row count is read from the
    // workbook itself rather than trusted from the URL.
    const saved = await file.path();
    expect(saved, "the download produced no file").toBeTruthy();
    const rowCount = countSheetRows(saved!);
    expect(rowCount, `the export gave ${rowCount} rows for a ${total}-row report`).toBe(total);

    expect(await violations(page), "exporting tripped the policy").toEqual([]);
  });

  test("a sample workbook downloads from its API route", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== WIDTH_PROJECT, `runs at ${WIDTH_PROJECT} only`);
    test.setTimeout(120_000);
    await watchCsp(page);
    await login(page, user!, pass!, false);
    await page.goto("/targets", { waitUntil: "load" });

    const link = page.getByRole("link", { name: /download sample/i }).first();
    await expect(link).toBeVisible();
    const download = page.waitForEvent("download", { timeout: 60_000 });
    await link.click();
    expect((await download).suggestedFilename()).toMatch(/\.(xlsx|xls)$/);
    expect(await violations(page), "the sample download tripped the policy").toEqual([]);
  });

  test("the policy is actually enforcing while these run", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== WIDTH_PROJECT, `runs at ${WIDTH_PROJECT} only`);
    /*
     * Without this, every assertion above would still pass under Report-Only —
     * where nothing is ever blocked and no violation event means nothing at
     * all. The whole point of this file is that the policy has teeth.
     */
    const res = await page.goto("/login", { waitUntil: "load" });
    const headers = res!.headers();
    expect(headers["content-security-policy"], "the policy is not enforcing").toBeTruthy();
    expect(headers["content-security-policy-report-only"]).toBeFalsy();
  });
});

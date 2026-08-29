import { expect, type Page } from "@playwright/test";

/**
 * The two failures that actually make a page unusable on a phone, checked the
 * same way everywhere so a new spec cannot check them differently.
 */

/** Nothing may push the document wider than the viewport. */
export async function expectNoHorizontalOverflow(page: Page, where: string) {
  const m = await page.evaluate(() => {
    const d = document.documentElement;
    const wide: string[] = [];
    // Name the widest offenders, so a failure says WHAT overflowed.
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const r = el.getBoundingClientRect();
      if (r.right > d.clientWidth + 1 && r.width > 0)
        wide.push(`${el.tagName.toLowerCase()}.${el.className?.toString().slice(0, 40)} → ${Math.round(r.right)}px`);
      if (wide.length >= 5) break;
    }
    return { scrollW: d.scrollWidth, clientW: d.clientWidth, wide };
  });
  expect(
    m.scrollW,
    `${where}: page scrolls horizontally (${m.scrollW} > ${m.clientW}). Widest: ${m.wide.join("; ")}`,
  ).toBeLessThanOrEqual(m.clientW + 1);
}

/**
 * Interactive controls must be reachable with a thumb: 24x24 CSS px, the WCAG
 * 2.1 AA floor (SC 2.5.8, Target Size (Minimum)).
 *
 * The inline exception is implemented, not ignored. 2.5.8 exempts a target
 * "in a sentence or its size is otherwise constrained by the line-height of
 * non-target text" — a link inside a paragraph is sized by the prose around
 * it, and padding it to 24px would wreck the line. Both login pages carry
 * exactly such a link ("... sign in at the [team login]."), and the first
 * version of this helper flagged them at all seven widths. The honest fix was
 * here, not there.
 *
 * A link counts as inline prose when its parent holds text besides the link
 * itself. A standalone link in its own container is a real target and is still
 * checked.
 */
export async function expectUsableTapTargets(page: Page, where: string, min = 24) {
  const small = await page.evaluate((min) => {
    const out: { label: string; w: number; h: number; tag: string }[] = [];
    const sel = "button, a[href], input[type=submit], input[type=button], [role=button]";
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;

      if (el.tagName === "A") {
        const parent = el.parentElement;
        const ownText = (el.textContent || "").trim();
        const parentText = (parent?.textContent || "").trim();
        // WCAG 2.5.8 inline exception.
        if (parent && parentText.length > ownText.length + 1) continue;
      }

      if (r.height < min || r.width < min)
        out.push({
          label: (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 30),
          w: Math.round(r.width),
          h: Math.round(r.height),
          tag: el.tagName.toLowerCase(),
        });
    }
    return out;
  }, min);
  expect(small, `${where}: controls below ${min}px: ${JSON.stringify(small)}`).toEqual([]);
}

/** Sign in through the real form. Returns the URL the server chose. */
export async function login(page: Page, identifier: string, credential: string, admin = false) {
  await page.goto(admin ? "/sacool" : "/login");
  await page.fill('input[name="identifier"]', identifier);
  await page.fill('input[name="credential"]', credential);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !/\/(login|sacool)$/.test(u.pathname), { timeout: 15_000 });
  return new URL(page.url()).pathname;
}

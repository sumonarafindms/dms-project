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

/**
 * The page must actually occupy the screen.
 *
 * This is the check that was missing when the bottom nav shipped as a sibling
 * of `.app-main` instead of a child of it. `.app-root` is a row flex container,
 * so on a phone the nav became a second item on that row, took the full 390px,
 * and squeezed `.app-main` to ZERO width — every page a blank white column with
 * the nav's icons stranded at the top.
 *
 * Neither existing assertion could see it. Nothing overflowed horizontally: a
 * zero-width column overflows nothing. Every tap target was comfortably large:
 * the only things left on screen were the nav links, and they were fine. The
 * app was unusable and the suite was green at all seven widths.
 *
 * So: the main column must fill the viewport, and the bottom nav must be a bar
 * rather than a full-height panel. Both are consequences of the nav sitting on
 * the correct side of the layout, and either one alone would have caught it.
 */
export async function expectContentFillsViewport(page: Page, where: string) {
  const m = await page.evaluate(() => {
    const box = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    };
    return {
      viewport: window.innerWidth,
      viewportH: window.innerHeight,
      main: box(".app-main"),
      page: box("main.page"),
      nav: box(".bottom-nav"),
    };
  });

  expect(m.main, `${where}: no .app-main — the shell did not render`).not.toBeNull();
  expect(
    m.main!.w,
    `${where}: .app-main is ${m.main!.w}px inside a ${m.viewport}px viewport. Something beside it on the ` +
      `.app-root row is taking the width — check that .bottom-nav is INSIDE .app-main.`,
  ).toBeGreaterThan(m.viewport * 0.6);

  if (m.page)
    expect(m.page.w, `${where}: main.page is only ${m.page.w}px of ${m.viewport}px`).toBeGreaterThan(
      m.viewport * 0.6,
    );

  // A sticky bar, not a column. Stretched to the document height is the exact
  // symptom of the nav being a row flex item.
  if (m.nav)
    expect(
      m.nav.h,
      `${where}: .bottom-nav is ${m.nav.h}px tall in a ${m.viewportH}px viewport — it is being stretched, ` +
        `which means it is a flex item of .app-root rather than a child of .app-main.`,
    ).toBeLessThan(m.viewportH * 0.5);
}

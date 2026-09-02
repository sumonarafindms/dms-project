import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The bottom nav belongs inside the page column, and that is a layout rule, not
 * a preference.
 *
 * ## The bug
 *
 * `.app-root` is `display: flex` in the ROW direction — sidebar beside content.
 * The mobile bottom nav was rendered as a SIBLING of `.app-main`, so on a phone
 * it became a second item on that row: it claimed the full 390px and
 * `.app-main` (flex: 1, min-width: 0) collapsed to ZERO width. Every page was a
 * blank white column with the nav's icons stranded across the top and the
 * active item's highlight stretched down the whole document, because a row flex
 * item stretches to the line's height.
 *
 * Desktop never showed it. At >=900px the nav is `display: none`, so it stops
 * being a flex item and `.app-main` gets the row back. The app was perfect on
 * the machine it was checked on and unusable on the phones ~90% of its users
 * hold.
 *
 * The real proof is a measurement, and it lives in
 * `expectContentFillsViewport` in e2e/helpers.ts — it asserts `.app-main`
 * fills the viewport and the nav is a bar rather than a full-height panel.
 * These are the cheap structural checks that run without a database.
 */

const ROOT = path.join(__dirname, "..");
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");

const SHELL = read("app", "components", "AppShell.tsx");
const SHELL_CSS = read("styles", "shell.css");
const KIT_CSS = read("styles", "kit.css");

describe("the bottom nav is inside the page column", () => {
  it("is nested within the .app-main element", () => {
    /*
     * Read structurally rather than by regex: find where `.app-main` opens,
     * find where its element closes by counting JSX tag depth, and require the
     * <nav> to fall between them. A looser check ("app-main appears before
     * bottom-nav") passes on the broken markup, since it was a sibling
     * immediately after.
     */
    const mainAt = SHELL.indexOf('<div className="app-main"');
    const navAt = SHELL.indexOf("className={`bottom-nav");
    expect(mainAt, ".app-main was not found").toBeGreaterThan(-1);
    expect(navAt, ".bottom-nav was not found").toBeGreaterThan(-1);

    // Walk from .app-main counting <div> opens and closes to find its end.
    let depth = 0,
      end = -1;
    const re = /<div\b|<\/div>/g;
    re.lastIndex = mainAt;
    for (let m = re.exec(SHELL); m; m = re.exec(SHELL)) {
      depth += m[0] === "</div>" ? -1 : 1;
      if (depth === 0) {
        end = m.index;
        break;
      }
    }
    expect(end, "could not find the end of .app-main").toBeGreaterThan(mainAt);
    expect(
      navAt,
      ".bottom-nav is outside .app-main — it becomes a flex item of .app-root and collapses the page to 0px",
    ).toBeLessThan(end);
  });

  it("still renders the page content and the nav in the same column", () => {
    // Searched FROM .app-main: there is an earlier `{children}` in the
    // pre-auth early return, and indexOf from zero finds that one instead.
    const mainAt = SHELL.indexOf('<div className="app-main"');
    expect(SHELL.indexOf("{children}", mainAt), "the page content is not inside .app-main").toBeGreaterThan(mainAt);
  });
});

describe("the layout rules that made the mistake fatal", () => {
  it("keeps .app-root a row flex container", () => {
    // Not a bug — the sidebar needs it. It is recorded because it is what turns
    // a stray child into a full-width column.
    expect(SHELL_CSS).toMatch(/\.app-root\s*\{[^}]*display:\s*flex/);
  });

  it("keeps .app-main able to shrink", () => {
    expect(SHELL_CSS).toMatch(/\.app-main\s*\{[^}]*min-width:\s*0/);
  });
});

describe("the nav's own columns are equal", () => {
  it("uses minmax(0, 1fr), never a bare 1fr", () => {
    /*
     * `1fr` means `minmax(auto, 1fr)`, and that `auto` floor is the item's
     * min-content width — the longest unbreakable word in it. The column
     * holding "RSO Performance" grew to fit "Performance" while the others
     * shrank, and the labels overlapped their neighbours.
     */
    const cols = KIT_CSS.match(/\.bottom-nav\.is-cols-\d\s*\{[^}]*\}/g) ?? [];
    expect(cols.length, "the bottom-nav column rules were not found").toBeGreaterThanOrEqual(5);
    for (const rule of cols) {
      expect(rule, `bare 1fr lets one label widen its track: ${rule}`).toMatch(/repeat\(\d, minmax\(0, 1fr\)\)/);
    }
  });

  it("lets a nav item shrink below its label", () => {
    // A grid item defaults to min-width: auto, which is the same trap one level
    // down: the label spills sideways instead of wrapping in its own column.
    expect(SHELL_CSS).toMatch(/\.bottom-link\s*\{\s*min-width:\s*0/);
  });
});

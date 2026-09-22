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
/*
 * Code only. Several assertions below quote the old, wrong code in a comment to
 * explain what they are guarding against — matching against the raw file makes
 * the explanation trip the guard it explains.
 */
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
const SHELL_CODE = stripComments(SHELL);
const SHELL_CSS = read("styles", "shell.css");
const KIT_CSS = read("styles", "kit.css");
const BOTTOM_NAV = read("lib/bottom-nav.ts");

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
    expect(cols.length, "the bottom-nav column rules were not found").toBeGreaterThanOrEqual(7);
    for (const rule of cols) {
      expect(rule, `bare 1fr lets one label widen its track: ${rule}`).toMatch(/repeat\(\d, minmax\(0, 1fr\)\)/);
    }
  });

  it("has a column rule for every count the bar can reach", () => {
    /*
     * The bar caps at `MAX_SLOTS`. Before v187 it drew every destination a
     * role had — seven for RSO, Manager and Accounts — which measured 45px
     * cells at 320px, "BP Activations" clipped at 390px, and a bar whose
     * height swung between 54px and 65px depending on whether a label wrapped.
     * `lib/bottom-nav.ts` carries the full measurement.
     *
     * Read from the library rather than hard-coded: raise MAX_SLOTS without
     * adding the matching grid rule and this fails instead of quietly falling
     * back to the previous column count.
     */
    const cap = Number(BOTTOM_NAV.match(/MAX_SLOTS = (\d+)/)![1]);
    expect(cap).toBeGreaterThanOrEqual(2);
    for (let n = 2; n <= cap; n++)
      expect(KIT_CSS, `.bottom-nav.is-cols-${n} has no rule`).toMatch(
        new RegExp(`\\.bottom-nav\\.is-cols-${n}\\s*\\{`),
      );
  });

  it("gives every role more slots than the bar has ever had to draw at once", () => {
    // The shell sizes the grid from what it is about to render, so a role with
    // fewer entries than the cap gets exactly that many columns.
    expect(SHELL).toMatch(/is-cols-\$\{bar\.shown\.length \+ \(bar\.hasMore \? 1 : 0\)\}/);
  });

  describe("nothing becomes unreachable", () => {
    /*
     * The objection that kept the bar at seven, and it was right: below 900px
     * the sidebar is `display: none`, so anything missing from the bar cannot
     * be opened at all. The cap is only allowed to exist because the last cell
     * opens a sheet — and the sheet has to be given the WHOLE list.
     */
    it("the More sheet is handed every destination, not just the overflow", () => {
      expect(
        SHELL,
        "NavMore must receive the full visible nav; handing it bar.overflow would hide the four in the bar from the one complete list",
      ).toMatch(/<NavMore\s+items=\{visibleBottom\}/);
    });

    it("the sheet renders a link per destination", () => {
      const more = read("app/components/NavMore.tsx");
      expect(more).toMatch(/items\.map\(/);
      expect(more).toMatch(/href=\{i\.href\}/);
    });

    it("the bar only caps when there is a More cell to catch the rest", () => {
      // `hasMore` and the slice are decided in one place, so a future edit
      // cannot drop entries without also drawing the button.
      expect(BOTTOM_NAV).toMatch(
        /if \(items\.length <= max\) return \{ shown: items, overflow: \[\], hasMore: false \}/,
      );
    });

    it("the page you are on is always visible in the bar", () => {
      // Otherwise opening something from the sheet leaves four cells, none of
      // them current, and nothing on screen says where you are.
      expect(BOTTOM_NAV).toMatch(/const current = overflow\.find\(/);
    });

    it("the shell does not slice the list itself", () => {
      /*
       * The cap belongs in one place. An earlier version capped in the shell
       * with `configs[key].bottom = configs[key].nav.slice(0, 4)` and the four
       * lines after it assigned the whole nav back, so the rule applied to
       * nobody — code that states a rule it does not apply. A second slice
       * here would drop destinations before `bottomSlots` ever sees them, and
       * the More sheet would list only what was left.
       */
      expect(SHELL_CODE).not.toMatch(/bottom = configs\[key\]\.nav\.slice\(/);
      expect(SHELL_CODE, "the bar's contents come from bottomSlots, nowhere else").toMatch(
        // `isActive` since v196: the one "most specific item wins" rule the
        // sidebar and More sheet also use — see activeAmong in lib/bottom-nav.ts.
        /const bar = bottomSlots\(visibleBottom, path, isActive\)/,
      );
    });
  });

  it("lets a nav item shrink below its label", () => {
    // A grid item defaults to min-width: auto, which is the same trap one level
    // down: the label spills sideways instead of wrapping in its own column.
    expect(SHELL_CSS).toMatch(/\.bottom-link\s*\{\s*min-width:\s*0/);
  });
});

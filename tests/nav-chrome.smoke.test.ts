import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The menus, and the promises their markup makes.
 *
 * Two kinds of defect are recorded here. The first is a dialog that declared
 * `aria-modal="true"` and then behaved like a div: Escape did nothing, focus
 * stayed outside it, and Tab walked out of the back of the sheet into the page
 * `aria-modal` had just told a screen reader was hidden. Every sheet in the app
 * goes through that one component — the account sheet, the More sheet, the
 * target editors, the user manager — so it was four sheets, not one.
 *
 * The second is smaller and was invisible until it was measured: the group
 * headings in the admin sidebar drew a "⌄" CHARACTER, laid out by whatever
 * font the device happened to have. It sat on the text baseline rather than
 * the row's optical centre and its stroke matched nothing else in the menu; on
 * the owner's screenshots it read as a bare "^" and "v".
 */

const ROOT = path.join(__dirname, "..");
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const MODAL = read("app", "components", "Modal.tsx");
const KIT = read("app", "components", "Kit.tsx");
const SHELL = read("app", "components", "AppShell.tsx");
const SHELL_CSS = read("styles", "shell.css");
const ICONS = read("app", "components", "icons.tsx");

describe("a dialog behaves like one", () => {
  it("Escape closes it", () => {
    expect(MODAL).toMatch(/e\.key === "Escape"/);
  });

  it("focus moves into the panel and back out again", () => {
    expect(MODAL, "the panel must be focusable to receive it").toMatch(/tabIndex=\{-1\}/);
    expect(MODAL).toMatch(/node\?\.focus\(\)/);
    expect(MODAL, "focus has to return to whatever opened the sheet").toMatch(/opener.*focus\(\)/s);
  });

  it("checks the opener is still on the page before returning focus", () => {
    // A sheet that deletes the row it was opened from leaves no opener.
    expect(MODAL).toMatch(/document\.contains\(opener\)/);
  });

  it("Tab cycles inside instead of leaving", () => {
    expect(MODAL).toMatch(/e\.key !== "Tab"/);
    expect(MODAL).toMatch(/shiftKey/);
  });

  it("does not re-run its focus move on every render", () => {
    /*
     * Callers pass an inline arrow, so `onClose` is a new function each
     * render. In the dependency list it would rebuild the listener constantly
     * and re-run the focus move — sending the cursor back to the top of the
     * sheet on every keystroke in the change-PIN form.
     */
    expect(MODAL, "onClose belongs in a ref, and the effect's deps stay empty").toMatch(
      /const close = useRef\(onClose\)/,
    );
    expect(MODAL).toMatch(/\}, \[\]\);/);
  });

  it("stays out of the kit's server-safe bundle", () => {
    // Kit.tsx has no "use client" and server pages import it freely; marking
    // the whole kit as client code to give one component a key handler would
    // pull the kit into every page that renders a card.
    // The DIRECTIVE, which only counts at the top of the file — both files
    // mention the phrase in a comment explaining this very split.
    expect(KIT.trimStart().startsWith('"use client"')).toBe(false);
    expect(KIT, "the old import path has to keep working").toMatch(/export \{ Modal \} from "\.\/Modal"/);
    expect(MODAL.startsWith('"use client"')).toBe(true);
  });
});

describe("the sidebar's own details", () => {
  it("the group chevron is an icon, not a character", () => {
    expect(SHELL, "a font glyph sits on the baseline and matches no other stroke in the menu").not.toContain(
      "<b>⌄</b>",
    );
    expect(SHELL).toMatch(/<Icon name="chevron"/);
    expect(ICONS, "the icon has to exist or Icon falls back to `more`").toMatch(/chevron: \(/);
  });

  it("the chevron turns when the group opens", () => {
    expect(SHELL_CSS).toMatch(/\.admin-nav-group\[open\] summary \.nav-chevron\s*\{\s*transform: rotate\(180deg\)/);
  });

  it("group headings and items draw their icons at one size", () => {
    // 1rem against 1.15rem is too small to read as a hierarchy and large
    // enough to stop the two columns lining up.
    const group = SHELL_CSS.match(/\.admin-nav-group summary \.nav-icon\s*\{([^}]*)\}/)![1];
    const link = SHELL_CSS.match(/\.sidebar-link \.nav-icon\s*\{([^}]*)\}/)![1];
    const size = (block: string) => block.match(/width:\s*([\d.]+rem)/)![1];
    expect(size(group)).toBe(size(link));
  });

  it("a group heading answers the pointer", () => {
    // Clicking it is what opens the group; it was the one row in the menu with
    // no hover state at all.
    expect(SHELL_CSS).toMatch(/\.admin-nav-group summary:hover\s*\{/);
  });

  it("the rail beside a group's items is drawn, not left over", () => {
    expect(SHELL_CSS, "a flat border-left reads as a stray table line").toMatch(
      /\.admin-nav-items::before\s*\{[\s\S]*?linear-gradient/,
    );
  });

  it("the brand is separated from the navigation", () => {
    expect(SHELL_CSS).toMatch(/\.sidebar-brand\s*\{[\s\S]*?border-bottom/);
  });
});

describe("the active item is one thing", () => {
  const PREMIUM = read("styles", "premium.css");

  it("is a contained surface rather than a gradient that fades off the panel", () => {
    const rule = PREMIUM.match(/\.sidebar-link\.active\s*\{([^}]*)\}/)![1];
    expect(rule, "a 90deg fade-to-nothing reads as a smear, not a selected row").not.toMatch(/linear-gradient\(90deg/);
    expect(rule).toMatch(/inset 0 0 0 1px/);
  });

  it("puts the amber on the icon rather than on the whole row", () => {
    expect(PREMIUM).toMatch(/\.sidebar-link\.active \.nav-icon\s*\{[\s\S]*?--color-glow-300/);
  });
});

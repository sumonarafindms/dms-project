import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MAX_SLOTS, barLabel, bottomSlots, type BottomItem } from "../lib/bottom-nav";

/**
 * Five cells, and nothing lost.
 *
 * The bar used to draw every destination a role had. Measured on the real
 * screens before this changed:
 *
 *     role        width  cell    what happened
 *     RSO          320    45px   "Attention" and "Retailers" wrapped
 *     MANAGER      390    55px   "BP Activations" CLIPPED (53px into 51px)
 *     ACCOUNTS     390    55px   five of seven labels on two lines
 *
 * — and the bar's height swung between 54px and 65px depending on whether
 * anything wrapped, so the content above it moved as you navigated.
 *
 * After: 60-82px cells, one constant 68px bar, and the only labels that still
 * wrap are two long single words at the two narrowest widths.
 *
 * The cap is only defensible because the fifth cell opens a sheet holding the
 * whole list. These tests hold both halves of that bargain.
 */

const ROOT = path.join(__dirname, "..");
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");

const item = (href: string, label: string, over: Partial<BottomItem> = {}): BottomItem => ({
  href,
  label,
  icon: "home",
  ...over,
});

/** The app's own rule, so the tests exercise what the shell exercises. */
const active = (path: string, href: string) => path === href || (href !== "/" && path.startsWith(href + "/"));

const seven = [
  item("/rso", "Home"),
  item("/live-ga", "Live GA", { live: true }),
  item("/rso/sso", "SSO"),
  item("/rso/lso", "LSO"),
  item("/rso/attention", "Attention"),
  item("/rso/retailers", "Retailers"),
  item("/rso/bp", "My BP"),
];

describe("what fits in the bar", () => {
  it("draws everything when a role has few enough entries", () => {
    const three = seven.slice(0, 3);
    const { shown, overflow, hasMore } = bottomSlots(three, "/rso", active);
    expect(shown).toHaveLength(3);
    expect(overflow).toEqual([]);
    expect(hasMore, "a More cell for nothing is a fifth of the bar spent on an empty sheet").toBe(false);
  });

  it("draws exactly MAX_SLOTS entries when a role has exactly that many", () => {
    const five = seven.slice(0, MAX_SLOTS);
    const { shown, hasMore } = bottomSlots(five, "/rso", active);
    expect(shown).toHaveLength(MAX_SLOTS);
    expect(hasMore).toBe(false);
  });

  it("keeps the bar to MAX_SLOTS cells once More appears", () => {
    const { shown, hasMore } = bottomSlots(seven, "/rso", active);
    expect(hasMore).toBe(true);
    // Four links plus the More button is five cells — the number the grid,
    // the type step and the 60px floor were all sized for.
    expect(shown.length + 1).toBe(MAX_SLOTS);
  });

  it("loses nothing: bar plus sheet is the whole list", () => {
    const { shown, overflow } = bottomSlots(seven, "/rso", active);
    expect([...shown, ...overflow].map((i) => i.href).sort()).toEqual(seven.map((i) => i.href).sort());
    // And no destination is in both, which would put one entry in two places
    // on the same screen.
    const barHrefs = new Set(shown.map((i) => i.href));
    expect(overflow.some((i) => barHrefs.has(i.href))).toBe(false);
  });

  it("keeps home and Live GA whatever else moves", () => {
    for (const path of ["/rso", "/rso/retailers", "/rso/bp", "/rso/attention"]) {
      const { shown } = bottomSlots(seven, path, active);
      expect(shown[0].href, `home left the bar on ${path}`).toBe("/rso");
      expect(shown[1].href, `Live GA left the bar on ${path}`).toBe("/live-ga");
    }
  });
});

describe("the page you are on is in the bar", () => {
  it("pulls an overflow page into the last primary slot", () => {
    const { shown, overflow } = bottomSlots(seven, "/rso/retailers", active);
    expect(shown.map((i) => i.href)).toContain("/rso/retailers");
    expect(overflow.map((i) => i.href)).not.toContain("/rso/retailers");
    expect(shown).toHaveLength(MAX_SLOTS - 1);
  });

  it("swaps out the LAST primary, never the first two", () => {
    const { shown } = bottomSlots(seven, "/rso/bp", active);
    expect(shown.map((i) => i.href)).toEqual(["/rso", "/live-ga", "/rso/sso", "/rso/bp"]);
  });

  it("leaves the bar alone when the current page is already in it", () => {
    const plain = bottomSlots(seven, "/rso/sso", active);
    expect(plain.shown.map((i) => i.href)).toEqual(["/rso", "/live-ga", "/rso/sso", "/rso/lso"]);
  });

  it("matches a detail page to the section it belongs to", () => {
    // /rso/retailers/abc is the retailer list's own detail page, so the bar
    // should show Retailers as current rather than nothing at all.
    const { shown } = bottomSlots(seven, "/rso/retailers/abc123", active);
    expect(shown.map((i) => i.href)).toContain("/rso/retailers");
  });

  it("leaves the bar in its default shape for a page no entry owns", () => {
    const { shown } = bottomSlots(seven, "/settings", active);
    expect(shown.map((i) => i.href)).toEqual(["/rso", "/live-ga", "/rso/sso", "/rso/lso"]);
  });
});

describe("the label the bar uses", () => {
  it("falls back to the real label", () => {
    expect(barLabel(item("/x", "Attention"))).toBe("Attention");
  });

  it("uses the short form when there is one", () => {
    expect(barLabel(item("/x", "BP Activations", { short: "BP Acts" }))).toBe("BP Acts");
  });

  it("every short form is an abbreviation of its own label, not a different name", () => {
    /*
     * A menu that renames a destination depending on where it is read is the
     * "two words for one thing" defect this project keeps finding. The sheet,
     * the sidebar and the page heading all show the full name; the bar's short
     * form has to be recognisably the same one.
     */
    const shell = read("app", "components", "AppShell.tsx");
    const pairs = [...shell.matchAll(/label: "([^"]+)", short: "([^"]+)"/g)];
    expect(pairs.length, "no short labels found — has the field been renamed?").toBeGreaterThan(0);
    for (const [, label, short] of pairs) {
      /*
       * Same STEM, not the same spelling. "Reports" for "Reporting Center" and
       * "RSOs" for "RSO Performance" are the same name said shorter; "Team"
       * for "Supervisors" would be a different name, and that is what this
       * rejects. A trailing full stop marks a truncation, not a word.
       */
      const stem = (w: string) => w.replace(/\.$/, "").replace(/(ing|es|s)$/, "");
      const words = label.toLowerCase().replace(/&/g, " ").split(/\s+/).filter(Boolean).map(stem);
      for (const raw of short.toLowerCase().split(/\s+/)) {
        const part = stem(raw);
        expect(
          words.some((w) => w.startsWith(part) || part.startsWith(w)),
          `"${short}" is not an abbreviation of "${label}" — the bar must not rename a destination`,
        ).toBe(true);
      }
    }
  });
});

describe("the bar's own chrome", () => {
  const SHELL_CSS = read("styles", "shell.css");

  it("reserves the label box so the bar does not change height", () => {
    // "Live GA" needs 56px and "Supervisors" 86px in the same 71px box, so one
    // role's bar was 57px tall and another's 71px, and the content above moved.
    expect(SHELL_CSS).toMatch(/\.bottom-link > span:not\(\.nav-live-dot\)[\s\S]{0,400}min-height: 2\.3em/);
  });

  it("keeps the live dot out of that box", () => {
    // The dot is a span in the same cell. It inherited the two-line min-height
    // and rendered as an 8x24px bar down the side of the icon.
    expect(SHELL_CSS).toMatch(/\.bottom-link > span:not\(\.nav-live-dot\)/);
  });

  it("styles More as a cell rather than a browser button", () => {
    expect(SHELL_CSS).toMatch(/\.bottom-more\s*\{[\s\S]*?border: none/);
  });
});

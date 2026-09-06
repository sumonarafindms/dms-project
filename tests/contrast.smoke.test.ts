import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The text colours clear WCAG AA, computed rather than asserted by eye.
 *
 * ## What was wrong
 *
 * `--color-slate-400` (#94a3b8) was the muted-text colour in fifty-eight CSS
 * rules. On a white card that is **2.56:1**, against AA's 4.5:1 for body text.
 * Inside a `.kit-card.is-done`, which faded the whole card with `opacity: 0.7`,
 * the same text landed at **1.88:1**. The "Complete" badge was 2.98:1, the
 * primary button's white-on-teal label 3.74:1, and the amber figures 3.19:1.
 *
 * None of that shows up in a screenshot, a layout test, or a type checker. It
 * shows up when an RSO tries to read a phone outdoors in Dhaka, which is what
 * roughly nine in ten of this app's users are doing.
 *
 * ## Why a unit test as well as the browser sweep
 *
 * `e2e/a11y.spec.ts` runs axe-core over every route and is the real check. But
 * it needs a build, a database, a server and seven logins. This one parses
 * `styles/tokens.css` and does the arithmetic, so editing a palette value and
 * running `npm test` tells you immediately — and in CI it fails in seconds
 * rather than minutes.
 *
 * The two are complementary: axe finds combinations nobody predicted, this
 * pins the ones already known to matter.
 */

const ROOT = path.join(__dirname, "..");
const TOKENS = fs.readFileSync(path.join(ROOT, "styles", "tokens.css"), "utf8");

/** `--name: value;` pairs from the token file. */
function tokenMap(css: string) {
  const out = new Map<string, string>();
  for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) out.set(m[1], m[2].trim());
  return out;
}
const TOKEN = tokenMap(TOKENS);

/** Follow `var(--x)` chains to a literal colour. */
function resolve(value: string, depth = 0): string {
  if (depth > 10) throw new Error(`token chain too deep at ${value}`);
  const m = value.match(/^var\((--[a-z0-9-]+)\)$/i);
  if (!m) return value;
  const next = TOKEN.get(m[1]);
  if (!next) throw new Error(`unknown token ${m[1]}`);
  return resolve(next, depth + 1);
}

function rgb(hex: string): [number, number, number] {
  const h = hex.trim().replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`not a hex colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG 2.1 relative luminance. */
function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio, 1 to 21. */
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const AA_BODY = 4.5;

/** The surfaces text actually sits on in this app. */
const SURFACES: Record<string, string> = {
  "card white": "#ffffff",
  "page slate-50": resolve("var(--color-slate-50)"),
};

describe("the ratio maths", () => {
  it("agrees with the values WCAG defines", () => {
    // Without this, a broken formula would report every colour as passing.
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 3);
    expect(contrast("#767676", "#ffffff")).toBeGreaterThanOrEqual(4.5); // the classic AA boundary grey
    expect(contrast("#777777", "#ffffff")).toBeGreaterThan(contrast("#888888", "#ffffff"));
  });

  it("still reports the colour this test was written about as failing", () => {
    /*
     * slate-400 is the value that was in fifty-eight rules. If a future edit
     * makes the maths lenient enough to pass it, the guard has stopped
     * guarding, and this is the line that says so.
     */
    const slate400 = resolve("var(--color-slate-400)");
    expect(slate400).toBe("#94a3b8");
    expect(contrast(slate400, "#ffffff")).toBeLessThan(3);
    // And the old primary button: white on teal-600.
    expect(contrast("#ffffff", resolve("var(--color-teal-600)"))).toBeLessThan(AA_BODY);
  });
});

describe("text tokens clear AA on every surface they appear on", () => {
  for (const token of ["--text-muted", "--text-body", "--text-success", "--text-warning", "--text-danger"]) {
    for (const [name, bg] of Object.entries(SURFACES)) {
      it(`${token} on ${name}`, () => {
        const fg = resolve(`var(${token})`);
        const ratio = contrast(fg, bg);
        expect(
          ratio,
          `${token} (${fg}) on ${name} (${bg}) is ${ratio.toFixed(2)}:1, needs ${AA_BODY}:1`,
        ).toBeGreaterThanOrEqual(AA_BODY);
      });
    }
  }

  it("--text-success is readable on the pale teal tiles it is used on", () => {
    // Avatar initials and module icons sit on teal-50, not on white.
    const ratio = contrast(resolve("var(--text-success)"), resolve("var(--color-teal-50)"));
    expect(ratio, `teal text on teal-50 is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_BODY);
  });

  it("white on the primary surface clears AA", () => {
    // The main action button in the app. Teal-600 was 3.74:1.
    const ratio = contrast("#ffffff", resolve("var(--surface-primary)"));
    expect(ratio, `white on --surface-primary is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_BODY);
  });
});

describe("the muted colour does not creep back", () => {
  const styleFiles = fs
    .readdirSync(path.join(ROOT, "styles"))
    .filter((f) => f.endsWith(".css"))
    .map((f) => ({ file: f, src: fs.readFileSync(path.join(ROOT, "styles", f), "utf8") }));

  it("is reading the stylesheets it means to", () => {
    expect(styleFiles.length).toBeGreaterThan(5);
    expect(styleFiles.some((f) => f.src.includes("--text-muted"))).toBe(true);
  });

  it("uses no scale token directly as a text colour where a semantic one exists", () => {
    /*
     * `--color-slate-400` keeps its place in the scale for borders, dividers
     * and icon fills, where no contrast minimum applies. As `color:` it is the
     * bug this update fixed, so that exact pairing is the one thing barred.
     */
    const offenders = styleFiles.filter((f) => /color:\s*var\(--color-slate-400\)/.test(f.src)).map((f) => f.file);
    expect(offenders, "use --text-muted for muted text; slate-400 fails AA").toEqual([]);
  });

  it("does not fade a card full of text with opacity", () => {
    /*
     * `.kit-card.is-done { opacity: 0.7 }` multiplied every colour inside
     * toward the background and took the hint text to 1.88:1. Opacity cannot
     * tell text from decoration, so de-emphasis belongs on the surface.
     */
    const kit = fs.readFileSync(path.join(ROOT, "styles", "kit.css"), "utf8");
    const rule = kit.match(/\.kit-card\.is-done\s*\{[^}]*\}/);
    expect(rule, ".kit-card.is-done went missing — has the done state been renamed?").toBeTruthy();
    expect(rule![0]).not.toMatch(/opacity:/);
  });
});

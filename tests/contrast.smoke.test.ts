import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The text colours clear WCAG AA, computed rather than asserted by eye.
 *
 * ## What was wrong
 *
 * `--color-neutral-400` (then `--color-slate-400`) was the muted-text colour in
 * fifty-eight CSS rules. On a white card that was **2.56:1**, against AA's
 * 4.5:1 for body text. Inside a `.kit-card.is-done`, which faded the whole card
 * with `opacity: 0.7`, the same text landed at **1.88:1**. The "Complete" badge
 * was 2.98:1, the primary button's white-on-teal label 3.74:1, and the amber
 * figures 3.19:1.
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

/**
 * Angular distance between two hues, 0–180.
 *
 * Contrast answers "can this be read". It cannot answer "can these two be told
 * apart", which is a separate question and the one an orange brand raises: two
 * colours can both clear AA against white and still be the same colour to the
 * reader. Hue is the cheap stand-in for that.
 */
export function hueGap(a: string, b: string) {
  const hue = (hex: string) => {
    const [r, g, bl] = rgb(hex).map((v) => v / 255);
    const max = Math.max(r, g, bl);
    const min = Math.min(r, g, bl);
    const d = max - min;
    if (d === 0) return 0;
    const h = max === r ? ((g - bl) / d) % 6 : max === g ? (bl - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  };
  const raw = Math.abs(hue(a) - hue(b));
  return raw > 180 ? 360 - raw : raw;
}

const AA_BODY = 4.5;

/**
 * The surfaces text actually sits on in this app.
 *
 * The page surface is read from `--surface-page`, not from a step on the
 * neutral scale: v183 moved the page off `--color-neutral-50` so that a white
 * card has a ground to be raised above, and a test that kept measuring the old
 * step would have gone on passing while the real page got darker underneath
 * the same text.
 */
const SURFACES: Record<string, string> = {
  "card white": "#ffffff",
  "page surface": resolve("var(--surface-page)"),
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
    const muted400 = resolve("var(--color-neutral-400)");
    expect(contrast(muted400, "#ffffff")).toBeLessThan(3);
    /*
     * And the reason --surface-primary is a step darker than the brand fill.
     * Under the teal theme this was white-on-teal-600 at 3.74:1; the Banglalink
     * orange is lighter still, so brand-600 is 4.40:1 — closer, and just as
     * unusable. If a future palette makes this line pass, --surface-primary can
     * stop being a special case; until then it must not quietly become the fill.
     */
    expect(contrast("#ffffff", resolve("var(--color-brand-600)"))).toBeLessThan(AA_BODY);
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

  it("--text-brand is readable on the pale brand tiles it is used on", () => {
    // Avatar initials, chips and module icons sit on brand-50, not on white.
    const ratio = contrast(resolve("var(--text-brand)"), resolve("var(--surface-brand-tint)"));
    expect(ratio, `brand text on brand-50 is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_BODY);
  });

  it("a sheet's row icons are brand-coloured, not left over from the teal theme", () => {
    /*
     * `.kit-row-icon` carried `--text-success` from the palette this app was
     * built on before Banglalink, so every row icon in every sheet drew green
     * on a warm peach chip. Caught by looking at the navigation sheet on a
     * phone, not by any test — so here is the test.
     */
    // Comments stripped first: the rule's own note names the colour it moved
    // away from, which a naive match would read as the declaration.
    const kit = fs.readFileSync(path.join(ROOT, "styles", "kit.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
    const rule = kit.match(/\.kit-row > \.kit-row-icon\s*\{([\s\S]*?)\}/)![1];
    expect(rule, "a green icon on a brand chip").not.toMatch(/color:\s*var\(--text-success\)/);
    expect(rule).toMatch(/color:\s*var\(--text-brand\)/);
  });

  it("--text-success is readable on its own pale tile", () => {
    // "On track", "Complete", "Online" — a green figure on a green tint.
    const ratio = contrast(resolve("var(--text-success)"), resolve("var(--color-success-50)"));
    expect(ratio, `success text on success-50 is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_BODY);
  });

  it("keeps the brand apart from the colour that means 'nearly there'", () => {
    /*
     * A Banglalink-specific hazard, and the reason the amber scale moved.
     *
     * The brand is an orange; "near target" was a burnt orange (#b45309) three
     * degrees of hue away from it. Side by side in a summary strip — "Flagged"
     * beside "On Track" — they were the same colour to anyone not looking for
     * the difference, which defeats the point of colouring them at all.
     *
     * Distance in sRGB is a crude measure, but it is the one that fails loudly
     * if someone re-values either scale back toward the other.
     */
    const gap = hueGap(resolve("var(--text-brand)"), resolve("var(--text-warning)"));
    expect(gap, `--text-brand and --text-warning are ${gap.toFixed(0)}° apart in hue`).toBeGreaterThan(18);

    /*
     * The yardstick, and the reason this is measured in degrees rather than in
     * sRGB distance. The two colours it must separate are both dark and both
     * muted, so straight-line distance barely moves between a pair that is
     * obviously confusable and a pair that is not: the old brand/amber pairing
     * is 33 apart and the new one 47, which says almost nothing. In hue the
     * same two pairings are 7° and 23° — the difference you actually see.
     */
    expect(hueGap("#a63c0c", "#b45309"), "the pairing this rule replaced").toBeLessThan(10);
  });

  it("keeps 'achieved' off the brand scale entirely", () => {
    /*
     * Under the teal theme, brand and success were the same colour and that was
     * fine — teal reads as "good". An orange does not, so the bands moved to
     * green. If someone points --band-achieved back at the brand, a chart full
     * of orange bars stops distinguishing "hit target" from "this is the
     * company colour".
     */
    const achieved = resolve("var(--band-achieved)");
    for (const step of [400, 500, 600, 700])
      expect(achieved, `--band-achieved is the brand's own ${step}`).not.toBe(resolve(`var(--color-brand-${step})`));
    expect(achieved).toBe(resolve("var(--color-success-600)"));
  });

  it("white on the primary surface clears AA", () => {
    // The main action button in the app. Teal-600 was 3.74:1.
    const ratio = contrast("#ffffff", resolve("var(--surface-primary)"));
    expect(ratio, `white on --surface-primary is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_BODY);
  });
});

describe("the brand's fill steps are never used as text", () => {
  /*
   * The rule the token file states, enforced.
   *
   * Orange is a light hue. `--color-brand-600` is 4.40:1 on white — it looks
   * perfectly solid, it is the right colour for a bar or a dot, and as text it
   * is under AA. The teal theme had the same split and the same trap at a
   * different number, and six rules walked into it the moment the palette
   * changed underneath them: the login overline, the help link, three figure
   * tones and an icon. None of them was touched by the retheme; they simply
   * asked for "the brand fill" and the brand fill got lighter.
   *
   * So: on a light surface, brand and accent below -700 may paint anything
   * except text. `--text-brand` is the text step and it is one token away.
   *
   * The dark chrome is exempt by hue rather than by hand: -200 and -300 exist
   * precisely to be read off ink-950, where they measure 10:1 and better.
   */
  const LIGHT_TEXT_STEPS = [400, 500, 600];

  const styleFiles = fs
    .readdirSync(path.join(ROOT, "styles"))
    .filter((f) => f.endsWith(".css"))
    .map((f) => ({ file: f, src: fs.readFileSync(path.join(ROOT, "styles", f), "utf8") }));

  it("is looking at the right token steps", () => {
    // If the scale is renumbered and these steps stop existing, the sweep below
    // would pass by matching nothing at all.
    for (const step of LIGHT_TEXT_STEPS) {
      expect(TOKEN.has(`--color-brand-${step}`), `--color-brand-${step}`).toBe(true);
      expect(contrast("#ffffff", resolve(`var(--color-brand-${step})`))).toBeLessThan(AA_BODY);
    }
  });

  it("finds none in the stylesheets", () => {
    const offenders: string[] = [];
    for (const { file, src } of styleFiles)
      for (const scale of ["brand", "accent"])
        for (const step of LIGHT_TEXT_STEPS) {
          const re = new RegExp(`(^|[^-])color:\\s*var\\(--color-${scale}-${step}\\)`, "gm");
          for (const _ of src.matchAll(re)) offenders.push(`${file}: color: var(--color-${scale}-${step})`);
        }
    expect(offenders, `use --text-brand (brand-700) for brand text:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });

  it("would notice one if it came back", () => {
    /*
     * The guard above passes trivially if the regex is wrong, and its `[^-]`
     * prefix — there to stop `border-color:` and `background-color:` matching —
     * is exactly the kind of detail that silently stops matching anything. So
     * it is run against a line known to be bad, and against the two it must not
     * flag.
     */
    const bad = "  .x { color: var(--color-brand-600); }";
    const fine = [
      "  .x { border-color: var(--color-brand-600); }",
      "  .x { background-color: var(--color-accent-500); }",
    ];
    const re = /(^|[^-])color:\s*var\(--color-(brand|accent)-(400|500|600)\)/gm;
    expect([...bad.matchAll(re)]).toHaveLength(1);
    for (const line of fine) expect([...line.matchAll(re)], line).toHaveLength(0);
  });
});

describe("a status colour that has never been on screen is still checked", () => {
  /*
   * How `.kit-pace-status` stayed under AA for the life of the app.
   *
   * It asked for `var(--band-achieved)` — an ALIAS for `--color-success-600`,
   * 3.77:1 on white at 11px bold. `--band-near` was 3.69:1 on the next line.
   * Two things hid it:
   *
   *   - The v166 sweep matches token NAMES (`--color-brand-500` and its
   *     siblings). An alias spells nothing it looks for.
   *   - axe measures what is actually rendered, and the seeded data never
   *     reached a target, so "Achieved" and "At risk" were never on a page
   *     while anything was measuring. The browser sweep was green across
   *     seven roles and every route because the failing state did not exist.
   *
   * The first version of this guard swept every `color:` in every stylesheet,
   * resolved it and measured it against white. It produced nine hits, of which
   * two were real: the rest were decorative icons (1.4.11 wants 3:1, not 4.5),
   * a 20px bold figure that is large text by definition, and four rules on the
   * dark sidebar where `--text-muted-dark` measures 8.41:1 and is correct.
   * Wrong instrument — the same mistake v166 made with sRGB distance, and axe
   * already does that job properly for anything that renders.
   *
   * What axe cannot do is look at a state nobody has produced yet. So this
   * checks the pacing statuses by ENUMERATING them, not by waiting for one.
   */
  const styleFiles = fs
    .readdirSync(path.join(ROOT, "styles"))
    .filter((f) => f.endsWith(".css"))
    .map((f) => ({ file: f, src: fs.readFileSync(path.join(ROOT, "styles", f), "utf8") }));

  const KIT = fs.readFileSync(path.join(ROOT, "styles", "kit.css"), "utf8");

  it("every pacing status clears AA, including the ones today's data never shows", () => {
    /*
     * `riskTone` maps four statuses onto four tones. Each tone's colour is read
     * out of the stylesheet and measured, so a status that no seeded row can
     * currently produce is held to the same standard as the one on screen.
     */
    const tones = ["good", "mid", "low", "neutral"];
    const failures: string[] = [];
    for (const tone of tones) {
      const rule = KIT.match(new RegExp(`\\.kit-pace\\.tone-${tone} \\.kit-pace-status \\{([^}]*)\\}`));
      expect(rule, `no .kit-pace.tone-${tone} rule — has the tone list changed?`).toBeTruthy();
      const token = rule![1].match(/color:\s*(var\(--[\w-]+\))/)?.[1];
      expect(token, `tone-${tone} sets no colour`).toBeTruthy();
      const hex = resolve(token!);
      const ratio = contrast("#ffffff", hex);
      if (ratio < AA_BODY) failures.push(`tone-${tone}: ${token} = ${hex} (${ratio.toFixed(2)}:1)`);
    }
    expect(
      failures,
      `the pacing line is 11px — not large text — so these need a --text-* step:\n  ${failures.join("\n  ")}`,
    ).toEqual([]);
  });

  it("resolves an alias all the way down before judging it", () => {
    // The instrument, proved against a value known to be a fill step. Without
    // this the sweep above could pass by resolving everything to the same
    // unreadable string and comparing it with itself.
    expect(resolve("var(--band-achieved)")).toBe(resolve("var(--color-success-600)"));
    expect(contrast("#ffffff", resolve("var(--band-achieved)"))).toBeLessThan(AA_BODY);
    expect(contrast("#ffffff", resolve("var(--text-success)"))).toBeGreaterThanOrEqual(AA_BODY);
  });

  it("the band tokens are fills, and say so by never being text", () => {
    /*
     * The rule stated directly, which is what actually caught this. A `--band-*`
     * colours a ring, a bar or a dot; each has a `--text-*` counterpart one
     * token away. `--band-behind` is 4.70:1 and would survive a measurement —
     * it is banned anyway, because "this one happens to clear AA" is how the
     * other two came to be written.
     */
    for (const { file, src } of styleFiles)
      expect(src, `${file} uses a band fill as text — use --text-success / --text-warning / --text-danger`).not.toMatch(
        /(^|[^-])color:\s*var\(--band-/m,
      );
  });
});

describe("nothing white is written on the bright gradient", () => {
  /*
   * The failure axe structurally cannot see.
   *
   * `--grad-brand` is the mark: #f26722 into #fba919. White on that amber is
   * **1.95:1**. Three elements were sitting on it — the sidebar's brand letter,
   * the auth pages' logo tile, and every avatar's initials — and the browser
   * sweep passed every time, because axe cannot compute a ratio against a
   * background-image and reports those elements as "incomplete" rather than
   * failing them. A gradient is a blind spot in the tool, so it needs a guard
   * that reads the source instead.
   *
   * `--text-on-brand` is the answer and it clears AA at BOTH ends of the ramp,
   * so it cannot fail wherever the gradient happens to land under a glyph.
   */
  const styleFiles = fs
    .readdirSync(path.join(ROOT, "styles"))
    .filter((f) => f.endsWith(".css"))
    .map((f) => ({ file: f, src: fs.readFileSync(path.join(ROOT, "styles", f), "utf8") }));

  /** Every `{ ... }` block, with its selector, flattened out of a stylesheet. */
  function rules(src: string) {
    const out: { selector: string; body: string }[] = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    for (const m of src.matchAll(re)) out.push({ selector: m[1].trim(), body: m[2] });
    return out;
  }

  it("clears AA at both ends of the ramp", () => {
    // The claim the token makes about itself, computed.
    const fg = resolve("var(--text-on-brand)");
    for (const stop of ["--color-brand-500", "--color-glow-400"]) {
      const ratio = contrast(fg, resolve(`var(${stop})`));
      expect(ratio, `--text-on-brand on ${stop} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_BODY);
    }
    // And the colour it replaced, still failing, so this is not a tautology.
    expect(contrast("#ffffff", resolve("var(--color-glow-400)"))).toBeLessThan(2.5);
  });

  it("finds no rule pairing --grad-brand with white text", () => {
    const offenders: string[] = [];
    for (const { file, src } of styleFiles)
      for (const r of rules(src))
        if (
          /background(-image)?:\s*var\(--grad-brand\)/.test(r.body) &&
          /(^|[^-])color:\s*(#fff(f{3})?\b|white\b)/i.test(r.body)
        )
          offenders.push(`${file}: ${r.selector}`);
    expect(offenders, `use --text-on-brand on --grad-brand:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });

  it("would notice one if it came back", () => {
    /*
     * Two regexes and a hand-rolled rule splitter — plenty of room for a guard
     * that matches nothing and reports success. So it is run against the exact
     * shape it is looking for, and against the three it must not flag.
     */
    const find = (css: string) =>
      rules(css).filter(
        (r) =>
          /background(-image)?:\s*var\(--grad-brand\)/.test(r.body) &&
          /(^|[^-])color:\s*(#fff(f{3})?\b|white\b)/i.test(r.body),
      );
    expect(find(".x { background: var(--grad-brand); color: white; }")).toHaveLength(1);
    expect(find(".x { background-image: var(--grad-brand); color: #fff; }")).toHaveLength(1);
    // The legitimate shapes.
    expect(find(".x { background: var(--grad-brand); color: var(--text-on-brand); }")).toHaveLength(0);
    expect(find(".x { background: var(--grad-brand-strong); color: white; }")).toHaveLength(0);
    expect(find(".x { background: var(--grad-brand); border-color: white; }")).toHaveLength(0);
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
     * `--color-neutral-400` keeps its place in the scale for borders, dividers
     * and icon fills, where no contrast minimum applies. As `color:` it is the
     * bug that update fixed, so that exact pairing is the one thing barred.
     */
    const offenders = styleFiles.filter((f) => /color:\s*var\(--color-neutral-400\)/.test(f.src)).map((f) => f.file);
    expect(offenders, "use --text-muted for muted text; neutral-400 fails AA").toEqual([]);
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

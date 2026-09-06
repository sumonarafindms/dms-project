import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * One button component, not twenty-six copies of its class string.
 *
 * ## What was wrong
 *
 * `Btn` exists, and it is one line of logic:
 *
 *     className={`kit-btn is-${variant} size-${size}${block ? " is-block" : ""} …`}
 *
 * Twenty-six `<button>` elements skipped it and wrote that string out by hand —
 * `<button className="kit-btn is-primary size-md">`. Every one rendered
 * identically, so nothing looked broken, and that is exactly why it lasted.
 *
 * The cost is not tidiness, it is reach. Roughly nine in ten of this app's
 * users are RSOs and BPs on a phone, and `expectUsableTapTargets` in the E2E
 * suite already polices a minimum touch size. The day that minimum needs a
 * `min-height` on buttons, or a busy state needs `aria-busy` while a save is in
 * flight, the change lands in `Btn` — and would have reached two buttons out of
 * twenty-eight. A fix that silently covers a fraction of the screens is worse
 * than no fix, because it looks done.
 *
 * ## The other element
 *
 * v147 left fifteen `<Link>`/`<a>` elements hand-writing the same string, on
 * the grounds that `Btn` renders a `<button>` and a link is not a button —
 * turning a navigation into one loses middle-click, open-in-new-tab and its
 * meaning to a screen reader. That reasoning was right about the TAG and wrong
 * to stop there: the class formula was still copied out twenty-one times.
 *
 * v148 adds `LinkBtn`, which shares `btnClass` with `Btn` and differs only in
 * what it renders — `next/link` normally, a plain `<a>` for downloads and the
 * deliberate full reload out of the error boundary, a `<span>` for a pager's
 * dead end. One formula, three tags, no hand-written strings.
 */

const ROOT = path.join(__dirname, "..");
const rel = (f: string) => path.relative(ROOT, f);

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx$/.test(e.name)) acc.push(full);
  }
  return acc;
}

/**
 * Every `<button …>` opening tag in a source file.
 *
 * Written as a scanner rather than a regex because `/<button[^>]*>/` is WRONG
 * here, and wrong in a way that already cost this project real time: an
 * attribute like `onClick={() => setFile(null)}` contains `>`, so the match
 * ends inside the tag. The refactor's own sed used that pattern and silently
 * skipped every button whose className sat after an arrow function — two of
 * them — leaving a job that looked finished and was not.
 *
 * So: walk forward from `<button`, and end only at a `>` that is outside
 * quotes and at brace depth zero.
 */
export function buttonTags(src: string): string[] {
  const out: string[] = [];
  const re = /<button\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 0;
    let quote: string | null = null;
    for (let i = m.index; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        if (c === quote && src[i - 1] !== "\\") quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) {
        out.push(src.slice(m.index, i + 1));
        break;
      }
    }
  }
  return out;
}

const FILES = sourceFiles(path.join(ROOT, "app")).map((file) => ({
  file,
  src: fs.readFileSync(file, "utf8"),
}));

describe("the button scanner", () => {
  it("ends the tag at the right angle bracket", () => {
    // The bug this replaced: `[^>]*` stops at the `>` inside `=>`.
    const src = `<button type="button" onClick={() => setFile(null)} className="kit-btn is-ghost size-md">Cancel</button>`;
    const [tag] = buttonTags(src);
    expect(tag).toContain("kit-btn");
    expect(tag.endsWith(">")).toBe(true);
    expect(/<button[^>]*>/.exec(src)?.[0]).not.toContain("kit-btn"); // the old, broken way
  });

  it("finds every button, including multi-line ones", () => {
    const src = `<button\n  type="submit"\n  className="kit-btn is-primary size-md"\n>\nGo\n</button>\n<button className="other">x</button>`;
    const tags = buttonTags(src);
    expect(tags).toHaveLength(2);
    expect(tags[0]).toContain("kit-btn");
    expect(tags[1]).not.toContain("kit-btn");
  });

  it("is reading the source it means to", () => {
    expect(FILES.length).toBeGreaterThan(60);
    expect(FILES.some((f) => f.src.includes("<button"))).toBe(true);
  });
});

describe("no button hand-writes the kit's classes", () => {
  it("routes every kit-styled button through Btn", () => {
    const offenders = FILES.flatMap((f) =>
      buttonTags(f.src)
        .filter((t) => t.includes("kit-btn"))
        // Btn itself is where the class string is allowed to live.
        .filter(() => rel(f.file) !== path.join("app", "components", "Kit.tsx"))
        .map((t) => `${rel(f.file)}: ${t.replace(/\s+/g, " ").slice(0, 90)}`),
    ).sort();
    expect(offenders, "use <Btn variant= size=> instead of hand-writing kit-btn on a <button>").toEqual([]);
  });

  it("keeps Btn as the single place that builds the class", () => {
    const kit = fs.readFileSync(path.join(ROOT, "app", "components", "Kit.tsx"), "utf8");
    expect(kit).toMatch(/export function Btn\(/);
    expect(kit).toMatch(/kit-btn is-\$\{variant\} size-\$\{size\}/);
  });

  it("does not let a wrapper take a className in place of a variant", () => {
    /*
     * ConfirmActionButton used to accept `className` and its one caller passed
     * `kit-btn size-sm is-danger`. A component that forwards an arbitrary class
     * string is the same drift wearing a component's clothes — it renders a
     * button that Btn knows nothing about.
     */
    const src = fs.readFileSync(path.join(ROOT, "app", "components", "ConfirmActionButton.tsx"), "utf8");
    expect(src).toMatch(/<Btn\b/);
    expect(src).not.toMatch(/className\?: string/);
    expect(src).toMatch(/variant\?:/);
  });
});

describe("link-buttons go through LinkBtn", () => {
  it("leaves no anchor or link hand-writing the class", () => {
    const offenders = FILES.flatMap((f) =>
      [...f.src.matchAll(/<(?:Link|a|span)\b[^>]*className=(?:"|\{`)kit-btn[^"`]*/g)].map(
        (m) => `${rel(f.file)}: ${m[0].replace(/\s+/g, " ").slice(0, 90)}`,
      ),
    ).sort();
    expect(offenders, "use <LinkBtn href= variant= size=> instead of hand-writing kit-btn on a link").toEqual([]);
  });

  it("still renders links as links, not as buttons", () => {
    /*
     * The point of a separate component rather than an `as` prop on `Btn`:
     * `LinkBtn` must keep emitting a real anchor. If it ever renders a
     * `<button>`, middle-click, open-in-new-tab and the element's meaning to a
     * screen reader all go with it — and the guard above would still pass,
     * because no class string would have been hand-written.
     */
    const kit = fs.readFileSync(path.join(ROOT, "app", "components", "Kit.tsx"), "utf8");
    const fn = kit.slice(kit.indexOf("export function LinkBtn"));
    expect(fn).toMatch(/<Link\b/);
    expect(fn.slice(0, fn.indexOf("\n}\n"))).not.toMatch(/<button\b/);
  });

  it("builds both components' classes from one formula", () => {
    // The whole reason LinkBtn exists rather than a second copy of the string.
    const kit = fs.readFileSync(path.join(ROOT, "app", "components", "Kit.tsx"), "utf8");
    expect(kit).toMatch(/function btnClass\(/);
    expect([...kit.matchAll(/`kit-btn is-\$\{variant\} size-\$\{size\}/g)]).toHaveLength(1);
    expect(kit).toMatch(/export function Btn\([^)]*\)[^{]*\{\s*return <button \{\.\.\.props\} className=\{btnClass\(/);
  });
});

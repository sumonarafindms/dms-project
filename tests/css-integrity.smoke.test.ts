import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards against one specific, recurring failure: a CSS comment that does not
 * close, so the rules after it are swallowed as comment text and silently stop
 * applying.
 *
 * It has happened three times. In v101 a regex CSS stripper ate a closing
 * delimiter in premium.css and took two rules with it — undetected for
 * fourteen versions, because a swallowed rule is still valid CSS. In v115 the
 * comment written to explain that repair spelled the closing delimiter out
 * inside its own body, ended early, and turned its own remaining text into a
 * selector that swallowed the prefers-reduced-motion block. Nothing in the
 * build fails on any of this: browsers and bundlers accept it happily.
 *
 * So: prose in code position is the signature, and these three checks catch it
 * without adding a CSS parser to the dependency list.
 */

const STYLES = join(__dirname, "..", "styles");
const files = readdirSync(STYLES).filter((f) => f.endsWith(".css"));

/** Remove every /* … *\/ comment, returning only what a browser reads as code. */
function stripComments(css: string) {
  let out = "";
  let i = 0;
  while (i < css.length) {
    if (css[i] === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      // An unterminated comment swallows the rest of the file — the exact bug.
      if (end === -1) return { code: out, unterminated: true };
      i = end + 2;
      continue;
    }
    out += css[i++];
  }
  return { code: out, unterminated: false };
}

describe("stylesheet integrity", () => {
  it("finds the stylesheets", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const file of files) {
    describe(file, () => {
      const css = readFileSync(join(STYLES, file), "utf8");
      const { code, unterminated } = stripComments(css);

      it("has no unterminated comment", () => {
        expect(unterminated).toBe(false);
      });

      it("balances its braces", () => {
        const open = (code.match(/\{/g) || []).length;
        const close = (code.match(/\}/g) || []).length;
        expect(`${open} open / ${close} close`).toBe(`${open} open / ${open} close`);
      });

      it("has no prose outside a comment", () => {
        // A backtick only ever appears in this project's prose. Finding one in
        // code position means a comment ended early and its text is now being
        // read as a selector.
        const line = code.split("\n").findIndex((l) => l.includes("`"));
        expect(
          line === -1 ? "clean" : `backtick in code at stripped line ${line + 1}: ${code.split("\n")[line].trim()}`,
        ).toBe("clean");
      });

      it("has no rule whose selector reads like a sentence", () => {
        // Punctuation a selector cannot contain but prose always does. Kept
        // narrow on purpose: `table thead th` is three lowercase words and is
        // a perfectly good selector, so word-counting is not the test.
        const bad = code
          .split("}")
          .map((chunk) => chunk.split("{")[0])
          .filter((sel) => /[a-z]\. [a-z]/i.test(sel) || /[?!]/.test(sel) || sel.includes("—"))
          .map((sel) => sel.trim().replace(/\s+/g, " ").slice(0, 80));
        expect(bad).toEqual([]);
      });
    });
  }
});

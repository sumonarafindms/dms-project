import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { rel as relativeTo, toPosix } from "./paths";

/**
 * The test suite must run on Windows, not only on the Linux boxes it is
 * usually run on.
 *
 * ## What happened
 *
 * The static guards walk the source tree and compare file paths against
 * strings like `"app/components/Kit.tsx"`. `path.relative` returns
 * `app\components\Kit.tsx` on Windows, so three of them failed at once — on the
 * owner's machine, during the pre-deploy check, minutes before a release:
 *
 *     AssertionError: expected [ 'app\components\Kit.tsx' ]
 *                     to deeply equal [ 'app/components/Kit.tsx' ]
 *
 * Nothing was wrong with the application. Every one of those guards had been
 * green on Linux for months and would have stayed green forever.
 *
 * ## Why a static guard rather than "remember to use the helper"
 *
 * This is the failure mode this suite keeps running into from different
 * directions: **a defect that is invisible on the machine where the tests
 * run.** A CSP listener that was never read reported zero violations; a guard
 * that searched for two strings independently passed while the code was
 * broken; an export helper's comment promised something the code did not do.
 * In every case the check itself had to be checked.
 *
 * A path bug is the same shape. Running the suite on Linux cannot detect it,
 * so nothing but a rule about the source will. That rule is: any test that
 * turns a filesystem path into a string goes through `tests/paths.ts`.
 *
 * The cost of getting this wrong is not a broken app — it is a wall of red at
 * the exact moment someone is deciding whether it is safe to deploy, which is
 * when a false alarm does the most damage to their judgement.
 */

const TESTS = path.join(__dirname);

const testFiles = () =>
  fs
    .readdirSync(TESTS)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => ({ name: f, src: fs.readFileSync(path.join(TESTS, f), "utf8") }));

/** Source with comments stripped, so a comment explaining the rule is not read as breaking it. */
const codeOf = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the guards run on every platform", () => {
  it("has no test calling path.relative directly", () => {
    const offenders = testFiles()
      .filter((f) => f.name !== "paths.ts")
      .filter((f) => /\bpath\.relative\s*\(/.test(codeOf(f.src)))
      .map((f) => f.name);
    expect(
      offenders,
      `these tests build paths with native separators and will fail on Windows:\n  ${offenders.join("\n  ")}\n` +
        `Use \`rel(ROOT)(file)\` from ./paths instead.`,
    ).toEqual([]);
  });

  it("normalises Windows separators", () => {
    /*
     * A real assertion on Linux, which is the only place it will be run.
     * `toPosix` splits on a literal backslash rather than `path.sep`; with
     * `path.sep` this whole test would be the identity on Linux and could
     * never have failed — a guard that cannot fail where it runs is the
     * thing this file exists to prevent.
     */
    expect(toPosix("app\\components\\Kit.tsx")).toBe("app/components/Kit.tsx");
    expect(toPosix("app\\api\\auth\\login\\route.ts")).toBe("app/api/auth/login/route.ts");
    expect(toPosix("app/components/Kit.tsx")).toBe("app/components/Kit.tsx");
  });

  it("produces repo-relative paths with forward slashes", () => {
    const r = relativeTo(path.join(__dirname, ".."));
    expect(r(path.join(__dirname, "..", "app", "components", "Kit.tsx"))).toBe("app/components/Kit.tsx");
    expect(r(path.join(__dirname, "..", "lib", "report-builders.ts"))).toBe("lib/report-builders.ts");
  });

  it("has no test transforming a .tsx module inside a test body", () => {
    /*
     * The second Windows-only failure, and the same shape as the first.
     *
     * A `.tsx` module has to be transformed by Vite before it can be imported.
     * At the top of a file that cost belongs to `collect`, which has no
     * per-test stopwatch. Inside a test body it belongs to the test, and on the
     * owner's Windows machine — `transform 19.7s` against 1.5s here — nine
     * assertions against a pure function took 5.14 seconds and blew the 5s
     * default. The code was correct, the test was correct, and the only thing
     * wrong was where the import was written.
     *
     * `testTimeout` in vitest.config.ts is now 30s, so this would no longer
     * fail. That is not a reason to allow it: a test whose duration is
     * dominated by a first-time transform is measuring the disk.
     */
    const offenders = testFiles()
      .filter((f) => f.name !== "test-portability.smoke.test.ts")
      .filter(
        (f) =>
          /await\s+import\s*\(\s*["'][^"']*\.tsx?["']\s*\)/.test(codeOf(f.src)) ||
          /await\s+import\s*\(\s*["']\.\.\/app\/[^"']*["']\s*\)/.test(codeOf(f.src)),
      )
      .map((f) => f.name);
    expect(
      offenders,
      `these tests pay a Vite transform inside a test body and will be slow or flaky on Windows:\n  ${offenders.join("\n  ")}\n` +
        `Import the module at the top of the file instead.`,
    ).toEqual([]);
  });

  it("compares paths only against forward-slash literals", () => {
    /*
     * A test could normalise correctly and still be wrong the other way round,
     * by comparing against a literal someone typed with backslashes. There are
     * none today; this keeps it that way.
     *
     * The first version of this pattern did not bite when mutated: it stopped
     * at the SECOND separator, so `"app\\components\\Kit.tsx"` slipped
     * through while `"app\\components"` would have been caught. Matching the
     * whole quoted string is what makes it a real check.
     */
    const offenders = testFiles()
      .filter((f) => f.name !== "test-portability.smoke.test.ts" && f.name !== "paths.ts")
      .filter((f) => /"[^"\n]*\\\\[^"\n]*\.(?:ts|tsx|css)"/.test(codeOf(f.src)))
      .map((f) => f.name);
    expect(offenders, `these tests compare against backslash paths: ${offenders.join(", ")}`).toEqual([]);
  });
});

import path from "node:path";

/**
 * Repo-relative file paths for the static guards, always with `/` separators.
 *
 * ## The bug this exists to prevent
 *
 * Most guards in this suite walk the source tree and report or compare file
 * paths. They were written with `path.relative(ROOT, file)`, which returns
 * `app/api/auth/login/route.ts` on Linux and
 * `app\api\auth\login\route.ts` on Windows.
 *
 * Every one of those guards passed in CI and on the build sandbox, both Linux,
 * for months. Run on the owner's Windows machine before a deploy, three of them
 * failed at once:
 *
 *     - "app/api/auth/login/route.ts"
 *     + "app\\api\\auth\\login\\route.ts"
 *
 * Nothing was wrong with the app. The suite simply could not run on the
 * platform the person deploying it uses, which is close to the worst moment to
 * discover it — a wall of red immediately before a release, none of it real.
 *
 * ## The rule
 *
 * A guard that turns a filesystem path into a string it compares, matches or
 * prints must go through `rel()` or `toPosix()` here. Raw `path.relative` in a
 * test is a portability bug waiting for someone on Windows, and
 * `tests/test-portability.smoke.test.ts` fails on it.
 *
 * This is not about supporting Windows for its own sake. It is that a test
 * which only passes on the machine it was written on is not a test of the
 * codebase; it is a test of the machine.
 */

/**
 * Backslashes to `/`. Already-POSIX paths pass through unchanged.
 *
 * Deliberately `\\` rather than `path.sep`. With `path.sep` this function is
 * the identity on Linux, which means the test asserting it works could only
 * ever have been a tautology on the machine that runs it — the same
 * can't-fail-where-it-runs trap the rest of this suite keeps finding. Rewritten
 * this way, `toPosix("app\\components\\Kit.tsx")` is a real assertion
 * everywhere. A backslash is not a legal filename character on Windows and is
 * vanishingly rare on Linux, so replacing every one is safe.
 */
export const toPosix = (p: string) => p.replace(/\\/g, "/");

/** `rel(ROOT)(file)` → `"app/it/reports/lso/page.tsx"` on every platform. */
export const rel = (root: string) => (file: string) => toPosix(path.relative(root, file));

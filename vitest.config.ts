import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * `testTimeout` is 30s, not Vitest's 5s default, and the reason is Windows.
 *
 * The suite is written on Linux and run for real on the owner's Windows
 * machine, minutes before a deploy. The same run that takes `transform 1.5s`
 * here took **19.7s** there, and `collect 3.8s` became **74.6s** — NTFS plus a
 * virus scanner on every one of a few thousand module reads.
 *
 * Nothing in this suite is slow. What is slow is Vite transforming a `.tsx`
 * module graph for the first time, and when a test triggers that transform
 * inside its own body the whole cost lands inside the per-test budget. One
 * assertion-only test — nine `expect`s against a pure function — spent 5.14s
 * of its 5s on a dynamic `import()` and failed, on the owner's machine, at the
 * exact moment they were deciding whether it was safe to ship. Every other
 * platform was green and would have stayed green forever.
 *
 * That is the failure this project keeps meeting from new directions: a defect
 * invisible on the machine where the tests run. `tests/test-portability.smoke.test.ts`
 * exists for the path-separator version of it and now also guards the shape
 * that caused this one — a `.tsx` imported inside a test body rather than at
 * the top, where its cost belongs to `collect` and not to a 5s stopwatch.
 *
 * This timeout is the belt to that guard's braces. A real hang still fails,
 * six times slower; a slow disk no longer reads as a broken build.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});

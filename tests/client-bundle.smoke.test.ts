import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * No client component may reach Prisma, however indirectly.
 *
 * ## How this bug looks
 *
 * It does not look like anything. The page renders, the tests pass, the types
 * check, and the build succeeds — because `@prisma/client` ships a browser
 * build made of stubs that throw only if you actually call them. Nothing calls
 * them. So the only symptom is roughly 50KB of dead JavaScript downloaded and
 * parsed by every visitor, and the only place it is visible is the bundle.
 *
 * ## The one that was found
 *
 * `EmployeeDetailView` is a client component and imported `pct` from
 * `lib/performance.ts` — four characters of arithmetic. `lib/performance.ts`
 * imports `./prisma` on its first line. That single import put Prisma's
 * browser stub on every employee detail page: `/supervisor/rsos/[id]` was
 * 151KB and is 135KB now that `pct` comes from `lib/achievement.ts` instead.
 *
 * The rule was already written down — `Kit.tsx` and `bp-period.ts` both carry
 * comments about keeping Prisma out of the browser — and it was still broken,
 * because a comment cannot be checked. This can.
 *
 * ## What "reach" means
 *
 * A VALUE import, followed transitively. `import type { … }` is erased by the
 * compiler and carries nothing into the bundle, which is exactly why
 * `Kit.tsx` may hold `import type { MetricComparison } from "./comparison-data"`
 * even though that module imports Prisma.
 */

const ROOT = path.join(__dirname, "..");
const rel = (f: string) => path.relative(ROOT, f);

function sourceFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(e.name)) acc.push(full);
  }
  return acc;
}

/**
 * The modules a file pulls into the bundle: relative and `@/` specifiers,
 * value imports only.
 */
function valueImports(file: string): string[] {
  const src = fs.readFileSync(file, "utf8");
  const out: string[] = [];
  const re = /import\s+(type\s+)?([\s\S]*?)\s*from\s*["']([^"']+)["']/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const [, typeKeyword, clause, specifier] = m;
    if (typeKeyword) continue; // `import type { … } from` — erased.
    if (!specifier.startsWith(".") && !specifier.startsWith("@/")) continue;
    // `import { type A, type B }` is erased too; a single non-type specifier
    // is enough to pull the module in.
    const named = /^\{([\s\S]*)\}$/.exec(clause.trim());
    if (named && named[1].trim() && named[1].split(",").every((s) => /^\s*type\s/.test(s))) continue;
    out.push(specifier);
  }
  return out;
}

function resolve(fromFile: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? path.join(ROOT, specifier.slice(2))
    : path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")])
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  return null;
}

/** A module that puts Prisma in whatever bundle it lands in. */
function importsPrisma(file: string): boolean {
  const src = fs.readFileSync(file, "utf8");
  return /^\s*import\s+(?!type\s)[^;]*from\s*["']@prisma\/client["']/m.test(src);
}

/** First path from `entry` to a Prisma-importing module, or null. */
function pathToPrisma(entry: string): string[] | null {
  const seen = new Set<string>([entry]);
  const queue: string[][] = [[entry]];
  while (queue.length) {
    const trail = queue.shift()!;
    const file = trail[trail.length - 1];
    if (file !== entry && importsPrisma(file)) return trail;
    for (const specifier of valueImports(file)) {
      const next = resolve(file, specifier);
      if (!next || seen.has(next)) continue;
      seen.add(next);
      queue.push([...trail, next]);
    }
  }
  return null;
}

const CLIENT_FILES = sourceFiles(path.join(ROOT, "app")).filter((f) =>
  /^\s*["']use client["']/m.test(fs.readFileSync(f, "utf8")),
);

describe("Prisma never reaches the browser", () => {
  it("finds the client components it is meant to police", () => {
    // If a refactor changed how client components are marked, this suite would
    // otherwise pass by checking nothing.
    expect(CLIENT_FILES.length).toBeGreaterThanOrEqual(10);
  });

  it("has no client component importing a Prisma-touching module", () => {
    const offenders = CLIENT_FILES.map((f) => ({ f, trail: pathToPrisma(f) }))
      .filter((x) => x.trail)
      .map((x) => x.trail!.map(rel).join("\n    → "));
    expect(offenders, "take the maths from lib/achievement, lib/pacing or lib/comparison instead").toEqual([]);
  });

  it("still detects a leak when one is introduced", () => {
    // The detector itself, checked against a module known to import Prisma.
    // Without this, a broken resolver would make the test above vacuous.
    const known = path.join(ROOT, "lib", "report-data.ts");
    expect(fs.existsSync(known)).toBe(true);
    expect(pathToPrisma(known)).not.toBeNull();
  });

  it("does not count type-only imports as a leak", () => {
    // Kit.tsx imports MetricComparison as a type from a Prisma-importing
    // module. That is correct and must stay allowed.
    const kit = path.join(ROOT, "app", "components", "Kit.tsx");
    expect(fs.readFileSync(kit, "utf8")).toMatch(/import type \{ MetricComparison \}/);
    expect(pathToPrisma(kit)).toBeNull();
  });
});

describe("the percentage rule has one owner", () => {
  it("is not redefined in lib/performance.ts", () => {
    // It was, byte-identical to targetPercent, and being in a Prisma-touching
    // module is what made the duplicate expensive as well as untidy.
    expect(fs.readFileSync(path.join(ROOT, "lib", "performance.ts"), "utf8")).not.toMatch(/^export function pct\b/m);
  });

  it("is imported from lib/achievement.ts wherever it is used", () => {
    const offenders = sourceFiles(path.join(ROOT, "app"))
      .filter((f) => /import \{[^}]*\bpct\b[^}]*\} from "[^"]*\/performance"/.test(fs.readFileSync(f, "utf8")))
      .map(rel);
    expect(offenders).toEqual([]);
  });
});

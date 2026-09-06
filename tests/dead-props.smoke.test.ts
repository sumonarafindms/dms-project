import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { rel as relativeTo } from "./paths";

/**
 * No component takes a prop it ignores.
 *
 * ## What this is about
 *
 * Five props across four components were documented like this:
 *
 *     /** Ignored — search and sort are local state now. Kept so callers compile. *\/
 *     q?: string;
 *
 * Honest of whoever wrote it, and still a lie in the type. The signature says
 * the option exists; the doc says it does nothing; nobody reads the doc. Three
 * pages went on passing `q={s.q || ""}` and `sort={s.sort}` into
 * `EmployeeDetailView`, and thirty `icon=` / `tone=` arguments were written
 * into the operations metrics — every one of them a value the caller believed
 * they had set.
 *
 * The dead ones reached further than the props. `bpAssignmentDetail` took a
 * fifth `qInput` parameter and returned a `q` nobody read; `listBpAssignments`
 * built a Prisma `contains` clause from a search string every caller passed as
 * `undefined` — unreachable code inside the query these screens run.
 *
 * ## The rule
 *
 * Delete the prop, or make it work. "Kept so callers compile" means the callers
 * were never updated, which is the part worth fixing.
 *
 * A prop this app genuinely does not want is simply absent — see the note where
 * `q` and `sort` used to be in EmployeeDetailView, which explains the absence
 * without re-declaring it.
 */

const ROOT = path.join(__dirname, "..");
const rel = relativeTo(ROOT);

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(e.name)) acc.push(full);
  }
  return acc;
}
const FILES = [...sourceFiles(path.join(ROOT, "app")), ...sourceFiles(path.join(ROOT, "lib"))].map((file) => ({
  file,
  src: fs.readFileSync(file, "utf8"),
}));

describe("no prop admits to being ignored", () => {
  it("is reading the source it means to", () => {
    // Guards against the sweep passing because it found no files.
    expect(FILES.length).toBeGreaterThan(80);
  });

  it("has no prop documented as ignored or kept for compilation", () => {
    /*
     * Matched on the ADMISSION, not on usage — a prop that is genuinely unused
     * is hard to detect statically, but one whose own comment says so is not.
     * Every instance this found was real.
     *
     * The shape matters: a COMPLETE single-line JSDoc, which is how these were
     * always written and is what sits directly above a property. Searching the
     * raw text instead flagged the notes that explain the removal — a guard
     * that fires on its own explanation teaches people to delete the
     * explanation.
     */
    const ADMISSION = /^[ \t]*\/\*\*[^\n]*(?:\bIgnored\b|Kept so callers compile)[^\n]*\*\/[ \t]*$/m;
    const offenders = FILES.filter((f) => ADMISSION.test(f.src))
      .map((f) => rel(f.file))
      .sort();
    expect(offenders, "delete the prop or make it work; do not document it as dead").toEqual([]);
  });

  it("still recognises the pattern it is looking for", () => {
    // Without this, rewriting the regex into something that matches nothing
    // would look like a clean codebase.
    const ADMISSION = /^[ \t]*\/\*\*[^\n]*(?:\bIgnored\b|Kept so callers compile)[^\n]*\*\/[ \t]*$/m;
    expect(ADMISSION.test("  /** Ignored — see BpActivationListView. */\n  eyebrow?: string;")).toBe(true);
    // And does not fire on prose that merely mentions the old shape.
    expect(ADMISSION.test('   * both were documented "Ignored — kept so callers compile"')).toBe(false);
  });

  it("does not pass a search string into the BP queries", () => {
    /*
     * The other half: the parameter is gone from the lib, so a caller cannot
     * thread a value into a filter that no longer exists. Both functions take
     * `(user, month, from, to)` now.
     */
    // Code only: the note above the function names the parameter it removed.
    const lib = fs
      .readFileSync(path.join(ROOT, "lib", "bp-activations.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");
    expect(lib).not.toMatch(/qInput/);
    // And the unreachable Prisma clause it fed.
    expect(lib).not.toMatch(/contains: q,/);
  });

  it("leaves no caller passing the removed arguments", () => {
    const bpCalls = FILES.flatMap((f) =>
      [...f.src.matchAll(/(?:listBpAssignments|bpAssignmentDetail)\([^)]*\)/g)].map((m) => ({
        file: rel(f.file),
        call: m[0],
      })),
    );
    expect(bpCalls.length, "the BP query calls were not found").toBeGreaterThanOrEqual(3);
    const withUndefined = bpCalls.filter((c) => c.call.includes("undefined"));
    expect(withUndefined, "an `undefined` placeholder means an argument nobody uses").toEqual([]);
  });

  it("keeps the attention list free of a cap nobody sets", () => {
    // `limit` sliced the rows and no page ever passed it. Since v144 the caller
    // passes exactly the page it wants shown, so a silent cap could only hide
    // rows.
    const src = fs.readFileSync(path.join(ROOT, "app", "components", "RoleAttention.tsx"), "utf8");
    expect(src).not.toMatch(/limit\?: number/);
    expect(src).not.toMatch(/rows\.slice\(0, limit\)/);
  });
});

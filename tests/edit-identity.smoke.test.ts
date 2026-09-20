import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * An edit screen has to say WHICH record it has opened.
 *
 * The BP form did not. Its heading was the literal words "Edit BP", and the
 * only thing above the fields was a box printing `initial.name` — the BP
 * DISPLAY NAME, which is optional, arrived in v181 and is blank on almost
 * every assignment. So it fell through to its own placeholder and the whole
 * screen read:
 *
 *     Edit BP
 *     Current BP assignment
 *     To change retailer code, create a new BP assignment.
 *
 * Nothing named the outlet, the RSO, the team or the dates. An operator who
 * opened one of two hundred assignments — and every link into this page is a
 * row in a list — had no way to tell whether they were editing the right one
 * before changing a GA target or revoking a login.
 *
 * The other three roles were luckier rather than better: their name IS an
 * editable field, so it happened to be on screen. They carry the same panel
 * now, because "luckier" is not a property that survives a refactor.
 */

const ROOT = join(__dirname, "..");
const code = (p: string) => readFileSync(join(ROOT, p), "utf8");

const EDIT_PAGES = {
  bps: "app/admin/employees/bps/[id]/page.tsx",
  rsos: "app/admin/employees/rsos/[id]/page.tsx",
  supervisors: "app/admin/employees/supervisors/[id]/page.tsx",
  managers: "app/admin/employees/managers/[id]/page.tsx",
} as const;

describe("every edit screen names its record", () => {
  it("all four pass a heading and an identity panel", () => {
    for (const [role, path] of Object.entries(EDIT_PAGES)) {
      const src = code(path);
      expect(src, `${role} edit has no heading — the title would read "Edit ${role}" and nothing else`).toMatch(
        /heading=\{/,
      );
      expect(src, `${role} edit shows no facts about the record`).toMatch(/identity=\{\[/);
    }
  });

  it("the form renders the panel only when editing, and only when given facts", () => {
    const form = code("app/components/AdminEmployeeForm.tsx");
    // An "Add" screen has no record to describe.
    expect(form).toContain("{edit && identity.length > 0 && (");
    expect(form).toContain('<dl className="kit-identity">');
    expect(code("styles/kit.css")).toContain(".kit-identity");
  });

  it("a BP is identified by its outlet, its RSO, its team and its dates", () => {
    /*
     * Not by its display name. That field is what the form EDITS, it is blank
     * on most rows, and using it as the identity is exactly how this screen
     * came to name nothing.
     */
    const src = code(EDIT_PAGES.bps);
    for (const label of ["Retailer", "RSO", "Supervisor", "Effective"])
      expect(src, `the BP edit screen does not show "${label}"`).toContain(`label: "${label}"`);
    expect(src, "the outlet code must be shown").toContain("value: a.retailer.retailerCode");
    expect(src, "the RSO must be named").toContain("value: a.employee.name");
    expect(src, "an ended assignment must say so").toContain("until ${ended}");
  });

  it("the assignment box no longer prints the editable display name as the identity", () => {
    const form = code("app/components/AdminEmployeeForm.tsx");
    expect(
      form,
      'the box printed `initial.name || "Current BP assignment"`, which was the same words for every BP',
    ).not.toContain('{initial.name || "Current BP assignment"}');
  });

  it("the heading carries the record's name beside the role", () => {
    const form = code("app/components/AdminEmployeeForm.tsx");
    expect(form).toContain("edit && heading ? `${title} · ${heading}`");
  });

  it("the BP heading falls back the way every other BP label does", () => {
    // bpDisplayName: the typed display name, else the retailer file's name,
    // else the code. One function, so a BP is called the same thing here as on
    // My BPs, the worklists and the reports.
    const src = code(EDIT_PAGES.bps);
    expect(src).toContain("bpDisplayName({");
    expect(src).toContain("heading={label}");
  });
});

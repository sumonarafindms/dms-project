import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Report columns carry functions, so the table that receives them must be a
 * Server Component.
 *
 * ## The bug
 *
 * Every report answered HTTP 500 and showed "We couldn't load this page." —
 * Daily, Activation, SSO, LSO, C2C, C2S, Low C2S, OB, Target, Custom and all
 * four performance reports. The Reporting Center's index still rendered, so the
 * menu looked healthy and every item under it was dead.
 *
 *     Functions cannot be passed directly to Client Components unless you
 *     explicitly expose it by marking it with "use server".
 *       {key: ..., label: "GA", align: "right", render: function render}
 *
 * `ReportTable` lived in ReportShell.tsx beside the date bar and the export
 * buttons, which genuinely need the client — and inherited that file's
 * `"use client"`. It has no hook and no browser API; it was a Client Component
 * by filing accident. Every report page is a Server Component and builds
 * columns like `{ key: "value", render: (r) => money(r.value) }`, so every
 * report was pushing functions across the RSC boundary.
 *
 * ## What is guarded
 *
 * Not "the reports render" — that needs a database. The RULE: the module that
 * accepts `Column` must never be a client module, and no page may import
 * `Column` or `ReportTable` from the file that is one.
 */

const ROOT = path.join(__dirname, "..");
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const isClientModule = (src: string) => /^\s*(?:\/\*[\s\S]*?\*\/\s*)?["']use client["']/.test(src);

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(e.name)) acc.push(full);
  }
  return acc;
}
const APP = sourceFiles(path.join(ROOT, "app")).map((file) => ({
  file: path.relative(ROOT, file),
  src: fs.readFileSync(file, "utf8"),
}));

describe("the report table stays on the server", () => {
  it("lives in its own module", () => {
    expect(fs.existsSync(path.join(ROOT, "app/components/ReportTable.tsx"))).toBe(true);
  });

  it("is not a client module", () => {
    // The whole bug in one assertion.
    expect(isClientModule(read("app", "components", "ReportTable.tsx"))).toBe(false);
  });

  it("still defines the pieces the reports import", () => {
    const src = read("app", "components", "ReportTable.tsx");
    expect(src).toMatch(/export type Column<T>/);
    expect(src).toMatch(/export function ReportTable</);
    // The render function is the reason this must stay server-side; if it were
    // dropped in favour of pre-rendered cells this test should be revisited
    // rather than silently passing.
    expect(src).toMatch(/render\?: \(row: T\) => ReactNode/);
  });

  it("keeps ReportShell client-only for the parts that need it", () => {
    const shell = read("app", "components", "ReportShell.tsx");
    expect(isClientModule(shell)).toBe(true);
    // Those two need state, the URL and window.print().
    expect(shell).toMatch(/export function ReportDateBar/);
    expect(shell).toMatch(/export function ReportActionBar/);
    // And must not have re-acquired the table.
    expect(shell).not.toMatch(/export function ReportTable/);
    expect(shell).not.toMatch(/export type Column/);
  });
});

describe("no page imports the table from a client module", () => {
  it("finds the report pages it is meant to police", () => {
    const importers = APP.filter((f) => /from "[^"]*ReportTable"/.test(f.src));
    expect(importers.length, "nothing imports ReportTable — has it moved again?").toBeGreaterThanOrEqual(10);
  });

  it("never pulls Column or ReportTable out of ReportShell", () => {
    const offenders = APP.filter((f) => {
      const m = f.src.match(/import[^;]*?from "[^"]*ReportShell";/g) || [];
      return m.some((line) => /\bColumn\b|\bReportTable\b/.test(line));
    }).map((f) => f.file);
    expect(offenders, "ReportShell is a client module; import these from ./ReportTable").toEqual([]);
  });

  it("keeps every importer of ReportTable on the server", () => {
    // A client page passing render functions would fail at runtime the same
    // way, just from the other direction.
    const offenders = APP.filter((f) => /from "[^"]*ReportTable"/.test(f.src) && isClientModule(f.src)).map(
      (f) => f.file,
    );
    expect(offenders, "a Client Component cannot build Column render functions").toEqual([]);
  });
});

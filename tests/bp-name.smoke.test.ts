/**
 * A Business Partner has one name, and every screen shows that name.
 *
 * ## The bug
 *
 * The admin BP screen has a field labelled "BP Display Name" and has had one
 * for a long time. Typing in it appeared to do nothing: every list, card,
 * report, export and Live GA row went on showing the name from the master
 * retailer file. The owner reported it as "after I create a BP, changing the
 * display name doesn't change anything — it shows the name from the retailer
 * database".
 *
 * Two separate faults, both real:
 *
 *   1. **It was read in exactly one place.** The name saved, to the BP login's
 *      `User.displayName`, and precisely one line in the whole application read
 *      it back: the edit form's own prefill. That is why it looked right when
 *      you reopened the form and wrong everywhere a person would actually
 *      look. Twenty-odd other sites rendered `retailerName || retailerCode`.
 *
 *   2. **It had nowhere to live without a login.** A `User` row is created only
 *      when a mobile number and PIN are supplied, so a BP without a phone had
 *      no place to keep a name and the typed value was dropped in silence.
 *      A third door onto BP creation — `/admin/bp-management` — had no name
 *      field at all.
 *
 * ## The rule
 *
 * `Retailer.bpName` if given, else the master file's `retailerName`, else the
 * retailer code. One function, `bpDisplayName()`, applied everywhere. The name
 * cannot live in `retailerName` because the master import owns that column and
 * re-asserts the vendor's value on every upload.
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { bpDisplayName, bpNameToStore, hasBpName } from "../lib/bp-name";

const ROOT = path.join(__dirname, "..");
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/^(\s*)\/\/.*$/gm, (_m, i) => i);

describe("what a BP is called", () => {
  it("prefers the name somebody typed", () => {
    expect(bpDisplayName({ bpName: "Afran Telecom", retailerName: "AFRAN TEL", retailerCode: "R435852" })).toBe(
      "Afran Telecom",
    );
  });

  it("falls back to the master file, then to the code", () => {
    expect(bpDisplayName({ bpName: null, retailerName: "AFRAN TEL", retailerCode: "R435852" })).toBe("AFRAN TEL");
    expect(bpDisplayName({ bpName: null, retailerName: null, retailerCode: "R435852" })).toBe("R435852");
  });

  it("treats blank and whitespace as absent, not as a name", () => {
    // A row labelled with an empty string is a row nobody can act on, and an
    // operator who typed a space did not mean to erase the label.
    expect(bpDisplayName({ bpName: "   ", retailerName: "AFRAN TEL", retailerCode: "R1" })).toBe("AFRAN TEL");
    expect(bpDisplayName({ bpName: "", retailerName: "  ", retailerCode: "R1" })).toBe("R1");
  });

  it("is never empty", () => {
    expect(bpDisplayName({ retailerCode: "R1" })).toBe("R1");
    expect(bpDisplayName({ bpName: null, retailerName: null, retailerCode: "R1" }).length).toBeGreaterThan(0);
  });

  it("can say whether the name was given or fallen back to", () => {
    expect(hasBpName({ bpName: "Shop", retailerName: "X", retailerCode: "R1" })).toBe(true);
    expect(hasBpName({ bpName: " ", retailerName: "X", retailerCode: "R1" })).toBe(false);
  });

  it("lets a name be cleared", () => {
    /*
     * The write path used to fall back to `retailerName` when the field was
     * blank, which made the BP name impossible to remove once set: an operator
     * who wanted the master file's name back had no way to ask for it. Null
     * restores the fallback, which is what an empty box should mean.
     */
    expect(bpNameToStore("")).toBeNull();
    expect(bpNameToStore("   ")).toBeNull();
    expect(bpNameToStore(null)).toBeNull();
    expect(bpNameToStore("  Afran Telecom  ")).toBe("Afran Telecom");
  });
});

describe("the name is stored where a login is not needed", () => {
  it("has a column on the retailer, not only on the login", () => {
    const schema = read("prisma", "schema.prisma");
    expect(schema).toMatch(/bpName\s+String\?/);
  });

  it("is created by the migration", () => {
    const dir = path.join(ROOT, "prisma", "migrations");
    const sql = fs
      .readdirSync(dir)
      .filter((d) => fs.existsSync(path.join(dir, d, "migration.sql")))
      .map((d) => fs.readFileSync(path.join(dir, d, "migration.sql"), "utf8"))
      .join("\n");
    expect(sql).toMatch(/ALTER TABLE "Retailer" ADD COLUMN IF NOT EXISTS "bpName"/);
  });

  it("is written by all three doors onto a BP", () => {
    /*
     * Three screens can create or rename a BP. Every time these have differed,
     * the app's behaviour has depended on which one you happened to use —
     * which is worse than a rule nobody implemented. The third of them had no
     * name field at all until v181.
     */
    const doors = {
      "app/api/admin/employees/[role]/route.ts": "the BPs section of People",
      "app/api/admin/users/route.ts": "the login editor, where a BP login's display name IS the BP's name",
      "app/api/admin/bp-assignments/route.ts": "BP Management",
    };
    for (const [file, what] of Object.entries(doors)) {
      const src = stripComments(read(file));
      expect(src, `${file} (${what}) does not store the BP name`).toMatch(/bpName/);
      expect(src, `${file} (${what}) does not write it to the retailer`).toMatch(/retailer\.update/);
    }
    // And the form that feeds the third door must actually offer the field.
    expect(stripComments(read("app", "admin", "bp-management", "BpManager.tsx"))).toMatch(/name="bpName"/);
  });
});

describe("every screen reads it", () => {
  /**
   * The files that render a BP's name, and what each shows.
   *
   * Listed rather than swept: the defect was a site being MISSED, and a sweep
   * over files that already use the helper cannot notice one that does not.
   */
  const SITES: Record<string, string> = {
    "app/components/BpAssignmentList.tsx": "the shared BP list, for RSO, supervisor, manager and admin",
    "app/components/BpActivationViews.tsx": "the BP detail page heading",
    "app/rso/bp/page.tsx": "My BPs, active cards and ended history",
    "app/rso/lso/page.tsx": "the BP name on an LSO worklist row",
    "app/rso/sso/page.tsx": "the BP name on an SSO worklist row",
    "app/bp/page.tsx": "the BP's own home identity line",
    "app/bp/sales/page.tsx": "the BP's own sales page",
    "app/admin/employees/bps/page.tsx": "the admin BP list",
    "app/admin/bp-management/page.tsx": "current and historical assignments",
    "app/admin/performance/bps/page.tsx": "BP performance cards",
    "app/admin/performance/bps/[id]/page.tsx": "one BP's performance",
    "app/admin/performance/supervisors/[id]/page.tsx": "the BP rows under a supervisor",
    "app/admin/users/page.tsx": "the BP a login is linked to, and the BP picker",
    "app/accounts/people/page.tsx": "the Accounts people list",
    "lib/live-ga.ts": "the Live GA board's BP rows",
    "lib/report-data.ts": "the BP activation report and every export built from it",
    "app/api/targets/route.ts": "the BP rows on the Target page",
  };

  it("goes through the one helper at every site", () => {
    const missing: string[] = [];
    for (const [file, what] of Object.entries(SITES))
      if (!/bpDisplayName\(/.test(stripComments(read(file)))) missing.push(`${file} — ${what}`);
    expect(missing, `a BP label not using the shared rule:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  it("names a real file for every entry", () => {
    for (const file of Object.keys(SITES))
      expect(fs.existsSync(path.join(ROOT, file)), `${file} is listed and does not exist`).toBe(true);
  });

  it("fetches the column wherever it selects a retailer for a BP label", () => {
    /*
     * The half that is easy to forget. Swapping the expression is not enough:
     * a `select` that does not ask for `bpName` hands the helper an undefined
     * and it falls straight back to the master file's name — the original bug,
     * silently restored and still passing the check above.
     */
    const bad: string[] = [];
    for (const file of Object.keys(SITES)) {
      const src = stripComments(read(file));
      for (const m of src.matchAll(/retailer:\s*\{\s*select:\s*\{([^}]*)\}/g))
        if (/retailerName:\s*true/.test(m[1]) && !/bpName:\s*true/.test(m[1]))
          bad.push(`${file}: a retailer select asks for retailerName and not bpName`);
    }
    expect(bad, bad.join("\n  ")).toEqual([]);
  });

  it("no longer falls back by hand where a BP is named", () => {
    // The expression this version replaced. Left anywhere in a BP context it
    // would be a second rule, and the second rule is the one that drifts.
    const bad: string[] = [];
    for (const file of Object.keys(SITES)) {
      const src = stripComments(read(file));
      if (/retailer\.retailerName \|\| \w*\.?retailer\.retailerCode/.test(src))
        bad.push(`${file} still spells the fallback out by hand`);
    }
    expect(bad, bad.join("\n  ")).toEqual([]);
  });

  it("searches on the BP's own name as well as the master file's", () => {
    // A list whose rows are labelled with one name and searched by another is
    // a list that cannot be found by what it says.
    expect(stripComments(read("app", "components", "BpAssignmentList.tsx"))).toMatch(/b\.bpName/);
    expect(stripComments(read("app", "admin", "performance", "bps", "page.tsx"))).toMatch(/retailer\.bpName/);
  });
});

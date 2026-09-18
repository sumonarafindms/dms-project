import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

/**
 * The dependency tree that reaches production carries no known advisory.
 *
 * ## What was wrong
 *
 * `npm audit` reported 8 findings, and one of them had been sitting at
 * "**No fix available**" since v123:
 *
 *     high  xlsx  Prototype Pollution in sheetJS
 *     high  xlsx  SheetJS Regular Expression Denial of Service (ReDoS)
 *
 * There is no fix *on npm*, which is the whole story: SheetJS stopped
 * publishing there at 0.18.5 and moved to their own CDN. Both advisories are
 * fixed upstream — prototype pollution in 0.19.3, the ReDoS in 0.20.2 — and the
 * registry copy simply never received them.
 *
 * v155 offered the owner three ways out and asked which. The one it could not
 * offer was "upgrade", because at the time nobody had checked whether the real
 * package was reachable. It is: `vendor/xlsx-0.20.3.tgz`, installed from a file
 * path so a build needs no network at all.
 *
 * ## Why a vendored tarball rather than the CDN URL
 *
 * `"xlsx": "https://cdn.sheetjs.com/..."` in package.json works, and makes
 * every deploy depend on that host being up. The tarball is 2.3 MB and it goes
 * in the repository, so `npm ci` on Vercel resolves it from disk. A deploy that
 * cannot reach a CDN is a deploy that fails for a reason nobody expects.
 */

const ROOT = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

describe("SheetJS is the patched build", () => {
  it("is 0.20.2 or newer, which is where both advisories are fixed", () => {
    /*
     * When this fails there are two very different reasons, and they call for
     * opposite actions — so the message works out which one it is rather than
     * leaving the reader to guess.
     *
     * It fired for real on the owner's Windows machine during a pre-deploy
     * check. `package.json` was correct and the tarball was present; what was
     * stale was `node_modules`, because `npm install` had not been run after a
     * version that changed a dependency spec. The old message said only
     * "SheetJS 0.18.5 still carries the ReDoS", which is true and tells you
     * nothing about what to do. A guard that cannot say what went wrong costs
     * someone an hour at the worst possible moment.
     */
    const spec = String(pkg.dependencies.xlsx ?? "");
    const tarball = spec.replace(/^file:/, "");
    const specIsVendored = spec.startsWith("file:vendor/");
    const tarballPresent = specIsVendored && fs.existsSync(path.join(ROOT, tarball));
    const stale = specIsVendored && tarballPresent;

    const why = stale
      ? `node_modules is STALE — package.json asks for ${spec} and that file is there, but the loaded copy is ${XLSX.version}. Run \`npm install\`.`
      : `SheetJS ${XLSX.version} carries both advisories, and package.json asks for "${spec}". It must be the vendored tarball.`;

    const [major, minor, patch] = XLSX.version.split(".").map(Number);
    expect(major * 10000 + minor * 100 + patch, why).toBeGreaterThanOrEqual(2002);
  });

  it("is installed from the vendored tarball, not the abandoned registry copy", () => {
    /*
     * `"xlsx": "^0.18.5"` resolves to the npm copy, which is the vulnerable one
     * and will stay vulnerable. The spec has to point at the file.
     */
    expect(pkg.dependencies.xlsx, "xlsx must come from vendor/, not the registry").toMatch(/^file:vendor\//);
    const tarball = pkg.dependencies.xlsx.replace(/^file:/, "");
    expect(fs.existsSync(path.join(ROOT, tarball)), `${tarball} is missing — the build cannot install`).toBe(true);
    expect(fs.statSync(path.join(ROOT, tarball)).size).toBeGreaterThan(1_000_000);
  });

  it("still reads and writes what the importers need", () => {
    // The four calls every importer makes, exercised end to end. A tarball that
    // installs but cannot parse is worse than a known advisory.
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["CODE", "PRICE"],
        ["MMSTC", 170],
      ]),
      "S",
    );
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(XLSX.read(buf, { type: "buffer", cellDates: true }).Sheets.S, {
      header: 1,
      raw: true,
      defval: null,
    });
    expect(rows[0]).toEqual(["CODE", "PRICE"]);
    expect(rows[1]).toEqual(["MMSTC", 170]);
    // The date helper the three importers use for Excel serial dates.
    expect(XLSX.SSF.parse_date_code(46265)).toMatchObject({ y: 2026, m: 8, d: 31 });
  });

  it("still reads the carrier's tab-separated .xls", () => {
    /*
     * The owner's C2C, C2S and OB exports are named `.xls` and are not
     * workbooks — they are tab-separated text (v163). SheetJS parses them as a
     * delimited file, and that path had to survive the upgrade.
     */
    const tsv = Buffer.from("CLUSTER_NAME\tRETAILER_CODE\tAMOUNT\r\nDhaka\tR100001\t500\r\n", "utf8");
    const rows = XLSX.utils.sheet_to_json<unknown[]>(
      XLSX.read(tsv, { type: "buffer", cellDates: true }).Sheets.Sheet1,
      { header: 1, raw: true, defval: null },
    );
    expect(rows[0]).toEqual(["CLUSTER_NAME", "RETAILER_CODE", "AMOUNT"]);
    expect(rows[1]).toEqual(["Dhaka", "R100001", 500]);
  });
});

describe("the transitive pins", () => {
  /*
   * Four dependencies-of-dependencies carried advisories whose only "fix" npm
   * offered was a major upgrade of the thing that pulls them — Next 16, Prisma
   * 6.12, or a DOWNGRADE of exceljs to 3.4. Each is instead pinned forward to
   * the patched release of the same major, which is what `overrides` is for.
   *
   * `npm audit fix --force` was never run. It is barred on this project, and it
   * would have taken all three of those major upgrades unasked.
   */
  const EXPECTED: Record<string, string> = {
    postcss: "^8.5.28", // 4 advisories, reached through next
    uuid: "^11.1.1", // buffer bounds check, reached through exceljs
    "deepmerge-ts": "^8.0.2", // stack exhaustion, reached through @prisma/config
    "js-yaml": "^4.3.2", // CPU use on empty merge sources, reached through eslint
  };

  it("pins every one of them", () => {
    expect(pkg.overrides).toBeTruthy();
    for (const [name, range] of Object.entries(EXPECTED))
      expect(pkg.overrides[name], `${name} is not pinned`).toBe(range);
  });

  it("pins them forward, never to a downgrade", () => {
    // `npm audit` proposed exceljs 3.4.0 as the "fix" for uuid — from 4.4.0.
    // Accepting that would have removed features this app's exports use.
    // Anchored. `/\^?4\./` unanchored matches "^3.4.0" on the ".4." in the middle,
    // which is exactly the downgrade this line exists to refuse — caught by
    // reintroducing it.
    expect(pkg.dependencies.exceljs).toMatch(/^\^?4\./);
    for (const range of Object.values(EXPECTED)) expect(range.startsWith("^")).toBe(true);
  });

  it("keeps the majors this project actually runs", () => {
    // The whole point: zero production advisories WITHOUT a framework upgrade.
    expect(pkg.dependencies.next).toMatch(/15\./);
    expect(pkg.dependencies["@prisma/client"] ?? pkg.devDependencies?.prisma).toBeTruthy();
  });
});

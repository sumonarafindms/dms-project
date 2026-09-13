import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildEmployeeIndex, linkEmployee, normalizeRsoCode } from "../lib/rso-link";

/**
 * Nine retailers that belonged to nobody.
 *
 * ## The gap
 *
 * A retailer reached its RSO through one field: the RSO's mobile number. In the
 * owner's real daily exports, nine retailers have a **blank `SRNUMBER`** —
 * while carrying both the RSO's code and the iTop-up SR number on the same
 * line:
 *
 *     R565817  KAMAL TELECOM   RSOCODE RS049839  ITOPUPSRNUMBER 01935599620  SRNUMBER (blank)
 *     R342717  Ma Electronics  RSOCODE RS045160  ITOPUPSRNUMBER 01967046995  SRNUMBER (blank)
 *
 * The file says twice over which RSO they belong to. They were assigned to
 * none, so their sales and balances appeared under no RSO anywhere in the app —
 * not as an error, just as absence.
 *
 * `Retailer.rsoCode` and `Employee.employeeCode` both existed already. The code
 * was stored on both sides and never used to connect them.
 *
 * ## What must stay true
 *
 * The number still decides first. A fallback that can re-decide an existing
 * assignment is not a fallback — it is a silent reorganisation of who owns
 * which shop, and that is a far worse bug than the one being fixed.
 */

const employees = [
  { id: "e1", rsoMsisdn: "01937614430", employeeCode: "RS037900", name: "Shuvo" },
  { id: "e2", rsoMsisdn: "01912564365", employeeCode: "RS037895", name: "Shaheen" },
  { id: "e3", rsoMsisdn: "01900000009", employeeCode: "RS049839", name: "Rahim" },
];
const index = () => buildEmployeeIndex(employees);

describe("linkEmployee", () => {
  it("matches on the master's own number first", () => {
    const out = linkEmployee(index(), { iTopUpSrNumber: "01937614430" });
    expect(out.employee?.id).toBe("e1");
    expect(out.basis).toBe("phone");
  });

  it("matches a number written with the country code", () => {
    expect(linkEmployee(index(), { iTopUpSrNumber: "8801912564365" }).employee?.id).toBe("e2");
  });

  it("falls back to the transaction line's number", () => {
    // ITOPUPSRNUMBER absent, SRNUMBER present — the other way round from the
    // nine rows below, and just as real.
    const out = linkEmployee(index(), { iTopUpSrNumber: "", srNumber: "01912564365" });
    expect(out.employee?.id).toBe("e2");
    expect(out.basis).toBe("phone");
  });

  it("rescues the row whose numbers are blank, using the RSO code", () => {
    /*
     * The nine. Both number fields empty, RSOCODE present — which is exactly
     * what the owner's Balance file contains for RS049839's retailers.
     */
    const out = linkEmployee(index(), { iTopUpSrNumber: "", srNumber: "", rsoCode: "RS049839" });
    expect(out.employee?.id, "a retailer the file identifies by code was left unassigned").toBe("e3");
    expect(out.basis).toBe("code");
  });

  it("never lets a code override a number that matched", () => {
    /*
     * The assertion that makes this change safe to ship.
     *
     * A retailer whose number resolves must keep resolving the same way, even
     * when its code points somewhere else — otherwise adding a fallback quietly
     * moves shops between RSOs, and every historical figure moves with them.
     */
    const out = linkEmployee(index(), { iTopUpSrNumber: "01937614430", rsoCode: "RS049839" });
    expect(out.employee?.id).toBe("e1");
    expect(out.basis).toBe("phone");
  });

  it("leaves a retailer unassigned when nothing identifies its RSO", () => {
    for (const fields of [{}, { srNumber: "" }, { rsoCode: "" }, { rsoCode: "RS999999" }, { srNumber: "01700000001" }])
      expect(linkEmployee(index(), fields).employee, JSON.stringify(fields)).toBeNull();
    expect(linkEmployee(index(), {}).basis).toBeNull();
  });

  it("ignores case and stray spaces in a code", () => {
    expect(linkEmployee(index(), { rsoCode: " rs049839 " }).employee?.id).toBe("e3");
    expect(normalizeRsoCode(" rs001 ")).toBe("RS001");
    expect(normalizeRsoCode(null)).toBe("");
  });

  it("does not invent a code index entry for an employee without one", () => {
    // An empty employeeCode must not become a key that every codeless retailer
    // then matches, which would assign half the file to one RSO.
    const idx = buildEmployeeIndex([{ id: "x", rsoMsisdn: "01700000000", employeeCode: "", name: "No code" }]);
    expect(idx.byCode.size).toBe(0);
    expect(linkEmployee(idx, { rsoCode: "" }).employee).toBeNull();
  });
});

describe("both paths into the database use it", () => {
  const ROOT = path.join(__dirname, "..");
  const codeOf = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const read = (...p: string[]) => codeOf(fs.readFileSync(path.join(ROOT, ...p), "utf8"));

  it("is used by the Retailer Master importer", () => {
    /*
     * Fixing the daily importers and not the master would mean a retailer
     * created by a daily file got its RSO and the same retailer re-imported
     * from the master lost it again — a link that flickers depending on which
     * upload ran last.
     */
    const src = read("lib", "master-import.ts");
    expect(src).toMatch(/linkEmployee\(employeeIndex/);
    expect(src, "the master still maps by phone key on its own").not.toMatch(/employeeByMsisdn\.get\(/);
  });

  it("is used when a daily file creates a retailer", () => {
    expect(read("lib", "retailer-autocreate.ts")).toMatch(/linkEmployee\(index, seed\)/);
  });

  it("gets the fields it needs from every daily report", () => {
    // A rule that cannot see RSOCODE is a rule that cannot apply it.
    for (const f of ["c2c-import.ts", "c2s-import.ts", "ob-import.ts"]) {
      const src = read("lib", f);
      expect(src, `${f} never passes rsoCode through`).toMatch(/rsoCode:/);
      expect(src, `${f} never passes iTopUpSrNumber through`).toMatch(/iTopUpSrNumber:/);
    }
    // And the parsers have to read them off the sheet in the first place.
    expect(read("lib", "c2-import-core.ts")).toMatch(/optional\("RSOCODE"\)/);
    expect(read("lib", "ob-import.ts")).toMatch(/optional\("RSOCODE"\)/);
  });
});

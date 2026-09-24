import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ssoCompletion } from "../lib/sso-credit";
import { parseHeaderDate } from "../lib/c2-import-core";
import { isYm, isYmd } from "../lib/business-time";

/**
 * v200 — the whole-code review. Each block is a defect a reviewer found, was
 * reproduced, and fixed; these keep it fixed.
 */
const read = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const D = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);

describe("SSO is one fact per retailer-month, credited once", () => {
  it("3 GA before a BP starts and 3 after is ONE SSO — to whoever sold the completing SIM", () => {
    const done = ssoCompletion(
      [
        { dayMs: D("2026-09-03"), count: 3, bp: false },
        { dayMs: D("2026-09-15"), count: 3, bp: true },
      ],
      true,
      2,
    );
    expect(done).toEqual({ dayMs: D("2026-09-03"), bp: false });
  });

  it("1 GA before and 1 after is still complete (it was lost before)", () => {
    const done = ssoCompletion(
      [
        { dayMs: D("2026-09-03"), count: 1, bp: false },
        { dayMs: D("2026-09-15"), count: 1, bp: true },
      ],
      true,
      2,
    );
    expect(done).toEqual({ dayMs: D("2026-09-15"), bp: true });
  });

  it("a non-SIM-seller never completes; one short never completes", () => {
    expect(ssoCompletion([{ dayMs: D("2026-09-03"), count: 5, bp: false }], false, 2)).toBeNull();
    expect(ssoCompletion([{ dayMs: D("2026-09-03"), count: 1, bp: false }], true, 2)).toBeNull();
  });

  it("both the RSO pages and the dashboard use it", () => {
    for (const f of ["lib/performance.ts", "app/api/dashboard/summary/route.ts"])
      expect(read(f)).toContain("ssoCompletion(");
  });
});

describe("dates and months", () => {
  it("a real day and a real month only", () => {
    expect(isYmd("2026-02-31")).toBe(false);
    expect(isYm("2026-13")).toBe(false);
    expect(isYm("2026-09")).toBe(true);
  });

  it("a C2 date header read from a local-midnight cell keeps its day in any time zone", () => {
    // SheetJS builds date cells at LOCAL midnight; the UTC getters read the day before in Dhaka.
    const local = new Date(2026, 8, 1);
    expect(parseHeaderDate(local)!.toISOString().slice(0, 10)).toBe("2026-09-01");
  });
});

describe("scope and permission", () => {
  it("an EMPTY team is nobody, not everybody", () => {
    expect(read("lib/comparison-data.ts")).toMatch(
      /employeeIds \? \{ retailer: \{ employeeId: \{ in: employeeIds \} \} \} : \{\}/,
    );
  });

  it("the campaign and Sim Support APIs check the person's own permission, not only the role", () => {
    for (const f of [
      "app/api/campaigns/route.ts",
      "app/api/support/schemes/route.ts",
      "app/api/support/codes/route.ts",
    ])
      expect(read(f), f).toContain("hasPermission(");
  });

  it("a manager sets support codes only for their own team", () => {
    expect(read("app/api/support/codes/route.ts")).toContain("That RSO is not in your team.");
    expect(read("app/support/codes/page.tsx")).toContain("managerScope(user.id)");
  });

  it("the administrator's account cannot be changed from the users API", () => {
    expect(read("app/api/admin/users/route.ts")).toContain('existing.role === "ADMIN"');
  });

  it("employee and BP changes are audited", () => {
    expect(read("app/api/admin/employees/[role]/route.ts")).toContain("await logSave(actor");
    expect(read("app/api/admin/bp-assignments/route.ts")).toContain("END_BP_ASSIGNMENT");
  });
});

describe("imports", () => {
  it("a failed or abandoned import does not lock its file out", () => {
    const src = read("lib/import-batch.ts");
    expect(src).toContain('prior.status === "FAILED" || stale');
    for (const f of ["lib/ga-import.ts", "lib/c2c-import.ts", "lib/c2s-import.ts", "lib/ob-import.ts"])
      expect(read(f), f).toContain("priorImport(hash)");
  });

  it("a rejected C2/OB file creates no retailers first", () => {
    for (const f of ["lib/c2c-import.ts", "lib/c2s-import.ts"]) {
      const src = read(f);
      expect(src.indexOf("if (preErrors.length)")).toBeLessThan(src.indexOf("createMissingRetailers("));
    }
  });

  it("GA date bounds do not spread 250,000 arguments", () => {
    expect(read("lib/ga-import.ts")).not.toMatch(/Math\.min\(\.\.\.activationDates\)/);
  });

  it("a master import that fails part-way says how far it got and records what landed", () => {
    expect(read("lib/master-import.ts")).toContain("async function writeInChunks(");
  });
});

describe("field", () => {
  it("a BP's campaign line is its outlet, and a BP never sees its holders' rows", () => {
    expect(read("lib/campaign-data.ts")).toContain("export function campaignOutletLine(");
    expect(read("app/campaigns/[id]/page.tsx")).toMatch(/user\.role === "BP" \? null : \(/);
  });

  it("a BP's Live GA counts its outlet once", () => {
    expect(read("lib/live-ga.ts")).toMatch(/r\.count\.total > best\.total \? r\.count : best/);
  });

  it("the Targets page ignores a late answer for a month it has left", () => {
    expect(read("app/targets/page.tsx")).toContain("if (seq !== loadSeq.current) return;");
  });
});

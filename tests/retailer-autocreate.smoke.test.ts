import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * A new outlet no longer stops the day.
 *
 * ## The failure
 *
 * C2C, C2S and OB each refused any file containing a retailer code the master
 * did not already have — and refused the whole file, not the row. Measured
 * against the owner's real exports with three of 2,190 outlets held back:
 *
 *     C2C: FAILED — 3 invalid or unmapped row(s)
 *     C2S: FAILED — 3 invalid or unmapped row(s)
 *     OB : FAILED — 3 invalid/unmapped row(s)
 *     stored after all three: C2C 0, C2S 0, OB 0
 *
 * 0.14% of the file unknown, and nothing landed. The carrier adds outlets
 * routinely, so the daily upload would have stopped on the first such day and
 * stayed stopped.
 *
 * ## What is guarded
 *
 * That the outlet is created from what the file already says, that it is
 * connected to its RSO, and — the part a passing test is easiest to fake —
 * that nothing which already exists is touched and nothing is invented.
 */

type Employee = { id: string; rsoMsisdn: string; name: string };
type Created = { where: unknown; create: Record<string, unknown>; update: Record<string, unknown> };

const state: { employees: Employee[]; upserts: Created[]; history: unknown[][] } = {
  employees: [],
  upserts: [],
  history: [],
};

vi.mock("../lib/prisma", () => ({
  prisma: {
    employee: {
      /**
       * Behaves like the database, including the part that bit.
       *
       * `phoneKey` strips a leading 88 and leading zeros, so its output does
       * not equal the stored column. A caller that filters the query by those
       * keys matches nothing — and a mock that ignored `where` would happily
       * hand the rows back anyway and call the bug a pass. So this filters
       * exactly as Postgres would.
       */
      findMany: async (args?: { where?: { rsoMsisdn?: { in: string[] } } }) => {
        const wanted = args?.where?.rsoMsisdn?.in;
        if (!wanted) return state.employees;
        return state.employees.filter((e) => wanted.includes(e.rsoMsisdn));
      },
    },
    retailer: {
      upsert: async (args: Created) => {
        state.upserts.push(args);
        return { id: `id-${state.upserts.length}` };
      },
    },
  },
}));

vi.mock("../lib/assignment-history", () => ({
  recordAssignmentChanges: async (_actor: unknown, changes: unknown[]) => {
    state.history.push(changes);
    return changes.length;
  },
}));

const { createMissingRetailers, describeCreatedRetailers } = await import("../lib/retailer-autocreate");

beforeEach(() => {
  state.employees = [
    { id: "e1", rsoMsisdn: "01937614430", name: "Shuvo" },
    { id: "e2", rsoMsisdn: "01912564365", name: "Shaheen" },
  ];
  state.upserts = [];
  state.history = [];
});

const seed = (code: string, over: Record<string, string> = {}) => ({
  retailerCode: code,
  retailerName: `SHOP ${code}`,
  iTopUpNumber: "01700000001",
  srNumber: "01937614430",
  ...over,
});

describe("createMissingRetailers", () => {
  it("does nothing at all when the master is already complete", async () => {
    const out = await createMissingRetailers([seed("R1"), seed("R2")], new Set(["R1", "R2"]), "C2C import: f.xls");
    expect(out.created).toEqual([]);
    expect(state.upserts, "wrote to the database when there was nothing to create").toHaveLength(0);
    expect(state.history).toHaveLength(0);
  });

  it("creates the outlet from what the report already says", async () => {
    const out = await createMissingRetailers(
      [seed("R1"), seed("R9", { retailerName: "SONIA  TELECOM" })],
      new Set(["R1"]),
      "s",
    );
    expect(out.created).toEqual(["R9"]);
    expect(state.upserts).toHaveLength(1);
    const create = state.upserts[0].create;
    expect(create.retailerCode).toBe("R9");
    expect(create.retailerName).toBe("SONIA  TELECOM");
    expect(create.iTopUpNumber).toBe("01700000001");
    expect(create.active).toBe(true);
  });

  it("connects it to its RSO, matching the way phone numbers are stored", async () => {
    /*
     * The bug this test exists for. The first version filtered the employee
     * query by `phoneKey(...)` values — "1937614430" — against a column that
     * holds "01937614430". It matched nothing, every new outlet was created
     * unassigned, and the import still reported success. Nothing on screen
     * would have shown it.
     */
    const out = await createMissingRetailers([seed("R9")], new Set(), "s");
    expect(out.createdMapped, "the new outlet was created with no RSO").toBe(1);
    expect(state.upserts[0].create.employeeId).toBe("e1");
  });

  it("matches a number written with the country code", async () => {
    await createMissingRetailers([seed("R9", { srNumber: "8801912564365" })], new Set(), "s");
    expect(state.upserts[0].create.employeeId).toBe("e2");
  });

  it("leaves the outlet unassigned when its RSO is genuinely unknown", async () => {
    // Not every retailer has one — the owner's Balance file has nine with a
    // blank SR number, and inventing an RSO for them would be worse.
    const out = await createMissingRetailers([seed("R9", { srNumber: "" })], new Set(), "s");
    expect(out.createdMapped).toBe(0);
    expect(state.upserts[0].create.employeeId).toBeNull();
    expect(state.history, "claimed an assignment that does not exist").toHaveLength(0);
  });

  it("never guesses SIM_SELLER, CATEGORY or ROUTE", async () => {
    /*
     * The daily reports do not contain them, and SSO counts a retailer only
     * when simSeller is "Y". Defaulting to "Y" would inflate SSO with outlets
     * nobody has confirmed sell SIMs — a wrong number is worse than a missing
     * one, because it looks like an answer.
     */
    await createMissingRetailers([seed("R9", { iTopUpSeller: "Y" })], new Set(), "s");
    const create = state.upserts[0].create;
    expect(create.simSeller).toBeUndefined();
    expect(create.category).toBeUndefined();
    expect(create.route).toBeUndefined();
    // What the file DID say is kept, under its own field.
    expect(create.iTopUpSeller).toBe("Y");
  });

  it("never modifies a retailer that already exists", async () => {
    // A same-code upsert must be a no-op on the update side, or a daily file
    // would quietly overwrite master data that the master upload set.
    await createMissingRetailers([seed("R9")], new Set(), "s");
    expect(state.upserts[0].update).toEqual({});
  });

  it("creates a repeated retailer once", async () => {
    // A shared BP appears once per RSO in the StockLifting export.
    const out = await createMissingRetailers([seed("R9"), seed("R9"), seed("R9")], new Set(), "s");
    expect(out.created).toEqual(["R9"]);
    expect(state.upserts).toHaveLength(1);
  });

  it("takes the name from whichever line has one", async () => {
    await createMissingRetailers(
      [seed("R9", { retailerName: "" }), seed("R9", { retailerName: "REAL NAME" })],
      new Set(),
      "s",
    );
    expect(state.upserts[0].create.retailerName).toBe("REAL NAME");
  });

  it("opens the assignment history for a new outlet", async () => {
    // v127's rule: a brand-new retailer's first owner is the start of its
    // history, and a later backfill needs that start point.
    await createMissingRetailers([seed("R9")], new Set(), "C2C import: file.xls");
    expect(state.history).toHaveLength(1);
    const change = (state.history[0] as Array<Record<string, unknown>>)[0];
    expect(change.kind).toBe("RETAILER_RSO");
    expect(change.fromId).toBeNull();
    expect(change.toId).toBe("e1");
  });
});

describe("describeCreatedRetailers", () => {
  it("says nothing when nothing was created", () => {
    expect(describeCreatedRetailers({ created: [], createdMapped: 0 })).toBeNull();
  });

  it("names the codes and the gap they carry", () => {
    const note = describeCreatedRetailers({ created: ["R432170", "R457130"], createdMapped: 2 })!;
    expect(note).toContain("R432170");
    expect(note).toContain("R457130");
    // The operator has to be told these are stubs, or "2 new retailers added"
    // reads as "the master is up to date".
    expect(note).toMatch(/SIM_SELLER/);
    expect(note).toMatch(/SSO/);
  });

  it("does not list two hundred codes", () => {
    const note = describeCreatedRetailers({
      created: Array.from({ length: 200 }, (_, i) => `R${i}`),
      createdMapped: 0,
    })!;
    expect(note).toMatch(/and 194 more/);
    expect(note.length).toBeLessThan(400);
  });
});

describe("every daily importer uses it", () => {
  const ROOT = path.join(__dirname, "..");
  const codeOf = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("is wired into C2C, C2S and OB alike", () => {
    /*
     * Fixing one importer and not the others is how OB stayed broken through
     * v156 while C2C was fixed. All three take the same daily habit.
     */
    const offenders = ["c2c-import.ts", "c2s-import.ts", "ob-import.ts"].filter(
      (f) => !/createMissingRetailers\(/.test(codeOf(fs.readFileSync(path.join(ROOT, "lib", f), "utf8"))),
    );
    expect(offenders, `these still fail a whole file on one new outlet:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });

  it("re-reads the retailers after creating any", () => {
    // Creating a row the already-loaded map does not contain would leave the
    // import failing on exactly the outlet it had just created.
    for (const f of ["c2c-import.ts", "c2s-import.ts", "ob-import.ts"]) {
      const src = codeOf(fs.readFileSync(path.join(ROOT, "lib", f), "utf8"));
      expect(src, `${f} creates retailers but does not reload them`).toMatch(
        /autoCreated\.created\.length\)?\s*\n?\s*retailers = await prisma\.retailer\.findMany/,
      );
    }
  });

  it("tells the operator on all three upload screens", () => {
    /*
     * `.newRetailerNote`, with the dot, on purpose.
     *
     * The first version of this matched the bare name and passed with the
     * rendering deleted, because each page still DECLARES the field on its
     * result type — a guard that proved the type existed, not that anybody was
     * told. Only a property read (`data.newRetailerNote`) means it reaches the
     * message.
     */
    for (const f of ["c2c", "c2s", "ob"]) {
      const src = codeOf(fs.readFileSync(path.join(ROOT, "app", f, "page.tsx"), "utf8"));
      expect(src, `the ${f} screen declares newRetailerNote but never shows it`).toMatch(/\.newRetailerNote\b/);
      // And inside the sentence the operator actually reads.
      expect(src, `the ${f} screen reads newRetailerNote but not into its message`).toMatch(
        /setMessage\([\s\S]{0,900}?\.newRetailerNote/,
      );
    }
  });
});

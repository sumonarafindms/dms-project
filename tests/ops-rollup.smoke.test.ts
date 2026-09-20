import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { groupOps, groupOpsBySupervisor, opsCountLabel, OPS_LEVELS, OPS_LEVEL_LABEL } from "../lib/ops-rollup";

/**
 * The Retailer / RSO / Supervisor tabs on the four import screens.
 *
 * Three things are guarded, and each is a defect that was live before v184:
 *
 *   1. /ob offered only the retailer level, so an operator who wanted an RSO's
 *      total balance had to page through the outlets and add them up by hand.
 *   2. The roll-ups group on an ID. Grouping on a NAME is the defect v181
 *      found in the Reporting Center, where two supervisors sharing a name
 *      silently shared a row.
 *   3. /api/ob/summary counted and summed EVERY row in the table, on the
 *      assumption that the importer's delete-then-write leaves exactly one
 *      snapshot. The development database holds 2,730 rows across 21 dates,
 *      so the page reported 2,730 retailers for 1,930 real ones and added
 *      twenty old partial days into a figure headed "Current Balance
 *      Snapshot".
 */

const ROOT = join(__dirname, "..");
const code = (p: string) => readFileSync(join(ROOT, p), "utf8");

type Row = {
  employeeId: string;
  employee: string;
  rsoMsisdn: string;
  supervisorId: string;
  supervisor: string;
  amount: number;
  trx: number;
};
const row = (over: Partial<Row> = {}): Row => ({
  employeeId: "e1",
  employee: "RSO One",
  rsoMsisdn: "01700000001",
  supervisorId: "s1",
  supervisor: "Dhaka North",
  amount: 100,
  trx: 1,
  ...over,
});

describe("the arithmetic", () => {
  it("sums every named field and counts the rows", () => {
    const out = groupOps(
      [row({ amount: 100, trx: 2 }), row({ amount: 50, trx: 3 })],
      (r) => ({ key: r.employeeId, name: r.employee, sub: r.rsoMsisdn }),
      ["amount", "trx"] as const,
      (r, f) => r[f],
    );
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(2);
    expect(out[0].totals.amount).toBe(150);
    expect(out[0].totals.trx).toBe(5);
    expect(out[0].sub).toBe("01700000001");
  });

  it("keeps different people apart and orders by the first field", () => {
    const out = groupOps(
      [
        row({ employeeId: "a", employee: "Small", amount: 10 }),
        row({ employeeId: "b", employee: "Big", amount: 900 }),
        row({ employeeId: "a", employee: "Small", amount: 5 }),
      ],
      (r) => ({ key: r.employeeId, name: r.employee }),
      ["amount"] as const,
      (r, f) => r[f],
    );
    expect(out.map((g) => g.name)).toEqual(["Big", "Small"]);
    expect(out[1].totals.amount).toBe(15);
  });

  it("groups on the id, not the name", () => {
    /*
     * The defect this exists for: two supervisors called "Dhaka North" are two
     * teams, and a name-keyed roll-up merges them into one row that belongs to
     * neither.
     */
    const out = groupOpsBySupervisor(
      [
        row({ supervisorId: "s1", supervisor: "Dhaka North", amount: 100 }),
        row({ supervisorId: "s2", supervisor: "Dhaka North", amount: 40 }),
      ],
      ["amount"] as const,
      (r, f) => r[f],
    );
    expect(out, "two supervisors sharing a name must stay two rows").toHaveLength(2);
    expect(out.map((g) => g.totals.amount)).toEqual([100, 40]);
  });

  it("gives an employee with no supervisor a row rather than dropping them", () => {
    const out = groupOpsBySupervisor(
      [row({ supervisorId: "", supervisor: "Unassigned", amount: 7 })],
      ["amount"] as const,
      (r, f) => r[f],
    );
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Unassigned");
    expect(out[0].totals.amount).toBe(7);
  });

  it("totals nothing when there is nothing", () => {
    expect(
      groupOps(
        [],
        () => ({ key: "x", name: "x" }),
        ["amount"] as const,
        () => 0,
      ),
    ).toEqual([]);
  });

  it("treats a missing or unparseable value as zero rather than NaN", () => {
    const out = groupOps(
      [row(), row()],
      (r) => ({ key: r.employeeId, name: r.employee }),
      ["amount"] as const,
      () => Number.NaN,
    );
    expect(out[0].totals.amount).toBe(0);
  });

  it("names a count in the singular and the plural", () => {
    expect(opsCountLabel(1, "RSO")).toBe("1 RSO");
    expect(opsCountLabel(43, "RSO")).toBe("43 RSOs");
    expect(opsCountLabel(2190, "retailer")).toBe("2,190 retailers");
  });

  it("offers the three levels under one set of names", () => {
    expect(OPS_LEVELS).toEqual(["retailer", "rso", "supervisor"]);
    expect(Object.values(OPS_LEVEL_LABEL)).toEqual(["Retailer", "RSO", "Supervisor"]);
  });
});

describe("all four import screens offer the levels", () => {
  const PAGES = ["app/ob/page.tsx", "app/ga/page.tsx", "app/c2c/page.tsx", "app/c2s/page.tsx"];

  it("every page renders the level switch", () => {
    for (const p of PAGES) expect(code(p), `${p} has no level tabs`).toContain("<OpsLevelTabs");
  });

  it("the switch is one component, not four copies of a pill row", () => {
    const ui = code("app/components/OperationsPremiumUI.tsx");
    expect(ui).toContain("export function OpsLevelTabs");
    expect(code("styles/kit.css")).toContain(".ops-level-tab");
  });

  it("the two periods on a page get two switches, not one", () => {
    /*
     * On /ga, /c2c and /c2s one table is a single DAY and the other is the
     * MONTH against target. One switch across both would let a reader carry a
     * day's figure under a monthly heading.
     */
    for (const p of ["app/ga/page.tsx", "app/c2c/page.tsx", "app/c2s/page.tsx"]) {
      const src = code(p);
      expect(src, `${p} must track the day and the month separately`).toContain("const [dayLevel, setDayLevel]");
      expect(src, `${p} must track the day and the month separately`).toContain("const [monthLevel, setMonthLevel]");
    }
  });

  it("the monthly table has no retailer level, because a target is not set per outlet", () => {
    for (const p of ["app/ga/page.tsx", "app/c2c/page.tsx", "app/c2s/page.tsx"])
      expect(code(p), `${p} offers a retailer level on a target table`).toContain('levels={["rso", "supervisor"]}');
  });

  it("a team percentage is recomputed from the summed pair, never averaged", () => {
    /*
     * The mean of eight RSOs' percentages is the team's percentage only when
     * all eight targets are equal — and an RSO with no target contributes a 0%
     * that drags the team down for a number nobody set.
     */
    for (const p of ["app/ga/page.tsx", "app/c2c/page.tsx", "app/c2s/page.tsx"]) {
      const src = code(p);
      expect(src, `${p} averages percentages instead of dividing the totals`).not.toMatch(/totals\.\w*[Pp]ercent/);
    }
    expect(code("app/c2c/page.tsx")).toContain("function pctOf(achieved: number, target: number)");
  });
});

describe("the roll-ups are built where the whole data is", () => {
  it("/ob rolls up on the server, because its retailer table is paged", () => {
    /*
     * Fifty rows at a time reach the browser. An RSO total added up from what
     * is on screen would be the total of one page — a number that looks like
     * an answer and is not one.
     */
    const api = code("app/api/ob/summary/route.ts");
    expect(api).toContain("byEmployee");
    expect(api).toContain("bySupervisor");
    const page = code("app/ob/page.tsx");
    expect(page, "the OB page must not group the paged rows itself").not.toContain("groupOps(");
  });

  it("/ga, /c2c and /c2s roll up on the client, because the whole day is there", () => {
    for (const p of ["app/ga/page.tsx", "app/c2c/page.tsx", "app/c2s/page.tsx"]) {
      expect(code(p), `${p} should group the day it already holds`).toContain("groupOps(");
      expect(code(p)).toContain("groupOpsBySupervisor(");
    }
  });

  it("every feed carries the ids the roll-up groups on", () => {
    for (const p of ["app/api/ga/summary/route.ts", "app/api/c2c/summary/route.ts", "app/api/c2s/summary/route.ts"]) {
      const src = code(p);
      expect(src, `${p} sends no supervisorId, so the page would group by name`).toContain("supervisorId:");
      expect(src, `${p} sends no employeeId on the daily rows`).toContain("employeeId:");
    }
  });
});

describe("the Opening Balance page shows ONE snapshot", () => {
  it("the summary reads only the latest date", () => {
    const api = code("app/api/ob/summary/route.ts");
    expect(api).toContain("prisma.obRecord.aggregate({ _max: { date: true } })");
    // Every count and sum must be scoped, not just the listing.
    expect(api).toContain("prisma.obRecord.count({ where: current })");
    expect(api).toContain("prisma.obRecord.aggregate({ where: current, _sum: { amount: true } })");
    expect(api, "the unscoped count is what reported 2,730 retailers for 1,930").not.toContain(
      "prisma.obRecord.count(),",
    );
  });

  it("the retailer opportunity reader keeps the newest row per retailer", () => {
    /*
     * It built `new Map(ob.map(...))`, so with two dates in the table a
     * retailer's balance was whichever row the database happened to return
     * last — an August figure on a September screen, with nothing to show for
     * it.
     *
     * Settled in memory rather than with a `max(date)` lookup, because
     * `tests/query-depth.smoke.test.ts` holds this function to ONE wave of
     * queries; a lookup-then-filter would be two and would trade a silent
     * wrong number for a silent slow page.
     */
    const lib = code("lib/retailer-opportunities.ts");
    expect(lib, "the OB query must bring the date back").toContain(
      "select: { retailerId: true, amount: true, date: true }",
    );
    expect(lib, "the newest row per retailer must win").toContain("if (!held || x.date > held.date)");
    expect(lib, "the last row to arrive must not silently win").not.toContain(
      "new Map(ob.map((x) => [x.retailerId, Number(x.amount)]))",
    );
  });

  it("the importer still replaces rather than appends", () => {
    // The filter above is defence, not a licence to start accumulating.
    expect(code("lib/ob-import.ts")).toContain("await tx.obRecord.deleteMany({});");
  });
});

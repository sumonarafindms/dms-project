import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Query-count regressions.
 *
 * An N+1 is invisible in every other check: types pass, tests pass, the page
 * renders correctly, and it only hurts once there is real data. The BP list ran
 * one `gaActivation.count` per assignment inside a `Promise.all`, so a full
 * page issued 501 database round trips; the RSO drill-down loaded every GA,
 * C2S and C2C row for every retailer to display a column of totals.
 *
 * These tests pin the shape of the fix: the number of queries must not grow
 * with the number of rows.
 */

const calls: string[] = [];
const stub: Record<string, unknown> = {};

vi.mock("../lib/prisma", () => {
  const model = (m: string) =>
    new Proxy({} as Record<string, (a?: unknown) => Promise<unknown>>, {
      get: (_t, op) => () => {
        const key = `${m}.${String(op)}`;
        calls.push(key);
        if (op === "count") return Promise.resolve(0);
        if (op === "aggregate") return Promise.resolve({ _sum: {}, _count: { _all: 0 } });
        if (op === "findUnique" || op === "findFirst") return Promise.resolve(stub[key] ?? null);
        return Promise.resolve(stub[key] ?? []);
      },
    });
  return { prisma: new Proxy({} as Record<string, unknown>, { get: (_t, m) => model(String(m)) }) };
});

const { listBpAssignments } = await import("../lib/bp-activations");
const { forgetGaTariff } = await import("../lib/ga-tariff");
const { employeeDetail } = await import("../lib/employee-detail");

const assignments = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `a${i}`,
    active: true,
    retailerId: `r${i}`,
    employeeId: "e1",
    gaTarget: 20,
    startDate: new Date("2026-08-01T00:00:00Z"),
    endDate: null,
    monthlyTargets: [],
    retailer: { retailerCode: `RET-${i}`, retailerName: `Outlet ${i}` },
    employee: { name: "RSO", employeeCode: "E1", supervisor: { name: "Sup" } },
  }));

const retailers = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    retailerCode: `RET-${i}`,
    retailerName: `Outlet ${i}`,
    simSeller: "Y",
    category: "A",
    route: "R1",
  }));

beforeEach(() => {
  calls.length = 0;
  for (const k of Object.keys(stub)) delete stub[k];
});

describe("listBpAssignments", () => {
  const run = async (n: number) => {
    stub["bpAssignment.findMany"] = assignments(n);
    /*
     * The tariff cache is dropped before each run, deliberately.
     *
     * v177 made `standardGaByAssignment` also read the learned 170 tariff,
     * which `lib/ga-tariff.ts` caches for 60 seconds. Without this the first
     * run paid for that lookup and the second did not, so the two runs
     * differed by one — and the test would have been reporting a cache hit as
     * a query-count difference. What this file measures is whether the work
     * grows with the number of assignments; a warm cache has nothing to say
     * about that.
     */
    forgetGaTariff();
    calls.length = 0;
    await listBpAssignments({ role: "ADMIN" } as never, "2026-08");
    return calls.length;
  };

  it("issues the same number of queries for 1 and for 500 assignments", async () => {
    const one = await run(1);
    const many = await run(500);
    expect(many).toBe(one);
  });

  it("groups GA in a fixed number of queries instead of counting per assignment", async () => {
    /*
     * Two `groupBy`s now, not one: the day's activations, and the learned 170
     * tariff (v172) that decides the tier split. Neither depends on how many
     * assignments are in the list, which is the property — so it is asserted
     * that way, by running the same thing at two sizes, rather than by
     * hardcoding a number that has to be edited whenever a fixed lookup is
     * added.
     */
    await run(50);
    const fifty = calls.filter((c) => c === "gaActivation.groupBy").length;
    expect(calls.filter((c) => c === "gaActivation.count")).toHaveLength(0);

    await run(1);
    const one = calls.filter((c) => c === "gaActivation.groupBy").length;
    expect(calls.filter((c) => c === "gaActivation.count")).toHaveLength(0);

    expect(fifty, "GA grouping grows with the number of assignments").toBe(one);
    expect(fifty).toBeLessThanOrEqual(2);
  });
});

describe("employeeDetail", () => {
  const run = async (n: number) => {
    stub["retailer.findMany"] = retailers(n);
    stub["employee.findUnique"] = { id: "e1", name: "RSO", supervisor: null };
    stub["employee.findMany"] = [
      {
        id: "e1",
        name: "RSO",
        rsoMsisdn: "01711000001",
        employeeCode: "E1",
        supervisor: null,
        _count: { retailers: n },
        targets: [],
        manualMetrics: [],
      },
    ];
    calls.length = 0;
    await employeeDetail("e1", "2026-08");
    return calls.length;
  };

  it("issues the same number of queries for 1 and for 200 retailers", async () => {
    const one = await run(1);
    const many = await run(200);
    expect(many).toBe(one);
  });

  it("aggregates in the database rather than loading event rows", async () => {
    await run(50);
    // The old version reached these through a nested include on retailer, which
    // returned one row per activation / record. Aggregates return one row per
    // retailer (per classification+day for GA), whatever the history size.
    expect(calls).toContain("gaActivation.groupBy");
    expect(calls).toContain("c2sRecord.groupBy");
    expect(calls).toContain("c2cRecord.groupBy");
    expect(calls.filter((c) => c === "gaActivation.findMany")).toHaveLength(0);
  });
});

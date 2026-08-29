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
    calls.length = 0;
    await listBpAssignments({ role: "ADMIN" } as never, "2026-08");
    return calls.length;
  };

  it("issues the same number of queries for 1 and for 500 assignments", async () => {
    const one = await run(1);
    const many = await run(500);
    expect(many).toBe(one);
  });

  it("groups GA in a single query instead of counting per assignment", async () => {
    await run(50);
    expect(calls.filter((c) => c === "gaActivation.count")).toHaveLength(0);
    expect(calls.filter((c) => c === "gaActivation.groupBy")).toHaveLength(1);
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

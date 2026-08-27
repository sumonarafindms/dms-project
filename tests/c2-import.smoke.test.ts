import { describe, expect, it } from "vitest";
import {
  type C2ReplacementPlan,
  type C2RetailerRef,
  type MappedC2Row,
  computeImportHash,
  mapRetailersForC2Rows,
  parseC2Workbook,
  planMonthReplacement,
} from "../lib/c2-import-core";

// C2C and C2S share one file format and one rule set (lib/c2-import-core.ts).
// These tests exercise that shared module directly — no mock Prisma client
// needed — which is what makes the master-handoff scenarios (first upload,
// changed amount, disappearing retailer, duplicate file) testable without a
// live database.

function buildC2Buffer(
  dateLabels: string[],
  rows: Array<{
    retailerCode: string;
    itopup?: string;
    trxCount: number | string;
    totalAmount: number | string;
    sr?: string;
    daily: Array<number | string>;
  }>,
) {
  const header = [
    "RETAILER_CODE",
    "RETAILER_ITOPUP_NO",
    "TRANSACTION_COUNT",
    "TOTAL_AMOUNT",
    "SRNUMBER",
    ...dateLabels,
  ].join("\t");
  const lines = rows.map((r) =>
    [
      r.retailerCode,
      r.itopup ?? "01700000001",
      String(r.trxCount),
      String(r.totalAmount),
      r.sr ?? "01700000001",
      ...r.daily.map(String),
    ].join("\t"),
  );
  return Buffer.from([header, ...lines].join("\n"), "utf8");
}

function retailer(id: string, code: string, rsoMsisdn?: string): C2RetailerRef {
  return {
    id,
    retailerCode: code,
    employeeId: rsoMsisdn ? `emp-${id}` : null,
    employee: rsoMsisdn ? { rsoMsisdn } : null,
  };
}

const AUG1 = new Date(Date.UTC(2026, 7, 1));
const AUG2 = new Date(Date.UTC(2026, 7, 2));

describe("parseC2Workbook — structural validation", () => {
  it("rejects a file missing required headings", () => {
    const buffer = Buffer.from("RETAILER_CODE\tTOTAL_AMOUNT\n001\t100", "utf8");
    expect(() => parseC2Workbook(buffer, "C2C")).toThrow(/Required headings missing/);
  });

  it("rejects a file with no daily date columns", () => {
    const buffer = buildC2Buffer([], [{ retailerCode: "R001", trxCount: 1, totalAmount: 100, daily: [] }]);
    expect(() => parseC2Workbook(buffer, "C2C")).toThrow(/No daily date columns/);
  });

  it("rejects date columns spanning more than one calendar month, per report type", () => {
    const buffer = buildC2Buffer(
      ["01-Aug-2026", "01-Sep-2026"],
      [{ retailerCode: "R001", trxCount: 2, totalAmount: 100, daily: [50, 50] }],
    );
    expect(() => parseC2Workbook(buffer, "C2C")).toThrow(/C2C date columns must belong to one calendar month/);
    expect(() => parseC2Workbook(buffer, "C2S")).toThrow(/C2S date columns must belong to one calendar month/);
  });

  it("rejects an empty report", () => {
    const buffer = Buffer.from(
      "RETAILER_CODE\tRETAILER_ITOPUP_NO\tTRANSACTION_COUNT\tTOTAL_AMOUNT\tSRNUMBER\t01-Aug-2026",
      "utf8",
    );
    expect(() => parseC2Workbook(buffer, "C2C")).toThrow(/report is empty/);
  });

  it("collects an invalid TRANSACTION_COUNT as a row error instead of throwing", () => {
    const buffer = buildC2Buffer(
      ["01-Aug-2026"],
      [{ retailerCode: "R001", trxCount: "abc", totalAmount: 100, daily: [100] }],
    );
    const parsed = parseC2Workbook(buffer, "C2C");
    expect(parsed.sourceRows).toHaveLength(0);
    expect(parsed.preErrors[0].message).toMatch(/TRANSACTION_COUNT is invalid/);
  });

  it("collects a negative TOTAL_AMOUNT as a row error", () => {
    const buffer = buildC2Buffer(
      ["01-Aug-2026"],
      [{ retailerCode: "R001", trxCount: 1, totalAmount: -5, daily: [-5] }],
    );
    const parsed = parseC2Workbook(buffer, "C2C");
    expect(parsed.preErrors[0].message).toMatch(/TOTAL_AMOUNT is invalid/);
  });

  it("rejects a row whose daily amounts do not sum to TOTAL_AMOUNT", () => {
    const buffer = buildC2Buffer(
      ["01-Aug-2026", "02-Aug-2026"],
      [{ retailerCode: "R001", trxCount: 2, totalAmount: 999, daily: [50, 50] }],
    );
    const parsed = parseC2Workbook(buffer, "C2C");
    expect(parsed.preErrors[0].message).toMatch(/does not match TOTAL_AMOUNT/);
  });

  it("parses a valid multi-day, multi-retailer report", () => {
    const buffer = buildC2Buffer(
      ["01-Aug-2026", "02-Aug-2026"],
      [
        { retailerCode: "R001", trxCount: 3, totalAmount: 300, daily: [100, 200] },
        { retailerCode: "R002", trxCount: 1, totalAmount: 150, daily: [150, 0] },
      ],
    );
    const parsed = parseC2Workbook(buffer, "C2C");
    expect(parsed.sourceRows).toHaveLength(2);
    expect(parsed.month.toISOString().slice(0, 10)).toBe("2026-08-01");
    expect(parsed.firstDate.getTime()).toBe(AUG1.getTime());
    expect(parsed.reportEndDate.getTime()).toBe(AUG2.getTime());
    // A zero-amount day is dropped from `daily` but still counts toward the total.
    expect(parsed.sourceRows[1].daily).toHaveLength(1);
  });
});

describe("mapRetailersForC2Rows", () => {
  it("maps a found retailer and records no warning when the RSO matches", () => {
    const parsed = parseC2Workbook(
      buildC2Buffer(
        ["01-Aug-2026"],
        [{ retailerCode: "R001", sr: "01711111111", trxCount: 1, totalAmount: 100, daily: [100] }],
      ),
      "C2C",
    );
    const retailerMap = new Map([["R001", retailer("ret-1", "R001", "01711111111")]]);
    const { mapped, errors, assignmentWarnings } = mapRetailersForC2Rows(parsed.sourceRows, retailerMap);
    expect(mapped).toHaveLength(1);
    expect(mapped[0].retailerId).toBe("ret-1");
    expect(errors).toHaveLength(0);
    expect(assignmentWarnings).toBe(0);
  });

  it("flags an assignment warning when the file's SR number differs from Retailer Master's RSO", () => {
    const parsed = parseC2Workbook(
      buildC2Buffer(
        ["01-Aug-2026"],
        [{ retailerCode: "R001", sr: "01799999999", trxCount: 1, totalAmount: 100, daily: [100] }],
      ),
      "C2C",
    );
    const retailerMap = new Map([["R001", retailer("ret-1", "R001", "01711111111")]]);
    const { assignmentWarnings } = mapRetailersForC2Rows(parsed.sourceRows, retailerMap);
    expect(assignmentWarnings).toBe(1);
  });

  it("rejects a row whose retailer code is not in Retailer Master, without dropping it silently", () => {
    const parsed = parseC2Workbook(
      buildC2Buffer(["01-Aug-2026"], [{ retailerCode: "UNKNOWN", trxCount: 1, totalAmount: 100, daily: [100] }]),
      "C2C",
    );
    const { mapped, errors } = mapRetailersForC2Rows(parsed.sourceRows, new Map());
    expect(mapped).toHaveLength(0);
    expect(errors[0].message).toMatch(/does not exist in Retailer Master/);
  });
});

describe("computeImportHash — exact-file duplicate detection", () => {
  it("is deterministic for identical bytes", () => {
    const bytes = buildC2Buffer(
      ["01-Aug-2026"],
      [{ retailerCode: "R001", trxCount: 1, totalAmount: 100, daily: [100] }],
    );
    expect(computeImportHash(bytes)).toBe(computeImportHash(Buffer.from(bytes)));
  });

  it("differs when a single byte of the file changes", () => {
    const bytesA = buildC2Buffer(
      ["01-Aug-2026"],
      [{ retailerCode: "R001", trxCount: 1, totalAmount: 100, daily: [100] }],
    );
    const bytesB = buildC2Buffer(
      ["01-Aug-2026"],
      [{ retailerCode: "R001", trxCount: 1, totalAmount: 101, daily: [101] }],
    );
    expect(computeImportHash(bytesA)).not.toBe(computeImportHash(bytesB));
  });
});

describe("planMonthReplacement — authoritative month snapshot", () => {
  type FakeStore = { daily: C2ReplacementPlan["dailyRecords"]; summaries: C2ReplacementPlan["monthlySummaries"] };
  const emptyStore: FakeStore = { daily: [], summaries: [] };

  // Mirrors exactly what the real importer's transaction does:
  // deleteMany(whole month) then createMany(this file's rows). Using the same
  // plan object the importer builds means this is a real regression test of
  // the replacement contract, not a re-implementation of it.
  function applyPlan(store: FakeStore, plan: C2ReplacementPlan): FakeStore {
    const daily = store.daily.filter((r) => !(r.date >= plan.month && r.date < plan.monthEnd));
    const summaries = store.summaries.filter((s) => s.month.getTime() !== plan.month.getTime());
    return { daily: [...daily, ...plan.dailyRecords], summaries: [...summaries, ...plan.monthlySummaries] };
  }

  function mappedRow(
    retailerId: string,
    totalAmount: number,
    daily: Array<{ date: Date; amount: number }>,
  ): MappedC2Row {
    return {
      rowNumber: 2,
      retailerCode: retailerId.toUpperCase(),
      retailerItopupNo: "",
      transactionCount: daily.length,
      totalAmount,
      srNumber: "",
      daily,
      retailerId,
    };
  }

  it("deletes and inserts the whole calendar month, not a retailer-scoped slice", () => {
    const month = AUG1;
    const plan = planMonthReplacement({
      month,
      batchId: "b1",
      reportEndDate: AUG1,
      mapped: [mappedRow("ret-1", 100, [{ date: AUG1, amount: 100 }])],
    });
    expect(plan.deleteDailyWhere).toEqual({ date: { gte: month, lt: new Date(Date.UTC(2026, 8, 1)) } });
    expect(plan.deleteSummaryWhere).toEqual({ month });
  });

  it("first monthly upload: an empty store ends up with exactly the file's rows", () => {
    const plan = planMonthReplacement({
      month: AUG1,
      batchId: "b1",
      reportEndDate: AUG1,
      mapped: [mappedRow("ret-A", 300, [{ date: AUG1, amount: 300 }])],
    });
    const store = applyPlan(emptyStore, plan);
    expect(store.summaries).toHaveLength(1);
    expect(store.summaries[0].totalAmount).toBe(300);
  });

  it("newer cumulative upload with a changed amount replaces the figure, not adds to it", () => {
    const plan1 = planMonthReplacement({
      month: AUG1,
      batchId: "b1",
      reportEndDate: AUG1,
      mapped: [mappedRow("ret-A", 300, [{ date: AUG1, amount: 300 }])],
    });
    const store1 = applyPlan(emptyStore, plan1);

    const plan2 = planMonthReplacement({
      month: AUG1,
      batchId: "b2",
      reportEndDate: AUG2,
      mapped: [
        mappedRow("ret-A", 500, [
          { date: AUG1, amount: 200 },
          { date: AUG2, amount: 300 },
        ]),
      ],
    });
    const store2 = applyPlan(store1, plan2);

    expect(store2.summaries).toHaveLength(1);
    expect(store2.summaries[0].totalAmount).toBe(500);
    expect(store2.daily.reduce((sum, r) => sum + r.amount, 0)).toBe(500);
  });

  it("a retailer missing from the newer file leaves no stale rows behind", () => {
    const plan1 = planMonthReplacement({
      month: AUG1,
      batchId: "b1",
      reportEndDate: AUG1,
      mapped: [
        mappedRow("ret-A", 300, [{ date: AUG1, amount: 300 }]),
        mappedRow("ret-B", 150, [{ date: AUG1, amount: 150 }]),
      ],
    });
    const store1 = applyPlan(emptyStore, plan1);
    expect(store1.summaries).toHaveLength(2);

    // Newer file only reports retailer A — B dropped out of the field (handoff §11/§12).
    const plan2 = planMonthReplacement({
      month: AUG1,
      batchId: "b2",
      reportEndDate: AUG2,
      mapped: [mappedRow("ret-A", 320, [{ date: AUG1, amount: 320 }])],
    });
    const store2 = applyPlan(store1, plan2);

    expect(store2.summaries).toHaveLength(1);
    expect(store2.summaries.some((s) => s.retailerId === "ret-B")).toBe(false);
    expect(store2.daily.some((d) => d.retailerId === "ret-B")).toBe(false);
  });

  it("does not touch a different month's stored data", () => {
    const julPlan = planMonthReplacement({
      month: new Date(Date.UTC(2026, 6, 1)),
      batchId: "b0",
      reportEndDate: new Date(Date.UTC(2026, 6, 1)),
      mapped: [mappedRow("ret-J", 900, [{ date: new Date(Date.UTC(2026, 6, 1)), amount: 900 }])],
    });
    const storeWithJuly = applyPlan(emptyStore, julPlan);

    const augPlan = planMonthReplacement({
      month: AUG1,
      batchId: "b1",
      reportEndDate: AUG1,
      mapped: [mappedRow("ret-A", 300, [{ date: AUG1, amount: 300 }])],
    });
    const store = applyPlan(storeWithJuly, augPlan);

    expect(store.summaries.find((s) => s.retailerId === "ret-J")?.totalAmount).toBe(900);
    expect(store.summaries.find((s) => s.retailerId === "ret-A")?.totalAmount).toBe(300);
  });
});

describe("end-to-end parse -> map -> plan, without a database", () => {
  it("produces a coherent plan for a realistic two-retailer file", () => {
    const buffer = buildC2Buffer(
      ["01-Aug-2026", "02-Aug-2026"],
      [
        { retailerCode: "R001", sr: "01711111111", trxCount: 3, totalAmount: 300, daily: [100, 200] },
        { retailerCode: "R002", sr: "01722222222", trxCount: 1, totalAmount: 150, daily: [150, 0] },
      ],
    );
    const parsed = parseC2Workbook(buffer, "C2C");
    const retailerMap = new Map([
      ["R001", retailer("ret-1", "R001", "01711111111")],
      ["R002", retailer("ret-2", "R002", "01722222222")],
    ]);
    const { mapped, errors } = mapRetailersForC2Rows(parsed.sourceRows, retailerMap);
    expect(errors).toHaveLength(0);

    const plan = planMonthReplacement({
      month: parsed.month,
      batchId: "b1",
      reportEndDate: parsed.reportEndDate,
      mapped,
    });
    expect(plan.monthlySummaries).toHaveLength(2);
    expect(plan.dailyRecords.reduce((sum, r) => sum + r.amount, 0)).toBe(450);
  });
});

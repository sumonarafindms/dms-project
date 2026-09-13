import { describe, expect, it } from "vitest";
import { type MappedC2Row, mergeRowsByRetailer, parseC2Workbook, planMonthReplacement } from "../lib/c2-import-core";
import { mergeObRowsByRetailer } from "../lib/ob-import";

/**
 * One retailer, several lines, one stored row.
 *
 * ## The bug, found in the owner's real StockLifting export
 *
 * A BP retailer served by more than one RSO gets **one line per RSO**. In the
 * real file, eight retailers appeared more than once — every one of them a BP —
 * and one appeared three times, twice under the same RSO code:
 *
 *     R341946  R.R Enterprise BP-15  RS041549 …
 *     R341946  R.R Enterprise BP-15  RS055606 …
 *     R341946  R.R Enterprise BP-15  RS041549 …
 *
 * `C2cMonthlySummary` is unique on `(retailerId, month)` and `C2cRecord` on
 * `(retailerId, date)`, so the second line of a repeated retailer broke the
 * constraint inside the import transaction. The failure was not that row's:
 *
 *     Unique constraint failed on the fields: (`retailerId`,`month`)
 *
 * — the whole transaction rolled back, all 1,936 rows of it. **A daily C2C
 * upload could not complete at all.**
 *
 * ## Why it survived every existing test
 *
 * Nothing in the suite fed an importer two lines for one retailer, because
 * nobody writing a fixture by hand thinks to. It took the owner's own file.
 *
 * ## The rule
 *
 * The lines are the same outlet's, arriving through different RSOs, so the
 * figures add: what the outlet lifted this month is what came through all of
 * them. Keeping only the first line would be worse than the crash — it would
 * discard real stock lifting and say nothing.
 */

const day = (d: number) => new Date(Date.UTC(2026, 8, d));

function row(retailerId: string, over: Partial<MappedC2Row> = {}): MappedC2Row {
  return {
    rowNumber: 1,
    retailerCode: retailerId,
    retailerItopupNo: "01700000001",
    transactionCount: 0,
    totalAmount: 0,
    srNumber: "01900000001",
    daily: [],
    identity: { retailerName: "OUTLET", iTopUpSeller: "Y", enabled: "Y", iTopUpSrNumber: "", rsoCode: "" },
    retailerId,
    ...over,
  };
}

describe("mergeRowsByRetailer", () => {
  it("adds the figures of a BP that appears under two RSOs", () => {
    const merged = mergeRowsByRetailer([
      row("bp1", {
        srNumber: "01900000001",
        transactionCount: 3,
        totalAmount: 700,
        daily: [
          { date: day(1), amount: 300 },
          { date: day(2), amount: 400 },
        ],
      }),
      row("bp1", {
        srNumber: "01900000002",
        transactionCount: 2,
        totalAmount: 250,
        daily: [
          { date: day(2), amount: 150 },
          { date: day(3), amount: 100 },
        ],
      }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].transactionCount).toBe(5);
    expect(merged[0].totalAmount).toBe(950);
    expect(merged[0].daily.map((d) => [d.date.getUTCDate(), d.amount])).toEqual([
      [1, 300],
      [2, 550], // the day both RSOs lifted through this BP
      [3, 100],
    ]);
  });

  it("handles the same retailer three times, twice under one RSO", () => {
    // Exactly the shape of R341946 in the real file.
    const merged = mergeRowsByRetailer([
      row("bp15", { srNumber: "019A", totalAmount: 10, daily: [{ date: day(1), amount: 10 }] }),
      row("bp15", { srNumber: "019B", totalAmount: 20, daily: [{ date: day(1), amount: 20 }] }),
      row("bp15", { srNumber: "019A", totalAmount: 5, daily: [{ date: day(1), amount: 5 }] }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].totalAmount).toBe(35);
    expect(merged[0].daily[0].amount).toBe(35);
  });

  it("loses nothing — the merged total equals the sum of the lines", () => {
    /*
     * The assertion that would catch "keep the first line and drop the rest",
     * which is the tempting fix and a silent data loss.
     */
    const lines = [
      row("a", { totalAmount: 100, daily: [{ date: day(1), amount: 100 }] }),
      row("b", { totalAmount: 250, daily: [{ date: day(1), amount: 250 }] }),
      row("a", { totalAmount: 400, daily: [{ date: day(2), amount: 400 }] }),
      row("c", { totalAmount: 7, daily: [{ date: day(3), amount: 7 }] }),
      row("a", { totalAmount: 3, daily: [{ date: day(1), amount: 3 }] }),
    ];
    const before = lines.reduce((a, r) => a + r.totalAmount, 0);
    const merged = mergeRowsByRetailer(lines);
    expect(merged).toHaveLength(3);
    expect(merged.reduce((a, r) => a + r.totalAmount, 0)).toBe(before);
    expect(merged.reduce((a, r) => a + r.daily.reduce((b, d) => b + d.amount, 0), 0)).toBe(before);
  });

  it("leaves a file with no repeats exactly as it was", () => {
    const lines = [row("a", { totalAmount: 5 }), row("b", { totalAmount: 6 })];
    expect(mergeRowsByRetailer(lines).map((r) => [r.retailerId, r.totalAmount])).toEqual([
      ["a", 5],
      ["b", 6],
    ]);
  });

  it("does not mutate the rows it was given", () => {
    // The caller still counts `mapped.length` for `successRows`, and the parse
    // result is reused. Merging must be a read.
    const first = row("a", { totalAmount: 100, daily: [{ date: day(1), amount: 100 }] });
    const lines = [first, row("a", { totalAmount: 400, daily: [{ date: day(1), amount: 400 }] })];
    mergeRowsByRetailer(lines);
    expect(first.totalAmount).toBe(100);
    expect(first.daily[0].amount).toBe(100);
    expect(lines).toHaveLength(2);
  });
});

describe("the plan can never break a unique constraint", () => {
  const plan = (mapped: MappedC2Row[]) =>
    planMonthReplacement({ month: day(1), batchId: "b1", reportEndDate: day(7), mapped });

  it("emits one monthly summary per retailer", () => {
    const p = plan([
      row("bp1", { totalAmount: 700 }),
      row("bp1", { totalAmount: 250 }),
      row("shop", { totalAmount: 10 }),
    ]);
    // (retailerId, month) is unique in the schema. Two entries here is the
    // crash, not a warning.
    const keys = p.monthlySummaries.map((s) => `${s.retailerId}|${s.month.toISOString()}`);
    expect(new Set(keys).size, "two summary rows for one retailer and month").toBe(keys.length);
    expect(p.monthlySummaries.find((s) => s.retailerId === "bp1")?.totalAmount).toBe(950);
  });

  it("emits one daily record per retailer and day", () => {
    const p = plan([
      row("bp1", {
        daily: [
          { date: day(1), amount: 300 },
          { date: day(2), amount: 400 },
        ],
      }),
      row("bp1", { daily: [{ date: day(2), amount: 150 }] }),
    ]);
    const keys = p.dailyRecords.map((d) => `${d.retailerId}|${d.date.toISOString()}`);
    expect(new Set(keys).size, "two daily rows for one retailer and date").toBe(keys.length);
    expect(p.dailyRecords.find((d) => d.date.getUTCDate() === 2)?.amount).toBe(550);
  });

  it("still replaces the whole month, not only the retailers in the file", () => {
    // The merge must not have narrowed the delete — a retailer that drops out
    // of the file has to lose its month.
    const p = plan([row("a"), row("a")]);
    expect(p.deleteSummaryWhere).toEqual({ month: day(1) });
    expect(p.deleteDailyWhere.date.gte).toEqual(day(1));
  });
});

describe("a real carrier export, in its real shape", () => {
  /*
   * The owner's files are tab-separated text with a `.xls` extension — not a
   * workbook at all, which is why `looksLikeWorkbook` (v156) correctly sends
   * them down the text path. This fixture reproduces that shape, including the
   * trailing tab, the CRLF endings, the Start/End Date columns that must NOT be
   * read as daily columns, and a BP listed under two RSOs.
   */
  const HEAD = [
    "CLUSTER_NAME",
    "REGION_NAME",
    "DISTRIBUTORCODE",
    "DISTRIBUTORNAME",
    "ITOPUPSRNUMBER",
    "RETAILER_CODE",
    "RETAILER_NAME",
    "RETAILER_ITOPUP_NO",
    "TRANSACTION_COUNT",
    "TOTAL_AMOUNT",
    "RSOCODE",
    "SRNUMBER",
    "SUPERVISORNAME",
    "01-Sep-2026",
    "02-Sep-2026",
    "Start Date",
    "End Date",
    "",
  ];
  const line = (
    code: string,
    name: string,
    itop: string,
    count: number,
    total: number,
    rso: string,
    sr: string,
    d1: number,
    d2: number,
  ) =>
    [
      "Central Cluster",
      "Dhk-West",
      "DHKDHK73",
      "R.R. Enterprise",
      sr,
      code,
      name,
      itop,
      count,
      total,
      rso,
      sr,
      "A Supervisor",
      d1,
      d2,
      "9/1/2026 12:00:00 AM",
      "9/8/2026 12:00:00 AM",
      "",
    ].join("\t");

  const FILE = Buffer.from(
    [
      HEAD.join("\t"),
      line("R000001", "SHOP ONE", "01700000001", 2, 500, "RS0001", "01900000001", 200, 300),
      line("R000002", "R.R Enterprise BP-15", "01700000002", 1, 100, "RS0002", "01900000002", 100, 0),
      line("R000002", "R.R Enterprise BP-15", "01700000002", 3, 250, "RS0003", "01900000003", 50, 200),
    ].join("\r\n") + "\r\n",
    "utf8",
  );

  it("reads it, and keeps Start/End Date out of the daily columns", () => {
    const parsed = parseC2Workbook(FILE, "C2C");
    expect(parsed.sourceRows).toHaveLength(3);
    expect(
      parsed.dateColumns.map((d) => d.label),
      "a Start Date column was read as a daily column",
    ).toEqual(["01-Sep-2026", "02-Sep-2026"]);
    expect(parsed.month.toISOString().slice(0, 7)).toBe("2026-09");
  });

  it("stores the repeated BP once, with both RSOs' figures", () => {
    const parsed = parseC2Workbook(FILE, "C2C");
    const mapped = parsed.sourceRows.map((r) => ({ ...r, retailerId: `id-${r.retailerCode}` }));
    const p = planMonthReplacement({
      month: parsed.month,
      batchId: "b1",
      reportEndDate: parsed.reportEndDate,
      mapped,
    });

    expect(p.monthlySummaries).toHaveLength(2); // three lines, two retailers
    const bp = p.monthlySummaries.find((s) => s.retailerId === "id-R000002");
    expect(bp?.totalAmount).toBe(350);
    expect(bp?.transactionCount).toBe(4);

    // And the file's own total survives the round trip, which is the check the
    // owner would actually make.
    const fileTotal = 500 + 100 + 250;
    expect(p.monthlySummaries.reduce((a, s) => a + s.totalAmount, 0)).toBe(fileTotal);
    expect(p.dailyRecords.reduce((a, d) => a + d.amount, 0)).toBe(fileTotal);
  });
});

describe("Opening Balance is protected the same way", () => {
  /*
   * `ObRecord` is unique on (retailerId, date) too, and OB replaces the entire
   * snapshot in one transaction — a repeated retailer would lose the whole
   * balance file, not one row.
   *
   * Today's Balance export happens to have no duplicates. Testing only the
   * shapes a current file happens to contain is exactly how the C2C crash got
   * as far as the owner's machine.
   */
  it("combines a retailer that appears twice", () => {
    const merged = mergeObRowsByRetailer([
      { retailerId: "bp1", amount: 1200.5, transactionCount: 1 },
      { retailerId: "shop", amount: 300, transactionCount: 2 },
      { retailerId: "bp1", amount: 800.25, transactionCount: 3 },
    ]);
    expect(merged).toHaveLength(2);
    const bp = merged.find((r) => r.retailerId === "bp1");
    expect(bp?.amount).toBeCloseTo(2000.75, 2);
    expect(bp?.transactionCount).toBe(4);
  });

  it("keeps the snapshot total intact", () => {
    const rows = [
      { retailerId: "a", amount: 10.1, transactionCount: 1 },
      { retailerId: "b", amount: 20.2, transactionCount: 1 },
      { retailerId: "a", amount: 30.3, transactionCount: 1 },
    ];
    const before = rows.reduce((t, r) => t + r.amount, 0);
    expect(mergeObRowsByRetailer(rows).reduce((t, r) => t + r.amount, 0)).toBeCloseTo(before, 6);
  });

  it("leaves a file with no repeats alone", () => {
    const rows = [
      { retailerId: "a", amount: 5, transactionCount: 1 },
      { retailerId: "b", amount: 6, transactionCount: 1 },
    ];
    expect(mergeObRowsByRetailer(rows)).toEqual(rows);
  });
});

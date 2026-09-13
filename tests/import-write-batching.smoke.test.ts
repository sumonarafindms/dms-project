import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  IMPORT_CHUNK,
  IMPORT_TX_OPTIONS,
  type C2MonthWriter,
  type MappedC2Row,
  planMonthReplacement,
  writeMonthPlan,
} from "../lib/c2-import-core";

/**
 * An import's write cost must not grow with the number of retailers.
 *
 * ## The failure
 *
 * The monthly summaries were written one row at a time — `create` in a loop —
 * inside a single interactive transaction. For the owner's real C2C file that
 * is 1,927 statements. On a database on the same machine it takes about two
 * seconds and nobody notices; on a hosted one every statement is a network
 * round trip, and the upload died with:
 *
 *     Invalid `prisma.c2cMonthlySummary.create()` invocation:
 *     Transaction API error: Transaction already closed: A query cannot be
 *     executed on an expired transaction. The timeout for this transaction was
 *     5000 ms, however 5041 ms passed since the start of the transaction.
 *
 * It missed by 41 milliseconds — and because it is one transaction, the whole
 * thing rolled back. A completely valid file stored **nothing**.
 *
 * Reproduced by shrinking the budget to 1000 ms, which is what a slow link does
 * to a fixed amount of work:
 *
 *     BEFORE (create per row): FAILED — Transaction API err… · stored 0 daily, 0 summaries
 *     AFTER  (createMany)    : OK in 433 ms · stored 3072 daily, 1927 summaries
 *
 * ## Why this is measured rather than grepped
 *
 * "Does the source contain createMany" is a check on spelling. The property
 * that matters is that **the statement count depends on the chunk count, never
 * on the row count** — so that is what is counted here, by running the real
 * write path against a recording writer.
 */

const day = (d: number) => new Date(Date.UTC(2026, 8, d));

function rows(n: number, daysEach = 2): MappedC2Row[] {
  return Array.from({ length: n }, (_, i) => ({
    rowNumber: i + 2,
    retailerCode: `R${i}`,
    retailerItopupNo: "01700000001",
    transactionCount: 1,
    totalAmount: 100,
    srNumber: "01900000001",
    daily: Array.from({ length: daysEach }, (_, d) => ({ date: day(d + 1), amount: 50 })),
    identity: { retailerName: `SHOP ${i}`, iTopUpSeller: "Y", enabled: "Y", iTopUpSrNumber: "", rsoCode: "" },
    retailerId: `id-${i}`,
  }));
}

/** Records every statement the write path issues, and how big each one was. */
function recorder() {
  const calls: Array<{ op: string; size: number }> = [];
  const writer: C2MonthWriter = {
    deleteDaily: async () => void calls.push({ op: "deleteDaily", size: 0 }),
    deleteSummaries: async () => void calls.push({ op: "deleteSummaries", size: 0 }),
    createDaily: async (r) => void calls.push({ op: "createDaily", size: r.length }),
    createSummaries: async (r) => void calls.push({ op: "createSummaries", size: r.length }),
  };
  return { calls, writer };
}

const planFor = (mapped: MappedC2Row[]) =>
  planMonthReplacement({ month: day(1), batchId: "b1", reportEndDate: day(7), mapped });

describe("the write path issues a handful of statements, not one per row", () => {
  it("writes the owner's real file size in single figures", async () => {
    // 1,927 retailers × 2 days — the shape of the file that failed.
    const { calls, writer } = recorder();
    await writeMonthPlan(writer, planFor(rows(1927)));
    expect(calls.length, `1,927 retailers produced ${calls.length} statements`).toBeLessThan(12);
    expect(calls.filter((c) => c.op === "createSummaries").length).toBe(2); // 1927 / 1000
  });

  it("grows with the chunk count, not the row count", async () => {
    /*
     * The property, stated as the arithmetic rather than as "they are equal".
     *
     * My first version asserted that 100 and 1,000 retailers produce the same
     * number of statements, and it failed — correctly. 1,000 retailers × 2 days
     * is 2,000 daily rows, which is genuinely two chunks rather than one. The
     * code was right and the assertion was sloppy: what must hold is that the
     * count follows ceil(rows / chunk), not that it never moves.
     */
    const expected = (retailers: number, daysEach: number) =>
      2 + Math.ceil((retailers * daysEach) / IMPORT_CHUNK) + Math.ceil(retailers / IMPORT_CHUNK);

    for (const [retailers, daysEach] of [
      [100, 2],
      [1000, 2],
      [1927, 2],
      [5000, 7],
    ] as const) {
      const { calls, writer } = recorder();
      await writeMonthPlan(writer, planFor(rows(retailers, daysEach)));
      expect(calls.length, `${retailers} retailers × ${daysEach} days`).toBe(expected(retailers, daysEach));
    }

    // And the point of all of it: ten times the retailers is nowhere near ten
    // times the round trips.
    const small = recorder();
    await writeMonthPlan(small.writer, planFor(rows(500, 1)));
    const large = recorder();
    await writeMonthPlan(large.writer, planFor(rows(5000, 1)));
    expect(large.calls.length).toBeLessThan(small.calls.length * 4);
    expect(large.calls.length).toBeLessThan(20);
  });

  it("splits into chunks rather than sending one enormous statement", async () => {
    // The other failure mode: a single createMany of 250,000 rows exceeds the
    // driver's parameter limit.
    const { calls, writer } = recorder();
    await writeMonthPlan(writer, planFor(rows(IMPORT_CHUNK * 2 + 1)));
    const summaryCalls = calls.filter((c) => c.op === "createSummaries");
    expect(summaryCalls.map((c) => c.size)).toEqual([IMPORT_CHUNK, IMPORT_CHUNK, 1]);
  });

  it("still writes every row exactly once", async () => {
    /*
     * Batching that loses rows would be worse than the timeout. The recorder
     * adds up what it was handed and compares it with the plan.
     */
    const mapped = rows(1500, 3);
    const plan = planFor(mapped);
    const { calls, writer } = recorder();
    await writeMonthPlan(writer, plan);
    const sent = (op: string) => calls.filter((c) => c.op === op).reduce((t, c) => t + c.size, 0);
    expect(sent("createSummaries")).toBe(plan.monthlySummaries.length);
    expect(sent("createSummaries")).toBe(1500);
    expect(sent("createDaily")).toBe(plan.dailyRecords.length);
    expect(sent("createDaily")).toBe(4500);
  });

  it("clears the month before writing it, in that order", async () => {
    // Replacement, not accumulation — and a delete that ran after the inserts
    // would wipe the very rows just written.
    const { calls, writer } = recorder();
    await writeMonthPlan(writer, planFor(rows(3)));
    expect(calls.map((c) => c.op)).toEqual(["deleteDaily", "deleteSummaries", "createDaily", "createSummaries"]);
  });

  it("does nothing at all for an empty plan", async () => {
    const { calls, writer } = recorder();
    await writeMonthPlan(writer, planFor([]));
    expect(calls.map((c) => c.op)).toEqual(["deleteDaily", "deleteSummaries"]);
  });
});

describe("the transaction is given a budget a hosted database can meet", () => {
  it("allows far more than Prisma's five seconds", () => {
    /*
     * 5,000 ms is the default, and it is the exact number in the owner's error.
     * The round trips were the real fault, but the remaining work still scales
     * with the file, and a slow link must not turn a correct import into a
     * rollback.
     */
    expect(IMPORT_TX_OPTIONS.timeout).toBeGreaterThan(5_000 * 10);
    expect(IMPORT_TX_OPTIONS.maxWait).toBeGreaterThanOrEqual(10_000);
  });

  it("is actually passed to every import transaction", () => {
    /*
     * A constant nobody hands to `$transaction` is a comment. OB is included
     * because it rewrites the whole snapshot in one transaction too — and
     * because fixing two importers and forgetting the third is the mistake this
     * project has already made once, in v156.
     */
    const ROOT = path.join(__dirname, "..");
    const codeOf = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    for (const f of ["c2c-import.ts", "c2s-import.ts", "ob-import.ts"]) {
      const src = codeOf(fs.readFileSync(path.join(ROOT, "lib", f), "utf8"));
      expect(src, `${f} runs its write transaction on the default 5-second budget`).toMatch(
        /\$transaction\([\s\S]*?IMPORT_TX_OPTIONS/,
      );
    }
  });

  it("leaves no per-row create inside an import's write transaction", () => {
    /*
     * The generalisation. The specific loop is gone and measured above; this
     * stops the next one being written, in any of the three importers, for any
     * table.
     */
    const ROOT = path.join(__dirname, "..");
    const offenders: string[] = [];
    for (const f of ["c2c-import.ts", "c2s-import.ts", "ob-import.ts"]) {
      const src = fs
        .readFileSync(path.join(ROOT, "lib", f), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      if (/\btx\.\w+\.create\(/.test(src)) offenders.push(f);
    }
    expect(offenders, `these write rows one at a time inside a transaction:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });
});

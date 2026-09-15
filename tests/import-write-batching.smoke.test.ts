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
import { type GaExistingRow, type GaWriter, planGaWrite, writeGaPlan } from "../lib/ga-import";

const LIB = path.join(__dirname, "..", "lib");

/**
 * The importers, READ FROM DISK rather than listed here.
 *
 * The v163 version of this file spelled three of them out by name, GA was not
 * among them, and GA then shipped the exact bug the list existed to prevent.
 * A hand-written list cannot catch the file nobody remembered to add to it, so
 * it is not hand-written any more: a new `lib/*-import*.ts` is picked up the
 * moment it exists and must either satisfy the rules below or be given a
 * reason in EXEMPT.
 */
const IMPORTERS = fs.readdirSync(LIB).filter((f) => /-import(-core)?\.ts$/.test(f));

/**
 * Files that write rows one at a time on purpose, with the reason.
 *
 * Being in here is a decision someone has to make and write down, which is the
 * difference between an exemption and an oversight.
 */
const EXEMPT: Record<string, string> = {
  // No transaction of its own: it is the shared planning/writing core the C2
  // importers call from inside theirs.
  "c2-import-core.ts": "has no $transaction — it runs inside the caller's",
  // Employees and retailers are upserted one at a time because each row can
  // also produce an assignment-history entry, and the loop is already bounded
  // to 50-100 statements per transaction. A master file is uploaded rarely and
  // is an order of magnitude smaller than a day of GA.
  "master-import.ts": "per-row upserts, deliberately bounded to 50-100 per transaction",
};

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

describe("the list of importers cannot go stale", () => {
  it("finds every importer on disk", () => {
    // If the glob stops matching, every sweep below passes by checking nothing.
    expect(IMPORTERS.length).toBeGreaterThanOrEqual(6);
    for (const f of ["c2c-import.ts", "c2s-import.ts", "ob-import.ts", "ga-import.ts", "master-import.ts"])
      expect(IMPORTERS, `${f} is not being checked`).toContain(f);
  });

  it("exempts only files that exist", () => {
    // An exemption for a deleted file is a hole waiting for a new file to be
    // given the same name.
    for (const f of Object.keys(EXEMPT)) expect(IMPORTERS, `EXEMPT names ${f}, which is gone`).toContain(f);
  });

  it("actually checks something after the exemptions", () => {
    const checked = IMPORTERS.filter((f) => !EXEMPT[f]);
    expect(checked.sort()).toEqual(["c2c-import.ts", "c2s-import.ts", "ga-import.ts", "ob-import.ts"]);
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
     * A constant nobody hands to `$transaction` is a comment. Every importer is
     * included, and the list is now a shared constant, because "fixing two
     * importers and forgetting the third" is a mistake this project has made
     * twice: OB in v156, and then GA in v163 — where this very test was written
     * with the other three spelled out by name and GA left off the list.
     */
    const ROOT = path.join(__dirname, "..");
    const codeOf = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    for (const f of IMPORTERS.filter((f) => !EXEMPT[f])) {
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
    for (const f of IMPORTERS.filter((f) => !EXEMPT[f])) {
      const src = fs
        .readFileSync(path.join(ROOT, "lib", f), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      if (/\btx\.\w+\.create\(/.test(src)) offenders.push(f);
    }
    expect(offenders, `these write rows one at a time inside a transaction:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * GA — the importer the v163 fix missed.
 * ------------------------------------------------------------------ */

const gaDay = new Date(Date.UTC(2026, 8, 14));

function gaRows(n: number, price = 300) {
  return Array.from({ length: n }, (_, i) => ({
    rowNumber: i + 2,
    retailerCode: `R${100000 + (i % 200)}`,
    simNo: `8801700${1000000 + i}`,
    productCode: "MMST",
    sellingPrice: price,
    activationDate: gaDay,
    activationTime: "10:15:00",
  }));
}

const gaRetailers = new Map(Array.from({ length: 200 }, (_, i) => [`R${100000 + i}`, `ret-${i}`]));

/** An already-stored row for every SIM in `rows`, as the database would return it. */
function gaStored(rows: ReturnType<typeof gaRows>, price = 300): Map<string, GaExistingRow> {
  return new Map(
    rows.map((r, i) => [
      r.simNo,
      {
        id: `old-${i}`,
        retailerId: gaRetailers.get(r.retailerCode)!,
        activationDate: r.activationDate,
        activationTime: r.activationTime,
        sellingPrice: price,
        productCode: r.productCode,
        createdAt: new Date(Date.UTC(2026, 0, 1, 3, 4, 5)),
      },
    ]),
  );
}

const gaPlanFor = (rows: ReturnType<typeof gaRows>, existing = new Map<string, GaExistingRow>()) =>
  planGaWrite({ parsedRows: rows, retailerMap: gaRetailers, existing, batchId: "b1", preErrors: [] });

function gaRecorder() {
  const calls: Array<{ op: string; size: number }> = [];
  const writer: GaWriter = {
    deleteActivations: async (ids) => void calls.push({ op: "delete", size: ids.length }),
    createActivations: async (rows) => void calls.push({ op: "create", size: rows.length }),
  };
  return { calls, writer };
}

describe("a GA import costs a handful of statements, not one per activation", () => {
  /**
   * ## The measurement this was written from
   *
   * The importer built one `create` or `update` per row and handed the array to
   * `$transaction`. Against a Postgres on the same machine:
   *
   *     BEFORE  9,000 rows: 8,974 ms  ·  9,000 statements
   *     AFTER   9,000 rows: 1,414 ms  ·      10 statements
   *
   * The owner's database is not on the same machine. Every one of those 9,000
   * was a network round trip — the C2C importer measured 2.6 ms each — and
   * `/api/import/[type]` is capped at `maxDuration = 60`. A GA file does not
   * have to be much bigger than a normal day before the route is killed in the
   * middle of the transaction, which rolls it back and stores nothing.
   */
  it("writes a nine-thousand-row day in single figures", async () => {
    const { calls, writer } = gaRecorder();
    await writeGaPlan(writer, gaPlanFor(gaRows(9000)).plan);
    expect(calls.length, `9,000 activations produced ${calls.length} statements`).toBeLessThan(12);
  });

  it("grows with the chunk count, not the row count", async () => {
    for (const n of [1, 500, 1000, 1001, 9000]) {
      const { calls, writer } = gaRecorder();
      await writeGaPlan(writer, gaPlanFor(gaRows(n)).plan);
      expect(calls.length, `${n} activations`).toBe(Math.ceil(n / IMPORT_CHUNK));
    }
  });

  it("splits into chunks rather than sending one enormous statement", async () => {
    const { calls, writer } = gaRecorder();
    await writeGaPlan(writer, gaPlanFor(gaRows(IMPORT_CHUNK * 2 + 1)).plan);
    expect(calls.map((c) => c.size)).toEqual([IMPORT_CHUNK, IMPORT_CHUNK, 1]);
  });

  it("writes every activation exactly once", async () => {
    const rows = gaRows(2500);
    const { plan } = gaPlanFor(rows);
    const { calls, writer } = gaRecorder();
    await writeGaPlan(writer, plan);
    expect(calls.filter((c) => c.op === "create").reduce((t, c) => t + c.size, 0)).toBe(2500);
  });
});

describe("a corrected GA file rewrites rows without disturbing them", () => {
  it("clears every replaced row before inserting any of them", async () => {
    /*
     * Order, not tidiness. A rewritten row re-uses its own simNo, which is
     * unique — inserting it while the old copy is still there is a constraint
     * violation, and interleaving delete/insert chunk by chunk trips over rows
     * that live in a later chunk. Reproduced against Postgres: reversing these
     * two loops fails the import outright.
     */
    const rows = gaRows(2500, 150);
    const { plan } = gaPlanFor(rows, gaStored(rows, 300));
    const { calls, writer } = gaRecorder();
    await writeGaPlan(writer, plan);
    const lastDelete = calls.map((c) => c.op).lastIndexOf("delete");
    const firstCreate = calls.map((c) => c.op).indexOf("create");
    expect(lastDelete).toBeGreaterThanOrEqual(0);
    expect(firstCreate, "an insert ran before the last delete").toBeGreaterThan(lastDelete);
  });

  it("carries the original id and createdAt across the rewrite", () => {
    /*
     * The property that makes the batching legitimate.
     *
     * Nothing batches per-row updates — each carries a different payload, so
     * `updateMany` cannot express them. A changed row is therefore deleted and
     * re-inserted, which is only equivalent to an update if the row comes back
     * identical in every column the file does not set. Verified against
     * Postgres as well: 1,500 corrected rows kept all 1,500 ids and createdAts.
     */
    const rows = gaRows(1500, 150);
    const stored = gaStored(rows, 300);
    const { plan, updatedRows, insertedRows } = gaPlanFor(rows, stored);

    expect(updatedRows).toBe(1500);
    expect(insertedRows).toBe(0);
    expect(plan.replacedIds).toHaveLength(1500);
    expect(new Set(plan.replacedIds).size, "an id was replaced twice").toBe(1500);

    for (const row of plan.rows) {
      const old = stored.get(row.simNo)!;
      expect(row.id, `${row.simNo} was given a new id`).toBe(old.id);
      expect(row.createdAt?.getTime(), `${row.simNo} was re-stamped`).toBe(old.createdAt.getTime());
      expect(Number(row.sellingPrice), "the correction was not applied").toBe(150);
      expect(row.batchId, "the row still points at the old batch").toBe("b1");
    }
    // Every replaced id is actually re-inserted; a delete with no matching
    // insert would silently lose the activation.
    expect(new Set(plan.rows.map((r) => r.id))).toEqual(new Set(plan.replacedIds));
  });

  it("leaves an unchanged row completely alone", () => {
    // The daily case: yesterday's rows arrive again in today's file. They must
    // not be deleted and re-inserted for nothing.
    const rows = gaRows(1200, 300);
    const { plan, duplicateRows, updatedRows } = gaPlanFor(rows, gaStored(rows, 300));
    expect(duplicateRows).toBe(1200);
    expect(updatedRows).toBe(0);
    expect(plan.rows, "unchanged rows were rewritten anyway").toEqual([]);
    expect(plan.replacedIds).toEqual([]);
  });

  it("counts the same SIM twice in one file as a duplicate, not a correction", () => {
    const rows = [...gaRows(3), ...gaRows(3)];
    const { plan, insertedRows, duplicateRows } = gaPlanFor(rows);
    expect(insertedRows).toBe(3);
    expect(duplicateRows).toBe(3);
    expect(plan.rows).toHaveLength(3);
  });

  it("does nothing at all for an empty plan", async () => {
    const { calls, writer } = gaRecorder();
    await writeGaPlan(writer, gaPlanFor([]).plan);
    expect(calls).toEqual([]);
  });
});

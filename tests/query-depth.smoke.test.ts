/**
 * How many times a page has to WAIT for the database.
 *
 * `tests/query-count.smoke.test.ts` pins the number of queries, which is what
 * catches an N+1. This file pins something the count cannot see: how many of
 * those queries are issued one after another.
 *
 * ## Why it matters, and why it is invisible everywhere else
 *
 * Production runs on Vercel against `db.prisma.io`. The database is REMOTE, so
 * every wait costs a network round trip whether the query returns one row or
 * ten thousand. On the local Postgres a round trip is about a millisecond, so
 * twelve queries in a row are indistinguishable from twelve issued together —
 * the local timings for v178 and v179 are the same to within noise, and only
 * the deployed app would have felt the difference.
 *
 * Measured at production volume (2,190 retailers, 77k GA rows) with 30ms added
 * to every query, `employeePerformance` was **9 round trips deep** for a team
 * and 6 for a single RSO, and it runs on every role home and every performance
 * list in the app. Two waits were removed by asking for the retailers with a
 * relation filter instead of an id list from the previous query, and one by
 * letting the BP assignments join the aggregate batch they were blocking.
 *
 * ## How the depth is measured here
 *
 * The prisma stub resolves each call on a later microtask and records when it
 * started and finished. Queries that overlap in time were issued together and
 * cost ONE round trip between them; a query that starts after every earlier one
 * finished is a new wait. No database, no clock skew — the stub controls both.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { rel } from "./paths";

const ROOT = path.join(__dirname, "..");
/** Repo-relative, forward slashes, on every platform — see tests/test-portability. */
const relativeToRoot = rel(ROOT);

type Span = { start: number; end: number };
const spans: Span[] = [];
let tick = 0;

/**
 * Rows the stub hands back, per `model.operation`.
 *
 * Not decoration: `employeePerformance` returns early when no retailer is in
 * scope, so a stub that answers every `findMany` with `[]` measures only the
 * first half of the function and reports a flattering number. Found by
 * mutating — moving the BP assignments back out of the aggregate batch did not
 * fail the budget, because the batch was never reached.
 */
const ROWS: Record<string, unknown> = {
  "employee.findMany": [
    {
      id: "e1",
      name: "RSO One",
      rsoMsisdn: "01700000001",
      employeeCode: "E1",
      supervisor: { id: "s1", name: "Sup" },
      _count: { retailers: 2 },
      targets: [],
      manualMetrics: [],
    },
  ],
  "retailer.findMany": [{ id: "r1", employeeId: "e1", simSeller: "Y" }],
};

vi.mock("../lib/prisma", () => {
  const result = (m: string, op: string) => {
    if (ROWS[`${m}.${op}`]) return ROWS[`${m}.${op}`];
    if (op === "count") return 0;
    if (op === "aggregate") return { _sum: {}, _count: { _all: 0 } };
    if (op === "findUnique" || op === "findFirst") return null;
    return [];
  };
  const model = (m: string) =>
    new Proxy({} as Record<string, (a?: unknown) => Promise<unknown>>, {
      get: (_t, op) => () => {
        const start = tick++;
        // Resolve after a few microtasks so concurrent callers overlap and
        // sequential ones cannot: an `await` between two queries always lands
        // the second one's start after the first one's end.
        return Promise.resolve()
          .then(() => {})
          .then(() => {})
          .then(() => {
            spans.push({ start, end: tick++ });
            return result(m, String(op));
          });
      },
    });
  return { prisma: new Proxy({} as Record<string, unknown>, { get: (_t, m) => model(String(m)) }) };
});

const { employeePerformance } = await import("../lib/performance");
const { retailerOpportunities } = await import("../lib/retailer-opportunities");

/** Overlapping queries are one wait; a query that starts after them all is another. */
function depth(list: Span[]): number {
  const sorted = [...list].sort((a, b) => a.start - b.start);
  let waits = 0;
  let waveEnd = -1;
  for (const s of sorted) {
    if (s.start > waveEnd) {
      waits++;
      waveEnd = s.end;
    } else waveEnd = Math.max(waveEnd, s.end);
  }
  return waits;
}

beforeEach(() => {
  spans.length = 0;
  tick = 0;
});

describe("the instrument itself", () => {
  it("counts queries issued together as one wait", async () => {
    const { prisma } = await import("../lib/prisma");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = prisma as any;
    await Promise.all([p.employee.findMany(), p.retailer.findMany(), p.gaActivation.groupBy()]);
    expect(depth(spans)).toBe(1);
  });

  it("counts queries issued one after another as separate waits", async () => {
    // Without this the measurement could report 1 for everything and pass.
    const { prisma } = await import("../lib/prisma");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = prisma as any;
    await p.employee.findMany();
    await p.retailer.findMany();
    await p.gaActivation.groupBy();
    expect(depth(spans)).toBe(3);
  });
});

describe("employeePerformance does not queue up round trips", () => {
  /*
   * The budget is the shape, not a lucky number: employees and retailers
   * together, then the aggregates together. Prisma adds a wait of its own for
   * the `include` relations on the employee query, which is why this is 3 and
   * not 2.
   *
   * It was 5 before v179, and it is the most-called data function in the app.
   */
  const BUDGET = 2;

  it("actually runs the whole function, not just the part before the early return", () => {
    // The stub must produce a retailer, or the aggregate half is never reached
    // and the budget below measures nothing. See ROWS.
    expect((ROWS["retailer.findMany"] as unknown[]).length).toBeGreaterThan(0);
    expect((ROWS["employee.findMany"] as unknown[]).length).toBeGreaterThan(0);
  });

  it("stays within its round-trip budget", async () => {
    await employeePerformance("2026-09-01", ["e1", "e2", "e3"]);
    expect(
      depth(spans),
      `employeePerformance waits ${depth(spans)} times; the budget is ${BUDGET}. ` +
        `Every extra wait is a network round trip on every role home in the app.`,
    ).toBeLessThanOrEqual(BUDGET);
  });

  it("asks for the retailers without waiting for the employee ids", async () => {
    /*
     * The specific fix, stated so it cannot quietly revert: the retailer query
     * used to filter on `employeeId: { in: eids }` — ids the employee query had
     * just returned — so it could not start until that round trip came back. A
     * relation filter needs no ids and runs alongside.
     */
    await employeePerformance("2026-09-01", ["e1"]);
    const first = [...spans].sort((a, b) => a.start - b.start).slice(0, 2);
    expect(first[1].start, "the retailer query still waits for the employee query").toBeLessThan(first[0].end);
  });
});

describe("retailerOpportunities was already flat, and stays flat", () => {
  it("issues every query in one wait", async () => {
    // Six aggregates over the same range with nothing between them. This is the
    // shape employeePerformance was brought closer to.
    await retailerOpportunities("2026-09", ["e1"]);
    expect(depth(spans)).toBeLessThanOrEqual(2);
  });
});

describe("no client component reads the clock while it renders", () => {
  /*
   * A client component renders TWICE — once on the server for the initial HTML,
   * once in the browser on hydration. `new Date()` in the render path reads two
   * different clocks, and across a Dhaka midnight the two renders disagree.
   * React answers a mismatch by throwing the server's HTML away and rendering
   * the whole tree again.
   *
   * `EmployeeDetailView` has carried a note about this since it was written and
   * takes the instant as a prop. `ReportDateBar` did not: it called
   * `rangePresets()`, which reads `dhakaTodayYmd()`, so every preset's dates and
   * the highlighted preset were computed from two clocks. Every `/it/reports/*`
   * screen renders it.
   *
   * The prop is REQUIRED rather than optional, so the compiler names each
   * caller; an optional prop with a clock fallback leaves the bug wherever
   * somebody forgets, which is how this one survived.
   */
  const CLOCK = /\b(new Date\(\)|Date\.now\(\)|dhakaTodayYmd\(\)|dhakaYesterdayYmd\(\)|dhakaMonth\(\))/;

  /**
   * Reading the clock inside an EVENT HANDLER or an effect is fine — those run
   * only in the browser, after hydration. Only the render path renders twice.
   */
  const EXEMPT: Record<string, string> = {
    "app/dashboard/page.tsx": "reads it once into useState and inside fetch cache-busters, never during render",
    "app/ga/page.tsx": "a default for a date input, read in an event handler and a cache-buster",
    "app/c2c/page.tsx": "same as /ga",
    "app/c2s/page.tsx": "same as /ga",
    "app/admin/bp-management/BpManager.tsx": "a default for a date input in a form the user has opened",
    "app/components/AdminEmployeeForm.tsx": "a default for a date input in a form the user has opened",
    /*
     * The one honest exception, and it is not a clean one.
     *
     * `/targets` is a whole-page client component, so there is no server parent
     * to take an instant from — the fix the others use is not available without
     * turning it into a server page that passes the month down. It seeds
     * `useState` with `dhakaMonth()`, which changes at a MONTH boundary rather
     * than a daily one, so the window where the two renders disagree is once a
     * month instead of once a night.
     *
     * Rarer is not fixed. "It is only a one-second window" is exactly the
     * reasoning that let the same bug sit in ReportDateBar on every reports
     * screen, so this is written down as owed work rather than waved through.
     */
    "app/targets/page.tsx": "whole-page client component with no server parent; changes monthly, not daily — owed work",
  };

  const files = (dir: string): string[] =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .flatMap((e) =>
        e.isDirectory() ? files(path.join(dir, e.name)) : e.name.endsWith(".tsx") ? [path.join(dir, e.name)] : [],
      );

  it("is reading real client components", () => {
    // A sweep that found none would pass by matching nothing.
    const all = files(path.join(ROOT, "app")).filter((f) => fs.readFileSync(f, "utf8").includes('"use client"'));
    expect(all.length, "no client components found — has the sweep broken?").toBeGreaterThan(10);
  });

  it("finds no clock read in a client component's render path", () => {
    const offenders: string[] = [];
    for (const file of files(path.join(ROOT, "app"))) {
      const src = fs.readFileSync(file, "utf8");
      if (!src.includes('"use client"')) continue;
      const relPath = relativeToRoot(file);
      if (EXEMPT[relPath]) continue;
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      if (CLOCK.test(code)) offenders.push(`${relPath}: ${code.match(CLOCK)![0]}`);
    }
    expect(
      offenders,
      `these render twice against two different clocks — take the instant as a prop, as ReportDateBar does:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("every exemption names a file that still exists and still reads a clock", () => {
    // Otherwise the list quietly grows into a place to hide a real one.
    for (const [relPath, reason] of Object.entries(EXEMPT)) {
      const full = path.join(ROOT, relPath);
      expect(fs.existsSync(full), `${relPath} is exempt and no longer exists`).toBe(true);
      expect(CLOCK.test(fs.readFileSync(full, "utf8")), `${relPath} is exempt but reads no clock — ${reason}`).toBe(
        true,
      );
    }
  });

  it("ReportDateBar takes the instant instead of reading it", () => {
    const src = fs.readFileSync(path.join(ROOT, "app", "components", "ReportShell.tsx"), "utf8");
    expect(src).toMatch(/nowIso: string;/);
    expect(src).toContain("rangePresets(new Date(nowIso))");
    expect(src, "nowIso is optional again, so a caller can silently skip it").not.toMatch(/nowIso\?:/);
  });
});

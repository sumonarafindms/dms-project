import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The comparison data layer, driven against a recording stub of Prisma.
 *
 * Two things are pinned here:
 *
 * 1. **Query count stays constant.** Nine queries regardless of how many RSOs
 *    or rows are in scope. This is the same discipline as
 *    `query-count.smoke.test.ts` — an N+1 passes every other check and only
 *    hurts once there is real data.
 * 2. **Each metric uses its OWN anchor date.** If GA is uploaded to the 29th
 *    and C2S only to the 28th, a shared anchor would compare C2S's empty 29th
 *    against a full 28th and report a collapse every morning.
 */

const calls: string[] = [];
let latest: Record<string, string> = {};
let counts: number[] = [];
let sums: number[] = [];

vi.mock("../lib/prisma", () => {
  const model = (m: string) =>
    new Proxy({} as Record<string, (a?: unknown) => Promise<unknown>>, {
      get: (_t, op) => () => {
        const key = `${m}.${String(op)}`;
        calls.push(key);
        if (op === "findFirst") {
          const iso = latest[m];
          if (!iso) return Promise.resolve(null);
          const d = new Date(`${iso}T00:00:00.000Z`);
          return Promise.resolve(m === "gaActivation" ? { activationDate: d } : { date: d });
        }
        if (op === "count") return Promise.resolve(counts.shift() ?? 0);
        if (op === "aggregate") return Promise.resolve({ _sum: { amount: sums.shift() ?? 0 } });
        return Promise.resolve([]);
      },
    });
  return { prisma: new Proxy({} as Record<string, unknown>, { get: (_t, m) => model(String(m)) }) };
});

const { performanceComparison } = await import("../lib/comparison-data");

beforeEach(() => {
  calls.length = 0;
  latest = { gaActivation: "2026-08-29", c2cRecord: "2026-08-29", c2sRecord: "2026-08-29" };
  counts = [];
  sums = [];
});

describe("query cost", () => {
  it("issues the same number of queries for one RSO and for five hundred", async () => {
    await performanceComparison("day", ["e1"]);
    const one = calls.length;

    calls.length = 0;
    await performanceComparison(
      "day",
      Array.from({ length: 500 }, (_, i) => `e${i}`),
    );
    const many = calls.length;

    expect(many).toBe(one);
    // Three latest-date lookups plus two reads per metric.
    expect(one).toBe(9);
  });

  it("costs the same for a week and a month as for a day", async () => {
    await performanceComparison("week", ["e1"]);
    const week = calls.length;
    calls.length = 0;
    await performanceComparison("month", ["e1"]);
    expect(calls.length).toBe(week);
  });

  it("skips the aggregates entirely when a metric has no data", async () => {
    latest = {};
    calls.length = 0;
    const r = await performanceComparison("day", ["e1"]);
    // Only the three latest-date lookups; nothing to aggregate over.
    expect(calls.filter((c) => c.endsWith(".findFirst"))).toHaveLength(3);
    expect(calls.filter((c) => c.endsWith(".count") || c.endsWith(".aggregate"))).toHaveLength(0);
    for (const m of r.metrics) {
      expect(m.windows).toBeNull();
      expect(m.comparison.direction).toBe("none");
    }
  });
});

describe("per-metric anchors", () => {
  it("lets a lagging feed compare its own latest day, not someone else's", async () => {
    // GA is in to the 29th; C2S only to the 28th.
    latest = { gaActivation: "2026-08-29", c2cRecord: "2026-08-29", c2sRecord: "2026-08-28" };
    const r = await performanceComparison("day", ["e1"]);
    const ga = r.metrics.find((m) => m.metric === "GA")!;
    const c2s = r.metrics.find((m) => m.metric === "C2S")!;

    expect(ga.windows!.current.from).toBe("2026-08-29");
    expect(ga.windows!.previous.from).toBe("2026-08-28");
    // C2S compares 28 vs 27 — not an empty 29 against a full 28.
    expect(c2s.windows!.current.from).toBe("2026-08-28");
    expect(c2s.windows!.previous.from).toBe("2026-08-27");
  });

  it("names the dates it compared on every metric", async () => {
    const r = await performanceComparison("day", ["e1"]);
    for (const m of r.metrics) {
      expect(m.windows!.current.label).toBeTruthy();
      expect(m.windows!.previous.label).toBeTruthy();
      expect(m.windows!.current.label).not.toBe(m.windows!.previous.label);
    }
  });
});

describe("the numbers that come back", () => {
  it("counts GA and sums the money metrics", async () => {
    counts = [120, 100]; // GA current, previous
    sums = [5000, 4000, 900, 1200]; // C2C current/previous, C2S current/previous
    const r = await performanceComparison("day", ["e1"]);

    const ga = r.metrics.find((m) => m.metric === "GA")!;
    expect(ga.comparison.current).toBe(120);
    expect(ga.comparison.percentChange).toBe(20);
    expect(ga.unit).toBe("");

    const c2c = r.metrics.find((m) => m.metric === "C2C")!;
    expect(c2c.comparison.current).toBe(5000);
    expect(c2c.comparison.percentChange).toBe(25);
    expect(c2c.unit).toBe("৳");

    const c2s = r.metrics.find((m) => m.metric === "C2S")!;
    expect(c2s.comparison.direction).toBe("down");
    expect(c2s.comparison.percentChange).toBe(-25);
  });

  it("never returns a broken number when a period is empty", async () => {
    counts = [40, 0];
    sums = [0, 0, 0, 500];
    const r = await performanceComparison("day", ["e1"]);
    for (const m of r.metrics) {
      expect(Number.isFinite(m.comparison.difference)).toBe(true);
      if (m.comparison.percentChange !== null) expect(Number.isFinite(m.comparison.percentChange)).toBe(true);
    }
    expect(r.metrics.find((m) => m.metric === "GA")!.comparison.direction).toBe("new");
    expect(r.metrics.find((m) => m.metric === "C2C")!.comparison.direction).toBe("none");
  });
});

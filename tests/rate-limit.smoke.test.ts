import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The limiter's state lives in Postgres, so this drives it against an
 * in-memory stand-in for the one table it uses. That keeps the test about the
 * WINDOW LOGIC — which is where the bugs are — rather than about Prisma.
 */

type Row = { key: string; failedCount: number; lockedUntil: Date | null };
type UpdateManyArgs = {
  where: { key: string; lockedUntil: { lte: Date } };
  data: { failedCount: number; lockedUntil: Date };
};
type UpsertArgs = { where: { key: string }; create: Row; update: { failedCount?: { increment: number } } };
const store = new Map<string, Row>();

vi.mock("../lib/prisma", () => ({
  prisma: {
    loginThrottle: {
      updateMany: async ({ where, data }: UpdateManyArgs) => {
        const row = store.get(where.key);
        // Mirrors the real semantics: only rows whose window has expired.
        if (row && row.lockedUntil && row.lockedUntil <= where.lockedUntil.lte) {
          row.failedCount = data.failedCount;
          row.lockedUntil = data.lockedUntil;
          return { count: 1 };
        }
        return { count: 0 };
      },
      upsert: async ({ where, create, update }: UpsertArgs) => {
        const row = store.get(where.key);
        if (!row) {
          const created = { ...create };
          store.set(where.key, created);
          return created;
        }
        if (update.failedCount?.increment) row.failedCount += update.failedCount.increment;
        return row;
      },
    },
  },
}));

const { RATE_LIMITS, consumeRateLimit } = await import("../lib/rate-limit");

beforeEach(() => store.clear());

describe("rate limiter", () => {
  it("allows exactly the configured number of requests", async () => {
    const rule = { limit: 3, windowMs: 60_000, name: "test" };
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await consumeRateLimit(rule, "user-1"));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false, false]);
  });

  it("counts each subject separately", async () => {
    // One busy admin must not lock out everyone else.
    const rule = { limit: 1, windowMs: 60_000, name: "test" };
    expect((await consumeRateLimit(rule, "user-a")).allowed).toBe(true);
    expect((await consumeRateLimit(rule, "user-b")).allowed).toBe(true);
    expect((await consumeRateLimit(rule, "user-a")).allowed).toBe(false);
  });

  it("counts each bucket separately", async () => {
    // Uploading must not consume the credential-change allowance.
    const a = { limit: 1, windowMs: 60_000, name: "upload" };
    const b = { limit: 1, windowMs: 60_000, name: "credential" };
    expect((await consumeRateLimit(a, "u")).allowed).toBe(true);
    expect((await consumeRateLimit(b, "u")).allowed).toBe(true);
    expect((await consumeRateLimit(a, "u")).allowed).toBe(false);
  });

  it("reports a usable retry-after", async () => {
    const rule = { limit: 1, windowMs: 60_000, name: "test" };
    await consumeRateLimit(rule, "u");
    const denied = await consumeRateLimit(rule, "u");
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) {
      expect(denied.retryAfterSeconds).toBeGreaterThan(0);
      expect(denied.retryAfterSeconds).toBeLessThanOrEqual(60);
    }
  });

  it("lets the allowance return when the window expires", async () => {
    const rule = { limit: 2, windowMs: 1_000, name: "test" };
    expect((await consumeRateLimit(rule, "u")).allowed).toBe(true);
    expect((await consumeRateLimit(rule, "u")).allowed).toBe(true);
    expect((await consumeRateLimit(rule, "u")).allowed).toBe(false);
    // Age the window rather than sleeping.
    for (const row of store.values()) row.lockedUntil = new Date(Date.now() - 1);
    expect((await consumeRateLimit(rule, "u")).allowed).toBe(true);
  });

  it("fails OPEN when the database is unreachable", async () => {
    // A limiter that takes the app down when Postgres hiccups is worse than
    // the abuse it prevents; every guarded route is already authenticated.
    const { prisma } = await import("../lib/prisma");
    const table = prisma.loginThrottle as unknown as { updateMany: unknown };
    const original = table.updateMany;
    table.updateMany = async () => {
      throw new Error("connection refused");
    };
    const r = await consumeRateLimit({ limit: 1, windowMs: 1000, name: "test" }, "u");
    expect(r.allowed).toBe(true);
    table.updateMany = original;
  });

  it("ships limits well above real use", async () => {
    // A limit an operator can hit during normal work is a bug report.
    expect(RATE_LIMITS.upload.limit).toBeGreaterThanOrEqual(20);
    expect(RATE_LIMITS.credential.limit).toBeGreaterThanOrEqual(10);
    expect(RATE_LIMITS.download.limit).toBeGreaterThanOrEqual(30);
  });
});

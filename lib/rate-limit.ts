import { createHash } from "node:crypto";
import { prisma } from "./prisma";

/**
 * A coarse fixed-window rate limiter for the endpoints that are expensive or
 * abusable: uploads, credential changes, and generated file downloads.
 *
 * ## Why the database and not memory
 *
 * This deploys to Vercel, where each request may hit a different serverless
 * instance and instances are recycled constantly. An in-memory counter would
 * therefore limit almost nothing while looking like it did — the worst kind of
 * security control. The login throttle already solved this problem by keeping
 * state in Postgres, so this follows it rather than inventing a second answer.
 *
 * ## Why it reuses the LoginThrottle table
 *
 * The shape needed here — a keyed counter with an expiry — is exactly what
 * `LoginThrottle` already stores, and its `key` is an opaque hash, so
 * namespacing it costs nothing. A dedicated `Throttle` model would be a better
 * NAME, but adding one requires `prisma generate`, which cannot run in the
 * environment this was written in (see SECURITY.md). Reusing the table ships a
 * working control now; renaming the model to `Throttle` is a mechanical
 * follow-up migration whenever the schema is next touched, and only the two
 * key builders below would change.
 *
 * ## What it is and is not
 *
 * Fixed window, not sliding: a caller can spend a full allowance at the end of
 * one window and again at the start of the next. That is fine for abuse
 * control and is why the limits below are set well above real use rather than
 * tight. The increment is atomic, so concurrent requests cannot both slip past
 * the limit on the same read.
 */

export type RateLimitRule = { limit: number; windowMs: number; name: string };

/**
 * Deliberately generous. These exist to stop a script, not to ration the
 * working day — a limit a real operator can hit is a bug report, not security.
 */
export const RATE_LIMITS = {
  /** Spreadsheet imports. A busy morning is a handful of files, not 30. */
  upload: { limit: 30, windowMs: 10 * 60 * 1000, name: "upload" },
  /** Setting or resetting a PIN/password for any account. */
  credential: { limit: 20, windowMs: 10 * 60 * 1000, name: "credential" },
  /** Server-generated downloads (sample workbooks, exports). */
  download: { limit: 60, windowMs: 5 * 60 * 1000, name: "download" },
} satisfies Record<string, RateLimitRule>;

export type RateLimitResult = { allowed: true; remaining: number } | { allowed: false; retryAfterSeconds: number };

const keyFor = (rule: RateLimitRule, subject: string) =>
  createHash("sha256").update(`rl:${rule.name}:${subject}`).digest("hex");

/**
 * Count one request against `subject`'s allowance for `rule`.
 *
 * A database failure ALLOWS the request. A rate limiter that takes the app
 * down when Postgres hiccups is worse than the abuse it prevents, and every
 * endpoint this guards is already behind authentication and a permission
 * check — this is the outer layer, not the only one.
 */
export async function consumeRateLimit(rule: RateLimitRule, subject: string): Promise<RateLimitResult> {
  const key = keyFor(rule, subject);
  const now = new Date();
  const windowEnd = new Date(now.getTime() + rule.windowMs);
  try {
    // Reset an expired window in one atomic statement. `updateMany` is a no-op
    // while the window is still live, so a live window is never reset.
    await prisma.loginThrottle.updateMany({
      where: { key, lockedUntil: { lte: now } },
      data: { failedCount: 0, lockedUntil: windowEnd },
    });
    const row = await prisma.loginThrottle.upsert({
      where: { key },
      create: { key, failedCount: 1, lockedUntil: windowEnd },
      // The increment happens in the database, so two concurrent requests
      // cannot read the same count and both decide they are under the limit.
      update: { failedCount: { increment: 1 } },
    });
    if (row.failedCount > rule.limit) {
      const until = row.lockedUntil ?? windowEnd;
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 1000)) };
    }
    return { allowed: true, remaining: Math.max(0, rule.limit - row.failedCount) };
  } catch {
    return { allowed: true, remaining: rule.limit };
  }
}

/** The 429 body and headers, so every caller answers a limit the same way. */
export function rateLimitResponse(retryAfterSeconds: number) {
  return {
    body: { error: "Too many requests. Please wait a moment and try again." },
    init: {
      status: 429,
      headers: { "retry-after": String(retryAfterSeconds), "cache-control": "no-store" },
    },
  };
}

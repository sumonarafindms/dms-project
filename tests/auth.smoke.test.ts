import { describe, expect, it } from "vitest";
import { hashCredential, verifyCredential, homeForRole } from "../lib/auth";
import { MAX_LOGIN_FAILURES, nextLoginFailure } from "../lib/login-policy";

describe("auth smoke", () => {
  it("accepts the valid credential and rejects an invalid credential", async () => {
    const hash = await hashCredential("2468");
    expect(await verifyCredential("2468", hash)).toBe(true);
    expect(await verifyCredential("9999", hash)).toBe(false);
    expect(homeForRole("RSO")).toBe("/rso");
  });

  it("locks after the configured repeated-failure threshold", () => {
    let state = { failedCount: 0, lockedUntil: null as Date | null };
    const now = 1_700_000_000_000;
    for (let i = 0; i < MAX_LOGIN_FAILURES; i++) state = nextLoginFailure(state.failedCount, now);
    expect(state.failedCount).toBe(MAX_LOGIN_FAILURES);
    expect(state.lockedUntil).toBeInstanceOf(Date);
    expect(state.lockedUntil!.getTime()).toBeGreaterThan(now);
  });
});

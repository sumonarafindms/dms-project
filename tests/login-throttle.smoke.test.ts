import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { LOGIN_LOCK_MINUTES, MAX_LOGIN_FAILURES, activeLock, nextLoginFailure } from "../lib/login-policy";

/**
 * A login attempt is counted against the account, not only against wherever it
 * came from.
 *
 * ## The hole this closes
 *
 * The throttle was keyed on `identifier + client IP`, and the client IP came
 * from `X-Forwarded-For` — a header the caller sends. Measured against the
 * running app before the fix:
 *
 *     same address, 8 wrong PINs   401 401 401 401 429 429 429 429
 *     rotating address, 8 wrong    401 401 401 401 401 401 401 401
 *
 * The second line is the bug. Field logins are four-digit PINs, so an attacker
 * who varies one header has at most ten thousand guesses to make against any
 * RSO or BP account, with nothing counting them. Rotating real addresses
 * through proxies reaches the same place more slowly, so this was never only a
 * header-spoofing problem — which is why the fix is not "trust the header
 * less" but "count something the attacker does not choose".
 *
 * They choose the address. They do not choose whose account they are guessing
 * at: to attack an account they must name it, and the name is the key.
 *
 * v149 answered that with a second THROTTLE bucket keyed on the identifier.
 * v150 replaced that bucket with something stricter at the owner's request —
 * five consecutive failures lock the login until an administrator clears it,
 * counted on the user row itself (`tests/account-lockout.smoke.test.ts`).
 *
 * This file now guards what remains and still matters: the SOURCE bucket. It is
 * what stops one attacker from walking down a list of mobile numbers locking
 * every account in turn — they are blocked after five attempts of their own,
 * before they can reach the sixth person.
 */

describe("the two buckets", () => {
  it("locks one source quickly", () => {
    let count = 0;
    const results = Array.from({ length: MAX_LOGIN_FAILURES }, () => (count = nextLoginFailure(count).failedCount));
    expect(results.at(-1)).toBe(MAX_LOGIN_FAILURES);
    expect(nextLoginFailure(MAX_LOGIN_FAILURES - 1).lockedUntil).toBeInstanceOf(Date);
    expect(nextLoginFailure(MAX_LOGIN_FAILURES - 2).lockedUntil).toBeNull();
  });

  it("locks for a real interval, measured from now", () => {
    const now = Date.UTC(2026, 0, 1, 12, 0, 0);
    const { lockedUntil } = nextLoginFailure(MAX_LOGIN_FAILURES - 1, now);
    expect(lockedUntil!.getTime() - now).toBe(LOGIN_LOCK_MINUTES * 60_000);
  });

  it("counts a negative or missing prior count as a first failure", () => {
    // A corrupt or absent row must not read as "already many failures in", nor
    // silently reset someone's real count.
    expect(nextLoginFailure(-5).failedCount).toBe(1);
  });

  it("stays flat, so one address is never locked for a day", () => {
    const now = Date.UTC(2026, 0, 1);
    const at = (n: number) => (nextLoginFailure(n, now).lockedUntil!.getTime() - now) / 60_000;
    expect(at(MAX_LOGIN_FAILURES - 1)).toBe(LOGIN_LOCK_MINUTES);
    expect(at(MAX_LOGIN_FAILURES * 10)).toBe(LOGIN_LOCK_MINUTES);
  });
});

describe("activeLock", () => {
  const now = new Date("2026-01-01T12:00:00.000Z");
  const at = (mins: number) => new Date(now.getTime() + mins * 60_000);

  it("returns nothing when no lock is live", () => {
    expect(activeLock([null, undefined], now)).toBeNull();
    expect(activeLock([at(-1)], now)).toBeNull(); // already expired
  });

  it("takes the later of the two, so the stricter bucket wins", () => {
    expect(activeLock([at(5), at(30)], now)!.getTime()).toBe(at(30).getTime());
    expect(activeLock([at(30), null], now)!.getTime()).toBe(at(30).getTime());
    // An expired source lock must not shorten a live account lock.
    expect(activeLock([at(-10), at(15)], now)!.getTime()).toBe(at(15).getTime());
  });
});

describe("the login route still guards by source", () => {
  const SRC = fs.readFileSync(path.join(__dirname, "..", "app", "api", "auth", "login", "route.ts"), "utf8");
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

  it("blocks a locked source before the account is even looked up", () => {
    /*
     * Order matters here for a reason that is easy to miss: if the source lock
     * were checked after the user lookup, a blocked attacker would still be
     * adding failures to other people's accounts on every request — turning a
     * throttle into a tool for locking the whole team out.
     */
    const sourceCheck = code.indexOf("activeLock(");
    const userLookup = code.indexOf("prisma.user.findFirst");
    expect(sourceCheck).toBeGreaterThan(-1);
    expect(userLookup).toBeGreaterThan(-1);
    expect(sourceCheck).toBeLessThan(userLookup);
  });

  it("normalises the identifier so one account is one bucket", () => {
    // 01700000001, 8801700000001 and +8801700000001 reach the same account.
    expect(code).toMatch(/normalizeIdentifier/);
    expect(code).toMatch(/phoneKey\(identifier\)/);
  });

  it("clears the source penalty on a successful sign-in", () => {
    expect(code).toMatch(/loginThrottle\.deleteMany\(\{\s*where:\s*\{\s*key\s*\}/);
  });
});

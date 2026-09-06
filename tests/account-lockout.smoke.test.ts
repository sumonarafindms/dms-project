import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { rel as relativeTo } from "./paths";
import {
  MAX_FAILURES_BEFORE_LOCK,
  MIN_PASSWORD_LENGTH,
  PIN_LENGTH,
  nextAccountState,
  validatePassword,
  validatePin,
} from "../lib/credential-policy";

/**
 * Six-digit PINs, and five strikes before a person has to get involved.
 *
 * ## What changed and why
 *
 * Field logins were four-digit PINs — ten thousand possibilities. v149 made
 * guessing them slow; it could not make them long. Six digits is a million, a
 * hundredfold, and costs the person two more taps on a number pad.
 *
 * And the throttle that used to slow an attacker down is replaced by something
 * that stops them: five consecutive failures lock the login, with **no timer**.
 * An administrator clears it. A timed lock lets an attacker keep guessing
 * forever at a slower rate; this one ends the attempt and puts a human in the
 * loop who can ask why that account was being guessed at.
 *
 * ## The trade the owner accepted
 *
 * A lock anyone can trigger is also a way to lock someone out on purpose:
 * knowing a mobile number and getting it wrong five times is enough. That is
 * inherent to what was asked for, and the mitigation is the SOURCE throttle in
 * login-policy — an attacker is blocked after five attempts of their own,
 * before they can walk down a list doing it to everyone.
 *
 * ## Existing PINs keep working
 *
 * The six-digit rule is enforced when a credential is SET, never when it is
 * used, so nobody in the field is locked out by the deploy. Their four-digit
 * PIN works until an admin resets it. Recorded here because it looks like an
 * omission and is a decision.
 */

const ROOT = path.join(__dirname, "..");
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

describe("PIN rules", () => {
  it("wants exactly six digits", () => {
    expect(PIN_LENGTH).toBe(6);
    expect(validatePin("481937")).toBeNull();
    expect(validatePin("4819")).toMatch(/6 digits/);
    expect(validatePin("48193")).toMatch(/6 digits/);
    expect(validatePin("4819377")).toMatch(/6 digits/);
    expect(validatePin("abcdef")).toMatch(/6 digits/);
    expect(validatePin("48 937")).toMatch(/6 digits/);
  });

  it("rejects the PINs an attacker tries first", () => {
    /*
     * A five-attempt lock makes brute force impractical but does nothing about
     * someone trying 123456 on every account they can name. Two lines of check
     * remove the guesses that need no cleverness at all.
     */
    for (const bad of ["111111", "000000", "999999"]) expect(validatePin(bad), bad).toMatch(/same digit/);
    for (const bad of ["123456", "654321", "456789", "987654"]) expect(validatePin(bad), bad).toMatch(/consecutive/);
    // And does not over-reach: these merely contain a short run.
    expect(validatePin("123790")).toBeNull();
    expect(validatePin("419234")).toBeNull();
  });

  it("treats a blank PIN as 'leave it alone' only where that is meant", () => {
    // Edit forms send an empty field to mean "keep the current PIN"; create
    // forms must not be able to make a login with no credential.
    expect(validatePin("", { allowEmpty: true })).toBeNull();
    expect(validatePin("")).toMatch(/6 digits/);
    expect(validatePin("   ")).toMatch(/6 digits/);
  });

  it("holds admin passwords to a length, not a digit count", () => {
    // Admins type on a keyboard, so the rule that fits a numeric keypad does
    // not apply to them.
    expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(8);
    expect(validatePassword("short")).toMatch(/at least/);
    expect(validatePassword("a-long-enough-one")).toBeNull();
  });
});

describe("five strikes", () => {
  it("locks on the fifth consecutive failure and not before", () => {
    expect(MAX_FAILURES_BEFORE_LOCK).toBe(5);
    for (let before = 0; before < MAX_FAILURES_BEFORE_LOCK - 1; before++)
      expect(nextAccountState(before).lockedAt, `after ${before + 1} failures`).toBeNull();
    expect(nextAccountState(MAX_FAILURES_BEFORE_LOCK - 1).lockedAt).toBeInstanceOf(Date);
  });

  it("keeps counting past the limit rather than wrapping", () => {
    // A locked account that keeps being hammered must not roll its counter back
    // to zero and quietly unlock.
    const state = nextAccountState(MAX_FAILURES_BEFORE_LOCK * 3);
    expect(state.failedLoginCount).toBe(MAX_FAILURES_BEFORE_LOCK * 3 + 1);
    expect(state.lockedAt).toBeInstanceOf(Date);
  });

  it("records when it locked, not when it will open", () => {
    /*
     * `lockedAt` is a timestamp of the event, not a deadline. There is no
     * "until" anywhere in this policy — that is the whole point, and a future
     * date here would be the first sign someone had reintroduced a timer.
     */
    const now = Date.UTC(2026, 0, 1, 9, 0, 0);
    expect(nextAccountState(MAX_FAILURES_BEFORE_LOCK - 1, now).lockedAt!.getTime()).toBe(now);
  });
});

describe("the login route enforces the lock", () => {
  const code = stripComments(read("app", "api", "auth", "login", "route.ts"));

  it("refuses a locked account before checking the credential", () => {
    /*
     * If the lock were checked after `verifyCredential`, a correct PIN on a
     * locked account would still tell the attacker their guess was right —
     * which is most of what they were after.
     */
    const lockCheck = code.indexOf("user?.lockedAt");
    const verify = code.indexOf("verifyCredential(");
    expect(lockCheck).toBeGreaterThan(-1);
    expect(verify).toBeGreaterThan(-1);
    expect(lockCheck).toBeLessThan(verify);
  });

  it("counts failures only against an account that exists", () => {
    /*
     * Counting a mistyped number would let anyone lock an account by guessing
     * near-miss numbers, and there would be no row to lock anyway.
     */
    expect(code).toMatch(/if \(user && roleAllowed\)/);
    expect(code).toMatch(/nextAccountState\(user\.failedLoginCount\)/);
  });

  it("clears the counter when someone proves the account is theirs", () => {
    expect(code).toMatch(/failedLoginCount: 0/);
  });

  it("writes the lock to the audit log", () => {
    // The owner has to be able to tell "someone fat-fingered it" from "someone
    // is working through our numbers".
    expect(code).toMatch(/ACCOUNT_LOCKED/);
  });

  it("has no timer anywhere in the account path", () => {
    // The owner asked for admin-unlock, not a wait. A `lockedUntil` on the user
    // would be the shape of a timer creeping back in.
    expect(code).not.toMatch(/user[^\n]*lockedUntil/);
  });
});

describe("only an admin can unlock, and unlocking really unlocks", () => {
  const code = stripComments(read("app", "api", "admin", "users", "route.ts"));

  it("clears the counter as well as the flag", () => {
    /*
     * Clearing `lockedAt` alone would re-lock the account on the very next
     * failure, because the counter would still be at five. An unlock that
     * lasts one attempt is worse than none — the admin believes they fixed it.
     */
    /*
     * Asserted on the BLOCK, not on two strings anywhere in the file. The first
     * version of this test looked for each line independently, and a mutation
     * that removed the counter reset from the unlock path still passed, because
     * another branch happened to contain the same words. A guard that can be
     * satisfied by the wrong line is not a guard.
     */
    const block = code.match(/if \(b\.unlock === true \|\| pin\)\s*\{([\s\S]*?)\n\s*\}/);
    expect(block, "the unlock branch went missing").toBeTruthy();
    expect(block![1]).toMatch(/data\.lockedAt = null/);
    expect(block![1]).toMatch(/data\.failedLoginCount = 0/);
  });

  it("treats a PIN reset as an unlock", () => {
    // An admin resetting a locked user's PIN has plainly decided they should be
    // able to sign in; a second button would only teach them to press both.
    expect(code).toMatch(/b\.unlock === true \|\| pin/);
  });

  it("records the unlock separately in the audit log", () => {
    expect(code).toMatch(/UNLOCK_USER/);
  });

  it("is behind the same admin gate as every other write here", () => {
    // Belt and braces with tests/api-authorization.smoke.test.ts, which proves
    // the handler is gated at all; this proves the gate is ADMIN/IT.
    expect(code).toMatch(/\["ADMIN", "IT"\]\.includes\(me\.role\)/);
  });
});

describe("the admin screen can see and clear a lock", () => {
  const ui = read("app", "admin", "users", "UserManager.tsx");
  const page = read("app", "admin", "users", "page.tsx");

  it("carries the lock state from the server", () => {
    expect(page).toMatch(/lockedAt:/);
    expect(page).toMatch(/failedLoginCount:/);
  });

  it("puts locked accounts first", () => {
    // The page exists to unlock people; someone waiting in the field should not
    // be on page two of a scroll.
    expect(page).toMatch(/orderBy:\s*\[\{\s*lockedAt:/);
  });

  it("shows the lock and offers the unlock", () => {
    // A badge saying Locked, a button saying Unlock, and a request that means
    // it. Matched loosely on whitespace because the formatter owns the layout.
    expect(ui).toMatch(/<Badge tone="failed">\s*Locked\s*<\/Badge>/);
    expect(ui).toMatch(/<ConfirmActionButton[\s\S]{0,300}Unlock\s*<\/ConfirmActionButton>/);
    expect(ui).toMatch(/unlock: true/);
  });

  it("asks for confirmation rather than unlocking on one tap", () => {
    expect(ui).toMatch(/ConfirmActionButton[\s\S]{0,200}onConfirm=\{\(\) => unlock\(u\)\}/);
  });
});

describe("the PIN rule is defined once", () => {
  it("has no hand-written length check left anywhere", () => {
    /*
     * Four copies of "at least 4 characters" is how one screen ends up
     * accepting what the others reject. Every caller goes through
     * lib/credential-policy now.
     */
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(e.name)) {
          const src = stripComments(fs.readFileSync(full, "utf8"));
          if (/pin[^\n]{0,40}\.length\s*[<>=]/i.test(src)) offenders.push(relativeTo(ROOT)(full));
        }
      }
    };
    for (const d of ["app", "lib"]) walk(path.join(ROOT, d));
    expect(offenders, "use validatePin from lib/credential-policy").toEqual([]);
  });

  it("is what the input fields ask for", () => {
    // A form that accepts four digits and an API that rejects them is a form
    // that wastes someone's time in the field.
    for (const f of [
      ["app", "admin", "users", "UserManager.tsx"],
      ["app", "components", "AdminEmployeeForm.tsx"],
    ]) {
      const src = read(...f);
      expect(src, f.join("/")).toMatch(/PIN_LENGTH/);
      expect(src, f.join("/")).toMatch(/maxLength=\{PIN_LENGTH\}/);
    }
  });
});

describe("the schema carries the lock", () => {
  const schema = read("prisma", "schema.prisma");

  it("stores the counter and the flag on the user", () => {
    expect(schema).toMatch(/failedLoginCount\s+Int\s+@default\(0\)/);
    expect(schema).toMatch(/lockedAt\s+DateTime\?/);
  });

  it("ships a migration that can be re-applied safely", () => {
    // The convention here: hand-written, IF NOT EXISTS, applied with
    // `npm run db:deploy` rather than during a build.
    const dir = path.join(ROOT, "prisma", "migrations");
    const found = fs
      .readdirSync(dir)
      .filter((d) => d.includes("account_lockout"))
      .map((d) => fs.readFileSync(path.join(dir, d, "migration.sql"), "utf8"));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/ADD COLUMN IF NOT EXISTS "failedLoginCount"/);
    expect(found[0]).toMatch(/ADD COLUMN IF NOT EXISTS "lockedAt"/);
  });
});

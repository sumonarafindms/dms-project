import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { credentialNoun, credentialRules, usesPassword, validateCredentialChange } from "../lib/credential-change";
import { MIN_PASSWORD_LENGTH, PIN_LENGTH } from "../lib/credential-policy";

/**
 * Changing your own PIN.
 *
 * ## What was missing
 *
 * There was no way to. An RSO who thought somebody had watched them type their
 * PIN in a shop had one option: find an administrator. And on a phone there was
 * no way to sign out either — the sidebar carrying that button is
 * `display: none` below 900px, and the avatar in the top bar linked to the page
 * the person was already on.
 *
 *     "ami jokhon mobile a use kori tokhon mar password change ar option ase na
 *      ...right side a je profile icone thake oi jagai click korle jate amar
 *      password change ar option ase aita proti ta role a fix kore dio"
 */

const ROOT = path.join(__dirname, "..");
const ok = (over: Partial<Parameters<typeof validateCredentialChange>[0]> = {}) =>
  validateCredentialChange({
    role: "RSO",
    current: "111222",
    next: "483920",
    confirm: "483920",
    currentMatches: true,
    ...over,
  });

describe("what a credential change is allowed to be", () => {
  it("accepts a good one", () => {
    expect(ok()).toBeNull();
    expect(ok({ role: "ADMIN", current: "oldpassword1", next: "newpassword1", confirm: "newpassword1" })).toBeNull();
  });

  it("asks for the current one before judging the new one", () => {
    /*
     * Order, not politeness. Telling somebody their new PIN is "a run of
     * consecutive digits" when the real problem is that they mistyped the field
     * they actually know sends them to reinvent a PIN that was fine.
     */
    expect(ok({ current: "" })).toMatch(/current PIN/i);
    expect(ok({ current: "", next: "123456" })).toMatch(/current PIN/i);
    expect(ok({ currentMatches: false })).toBe("Your current PIN is incorrect.");
  });

  it("checks the two new boxes match before checking the format", () => {
    // Same reason. "Must be 6 digits" is the wrong answer to "you typed it
    // differently twice".
    expect(ok({ confirm: "483921" })).toMatch(/do not match/i);
    expect(ok({ next: "12", confirm: "34" })).toMatch(/do not match/i);
  });

  it("applies the same PIN rules the rest of the app applies", () => {
    // Not a second, laxer copy of the policy — this is the reason
    // lib/credential-policy.ts exists.
    expect(ok({ next: "12345", confirm: "12345" })).toMatch(new RegExp(`${PIN_LENGTH} digits`));
    expect(ok({ next: "111111", confirm: "111111" })).toMatch(/same digit repeated/i);
    expect(ok({ next: "123456", confirm: "123456" })).toMatch(/consecutive digits/i);
    expect(ok({ next: "48392a", confirm: "48392a" })).toMatch(new RegExp(`${PIN_LENGTH} digits`));
  });

  it("refuses a change that changes nothing", () => {
    /*
     * Accepting it would revoke every other session and write a security event
     * for something that did not happen — and it is almost always somebody
     * misreading the form.
     */
    expect(ok({ next: "111222", confirm: "111222" })).toMatch(/same as your current/i);
  });

  it("knows an administrator signs in with a password, not a PIN", () => {
    expect(usesPassword("ADMIN")).toBe(true);
    for (const r of ["IT", "MANAGER", "SUPERVISOR", "ACCOUNTS", "RSO", "BP"]) expect(usesPassword(r)).toBe(false);
    expect(credentialNoun("ADMIN")).toBe("password");
    expect(credentialNoun("RSO")).toBe("PIN");
    // A six-digit PIN would be a terrible password, and a password is not six
    // digits — so the rule that applies follows the role.
    expect(ok({ role: "ADMIN", current: "oldpassword1", next: "483920", confirm: "483920" })).toMatch(
      new RegExp(`${MIN_PASSWORD_LENGTH} characters`),
    );
    expect(ok({ next: "averylongpassword", confirm: "averylongpassword" })).toMatch(`${PIN_LENGTH} digits`);
  });

  it("describes the field the same way the screen will", () => {
    // The dialog builds its inputs from this, so the placeholder and the error
    // cannot describe different rules.
    expect(credentialRules("RSO")).toEqual({
      noun: "PIN",
      minLength: PIN_LENGTH,
      digitsOnly: true,
      length: PIN_LENGTH,
    });
    expect(credentialRules("ADMIN")).toEqual({
      noun: "password",
      minLength: MIN_PASSWORD_LENGTH,
      digitsOnly: false,
      length: null,
    });
  });
});

describe("the route behind it", () => {
  const route = fs.readFileSync(path.join(ROOT, "app", "api", "auth", "change-credential", "route.ts"), "utf8");
  const code = route.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("is open to every signed-in role", () => {
    /*
     * The owner asked for this on every role, and the role that needs it most
     * is the one with the fewest screens. So the guard is "signed in", with no
     * role list — and this test exists because adding one later would silently
     * take the feature away from RSOs and BPs.
     */
    expect(code).toMatch(/getCurrentUser\(\)/);
    expect(code).not.toMatch(/apiUser\(\s*\[/);
    expect(code, "a role list would lock some roles out of their own PIN").not.toMatch(
      /getCurrentUser[\s\S]{0,400}?\["(ADMIN|IT)"/,
    );
  });

  it("proves the current credential before writing a new one", () => {
    expect(code).toMatch(/verifyCredential\(/);
    expect(code).toMatch(/hashCredential\(/);
    // And it reads the hash itself rather than expecting it on the session
    // user, which deliberately omits it.
    expect(code).toMatch(/select:\s*\{\s*credentialHash:\s*true\s*\}/);
  });

  it("revokes every other session and keeps this one", () => {
    /*
     * Changing a PIN because somebody else may know it is worthless if their
     * session stays alive — and signing the person out of the device they just
     * used to fix it is how they end up not fixing it.
     */
    const revoke = code.indexOf("session.deleteMany");
    const renew = code.indexOf("createSession(");
    expect(revoke, "sessions are never revoked").toBeGreaterThan(-1);
    expect(renew, "this device is never re-issued a session").toBeGreaterThan(-1);
    expect(renew, "the new session is created before the revocation wipes it").toBeGreaterThan(revoke);
  });

  it("is rate limited, and the limit is taken before any work", () => {
    const limit = code.indexOf("consumeRateLimit");
    expect(limit).toBeGreaterThan(-1);
    expect(code).toMatch(/RATE_LIMITS\.credential/);
    expect(limit, "the body is parsed before the limit is checked").toBeLessThan(code.indexOf("req.json()"));
  });

  it("writes an audit entry that does not contain a credential", () => {
    expect(code).toMatch(/audit\(/);
    expect(code).toMatch(/CHANGE_OWN_CREDENTIAL/);
    const auditCall = code.slice(code.indexOf("audit("), code.indexOf("audit(") + 400);
    for (const leak of ["next", "current", "credentialHash", "confirm"])
      expect(auditCall, `the audit entry interpolates \`${leak}\``).not.toMatch(
        new RegExp(`\\$\\{[^}]*\\b${leak}\\b[^}]*\\}`),
      );
  });

  it("does not add failures to the five-strike lock", () => {
    /*
     * The lock has no timer — an administrator clears it. Counting a mistyped
     * current PIN here would turn a working session into a support call, and
     * the caller already holds a valid session, so this is not an anonymous
     * guessing oracle. The rate limit is the proportionate defence.
     */
    expect(code).not.toMatch(/nextAccountState|failedLoginCount:\s*\{/);
    // It does CLEAR them, which is different: somebody who just proved their
    // current credential is not who a lock is for.
    expect(code).toMatch(/failedLoginCount:\s*0/);
    expect(code).toMatch(/lockedAt:\s*null/);
  });
});

describe("every role can reach it", () => {
  const shell = fs.readFileSync(path.join(ROOT, "app", "components", "AppShell.tsx"), "utf8");

  it("opens from the phone's avatar and the desktop profile block", () => {
    /*
     * The avatar used to be a Link to the role's home — the page the person was
     * already on. Both entry points render the same component, so "every role"
     * is a property of the shell rather than six copies to keep in step.
     */
    expect(shell).toMatch(/variant="avatar"/);
    expect(shell).toMatch(/variant="profile"/);
    expect(shell, "the avatar is still a link to nowhere useful").not.toMatch(
      /<Link[^>]*className="avatar avatar-link"/,
    );
  });

  it("leaves no second sign-out behind", () => {
    // There used to be one button, in the sidebar, invisible on a phone. Two
    // sign-outs that can drift is how the phone ended up without one.
    expect(shell).not.toMatch(/aria-label="Sign out"/);
  });
});

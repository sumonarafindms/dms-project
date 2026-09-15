import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { rel as relativeTo } from "./paths";

/**
 * Every API handler is behind an authorisation gate, and the public ones are
 * public on purpose.
 *
 * ## What this protects
 *
 * The whole write surface of this application is `app/api/**\/route.ts`. There
 * are no server actions, so a route handler is the only way anything reaches
 * the database. Which means one missing check in one new file is the difference
 * between "an admin can create employees" and "anyone on the internet can".
 *
 * Every route today does check. The risk is not the code as written, it is the
 * code as extended: the next handler someone adds in a hurry, at the end of a
 * long day, copied from a file whose gate was three lines further up than they
 * scrolled. A reviewer has to notice an absence, and absences are the hardest
 * thing to notice.
 *
 * So this test enumerates the handlers rather than trusting anyone to remember,
 * and the exemption list below is the only way to be public. Adding a route to
 * it is a deliberate, reviewed edit with a reason attached; forgetting a gate
 * is a failing test.
 *
 * ## Two ways of gating, both accepted
 *
 * Most handlers call `apiUser` / `apiPermission` from `lib/auth`. The admin
 * routes instead define a local `admin()` helper that wraps `getCurrentUser`
 * and checks the role. Both are real gates, so both count — but a local helper
 * only counts if it actually consults `getCurrentUser`, which is what stops a
 * function named `admin()` that returns `true` from satisfying this test.
 */

const ROOT = path.join(__dirname, "..");
const API = path.join(ROOT, "app", "api");
const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;
const WRITES = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/**
 * Routes that answer without a session, and why.
 *
 * Anything not on this list must gate. Anything on it has been read and
 * justified — this is the list a reviewer should look at hardest.
 */
const PUBLIC: Record<string, string> = {
  "auth/login POST": "the sign-in endpoint itself; throttled per source AND per account",
  "auth/logout POST": "clears the caller's own cookie and nothing else",
  "auth/setup POST": "first-run only; refuses inside a serializable transaction once any user exists",
  "health GET": "liveness for an uptime monitor; diagnostics are gated to ADMIN/IT inside the handler",
};

const routeFiles = (dir: string, acc: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) routeFiles(full, acc);
    else if (e.name === "route.ts") acc.push(full);
  }
  return acc;
};

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

/** Gates exported by lib/auth that are known to enforce a session. */
const LIB_GATES = ["apiUser", "apiPermission", "requireUser", "requirePagePermission"];

type Handler = { route: string; method: string; body: string };

/** Every exported HTTP handler, with the source between it and the next one. */
export function handlers(src: string, route: string): Handler[] {
  const code = stripComments(src);
  const marks = [...code.matchAll(new RegExp(`export async function (${METHODS.join("|")})\\b`, "g"))];
  return marks.map((m, i) => ({
    route,
    method: m[1],
    // The declaration itself is excluded, so a handler cannot satisfy a gate
    // search by being named one.
    body: code.slice(m.index! + m[0].length, i + 1 < marks.length ? marks[i + 1].index! : code.length),
  }));
}

/**
 * Local helpers in this file that really do consult the session.
 *
 * A name is not a gate. `async function admin() { return true }` would satisfy
 * a check that only looked for the call, so the definition has to be read.
 */
function localGates(code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*\{/g)) {
    // A handler is not its own gate. Without this, `export async function
    // POST(req)` registers "POST" as a gate name, and the declaration line then
    // matches the search for a call to it — so every handler vouched for
    // itself and the sweep could not fail. Found by mutating a role check away
    // and watching nothing happen.
    if ((METHODS as readonly string[]).includes(m[1])) continue;
    const start = m.index! + m[0].length - 1;
    let depth = 0;
    for (let i = start; i < code.length; i++) {
      if (code[i] === "{") depth++;
      else if (code[i] === "}" && --depth === 0) {
        if (/getCurrentUser\s*\(/.test(code.slice(start, i))) out.push(m[1]);
        break;
      }
    }
  }
  return out;
}

const FILES = routeFiles(API).map((file) => {
  const src = fs.readFileSync(file, "utf8");
  const route = path
    .relative(API, file)
    .replace(/[/\\]route\.ts$/, "")
    .replace(/\\/g, "/");
  return { file, route, src, code: stripComments(src) };
});

/**
 * A handler that calls `getCurrentUser` itself and refuses a missing session.
 *
 * Most admin routes are written this way rather than through a helper. Calling
 * `getCurrentUser` is not on its own a gate — the result has to be acted on —
 * so the rejection is what is looked for.
 */
function inlineGate(body: string): boolean {
  return /getCurrentUser\s*\(/.test(body) && /if\s*\(\s*!\s*\w+/.test(body);
}

/**
 * The variable this handler bound the signed-in user to.
 *
 * Needed because "is a role checked here" cannot be answered by looking for
 * `.role` anywhere: `typeof b.role === "string"` is a check on the REQUEST
 * BODY and matched an earlier version of this test, which is how a mutation
 * that removed a real admin gate passed. The question is only ever whether the
 * SESSION's role was checked.
 */
function sessionVar(body: string): string | null {
  const m = /const\s+(\w+)\s*=\s*await\s+(\w+)\s*\(/.exec(body);
  return m && /getCurrentUser|admin|requireUser|apiUser/.test(m[2]) ? m[1] : null;
}

/** Does this handler check WHICH role the signed-in user has? */
export function checksRole(body: string, helper = ""): boolean {
  if (/\bapi(?:User|Permission)\s*\(/.test(body)) return true;
  const v = sessionVar(body);
  if (v) {
    const re = new RegExp(`\\.includes\\(\\s*${v}\\.role\\s*\\)|\\b${v}\\.role\\s*(?:!==|===)`);
    if (re.test(body)) return true;
  }
  return helper ? checksRole(helper) : false;
}

/** The source of a named local helper, so its role check counts as the caller's. */
function helperBody(code: string, name: string): string {
  const m = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`).exec(code);
  if (!m) return "";
  const start = m.index + m[0].length - 1;
  let depth = 0;
  for (let i = start; i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}" && --depth === 0) return code.slice(start, i);
  }
  return "";
}

const ALL: (Handler & { gates: string[]; gateAt: number; roleChecked: boolean })[] = FILES.flatMap((f) => {
  const local = localGates(f.code);
  const gateNames = [...LIB_GATES, ...local];
  return handlers(f.src, f.route).map((h) => {
    const gates = gateNames.filter((g) => new RegExp(`\\b${g}\\s*\\(`).test(h.body));
    const inline = inlineGate(h.body);
    if (!gates.length && inline) gates.push("getCurrentUser");
    const positions = gates.map((g) => h.body.search(new RegExp(`\\b${g}\\s*\\(`))).filter((i) => i >= 0);
    // A role check counts whether it is written in the handler or inside the
    // helper the handler calls — `admin()` wrapping the role array is the same
    // decision, one indirection away.
    const roleChecked = checksRole(
      h.body,
      (() => {
        const g = local.find((n) => new RegExp(`\\b${n}\\s*\\(`).test(h.body));
        return g ? helperBody(f.code, g) : "";
      })(),
    );
    return { ...h, gates, gateAt: positions.length ? Math.min(...positions) : -1, roleChecked };
  });
});

describe("the handler scanner", () => {
  it("is reading the routes it means to", () => {
    // Guards against the sweep passing because it found nothing.
    expect(FILES.length).toBeGreaterThan(20);
    expect(ALL.length).toBeGreaterThan(25);
    expect(ALL.filter((h) => WRITES.has(h.method)).length).toBeGreaterThan(10);
  });

  it("separates one handler from the next", () => {
    const src = `export async function GET() { return apiUser(["ADMIN"]); }\nexport async function POST() { return 1; }`;
    const found = handlers(src, "x");
    expect(found.map((h) => h.method)).toEqual(["GET", "POST"]);
    // The POST body must NOT inherit GET's gate — that would let one gated
    // handler vouch for every other handler in the same file.
    expect(found[1].body).not.toContain("apiUser");
  });

  it("does not accept a helper that never checks the session", () => {
    expect(localGates(`async function admin() { return true; }`)).toEqual([]);
    expect(localGates(`async function admin() { const u = await getCurrentUser(); return u; }`)).toEqual(["admin"]);
  });

  it("does not count getCurrentUser unless its result is acted on", () => {
    // Fetching the session and ignoring it is not a gate.
    expect(inlineGate(`const me = await getCurrentUser(); return NextResponse.json({});`)).toBe(false);
    expect(inlineGate(`const me = await getCurrentUser(); if (!me) return unauthorized();`)).toBe(true);
  });

  it("does not mistake a body type-check for a role check", () => {
    /*
     * `typeof b.role === "string"` is about the REQUEST, not the caller. An
     * earlier version of this test matched it, so removing a real
     * `["ADMIN","IT"].includes(me.role)` from a handler left the suite green
     * while any signed-in user could have edited logins. Found by mutation.
     */
    expect(checksRole(`const me = await getCurrentUser(); const x = typeof b.role === "string";`)).toBe(false);
    expect(checksRole(`const me = await getCurrentUser(); if (!["ADMIN"].includes(me.role)) return no();`)).toBe(true);
    expect(
      checksRole(`const me = await admin();`, `const u = await getCurrentUser(); return u.role === "ADMIN";`),
    ).toBe(true);
  });

  it("does not let a handler vouch for itself", () => {
    /*
     * `export async function POST(req) { const me = await getCurrentUser(); }`
     * used to register "POST" as a local gate, and then the declaration matched
     * the search for a call to it. Every handler passed by existing. Caught by
     * mutating a role check away and watching the suite stay green.
     */
    expect(localGates(`export async function POST(req) { const me = await getCurrentUser(); }`)).toEqual([]);
  });
});

describe("no API handler is reachable without authorisation", () => {
  it("gates every handler that is not deliberately public", () => {
    const ungated = ALL.filter((h) => !h.gates.length && !(`${h.route} ${h.method}` in PUBLIC)).map(
      (h) => `${h.route} ${h.method}`,
    );
    expect(
      ungated,
      "add a gate (apiUser/apiPermission, or a local helper that calls getCurrentUser), " +
        "or add the route to PUBLIC with the reason it may answer anonymously",
    ).toEqual([]);
  });

  it("keeps the public list to routes that still exist", () => {
    // A stale exemption is a hole waiting for someone to reuse the path.
    const real = new Set(ALL.map((h) => `${h.route} ${h.method}`));
    expect([...Object.keys(PUBLIC)].filter((k) => !real.has(k))).toEqual([]);
  });

  it("lets nothing be written anonymously except sign-in itself", () => {
    /*
     * The narrower rule, stated separately because it is the one that matters
     * most: a public GET leaks, but a public write LETS SOMEONE CHANGE THE
     * BUSINESS'S RECORDS. The three exemptions all concern establishing or
     * ending a session, and none of them touches distribution data.
     */
    const publicWrites = Object.keys(PUBLIC).filter((k) => WRITES.has(k.split(" ")[1]));
    expect(publicWrites.sort()).toEqual(["auth/login POST", "auth/logout POST", "auth/setup POST"]);
  });

  it("checks WHICH role, not merely that someone signed in, on every admin route", () => {
    /*
     * The narrower rule, and the one a mutation caught: removing
     * `["ADMIN","IT"].includes(me.role)` from a handler left it still calling
     * `getCurrentUser`, so a gate-presence test stayed green while any
     * signed-in RSO could have unlocked accounts or edited logins.
     *
     * Everything under /api/admin is administrative by definition; if a route
     * there ever should be reachable by another role, that is a deliberate
     * change and this is where it gets argued.
     */
    const weak = ALL.filter((h) => h.route.startsWith("admin/") && !h.roleChecked).map((h) => `${h.route} ${h.method}`);
    expect(weak, "an admin route must check the role, not just the session").toEqual([]);
  });

  it("checks the session before reading the request body", () => {
    /*
     * Order matters for more than tidiness: parsing an unauthenticated body
     * spends memory and CPU on a caller who has not proved anything, which is
     * the cheap half of a denial-of-service. Every gate should come first.
     */
    const late = ALL.filter((h) => {
      if (h.gateAt < 0) return false;
      const bodyAt = h.body.search(/\breq(?:uest)?\.(?:json|formData|text|arrayBuffer)\s*\(/);
      return bodyAt >= 0 && bodyAt < h.gateAt;
    }).map((h) => `${h.route} ${h.method}`);
    expect(late, "authorise before parsing the request body").toEqual([]);
  });
});

describe("the credential hash stays inside the auth module", () => {
  it("is not carried on the object the whole app holds", () => {
    /*
     * `getCurrentUser` is passed into layouts, pages and permission checks. If
     * the row it returns carries `credentialHash`, then every one of those is
     * one careless serialisation away from publishing a password hash. Login
     * reads the user row itself, so nothing outside lib/auth needs it.
     */
    const auth = fs.readFileSync(path.join(ROOT, "lib", "auth.ts"), "utf8");
    expect(auth).toMatch(/omit:\s*\{\s*credentialHash:\s*true\s*\}/);
  });

  it("is read only where a credential is being set or verified", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(e.name)) {
          const src = stripComments(fs.readFileSync(full, "utf8"));
          if (/credentialHash/.test(src)) offenders.push(relativeTo(ROOT)(full));
        }
      }
    };
    for (const d of ["app", "lib"]) walk(path.join(ROOT, d));
    /*
     * lib/auth.ts hashes and verifies; the auth routes set one. The list is an
     * allow-list rather than a ban, so a NEW file touching the hash fails here
     * and has to be argued for — which is what happened when
     * /api/auth/change-credential was added: it reads the hash for one purpose,
     * verifying the caller's current credential before replacing it, and it
     * reads it with its own query rather than expecting it on the session user.
     */
    expect(offenders.sort()).toEqual(
      [
        "app/api/admin/employees/[role]/route.ts",
        "app/api/admin/users/route.ts",
        "app/api/auth/change-credential/route.ts",
        "app/api/auth/login/route.ts",
        "app/api/auth/setup/route.ts",
        "lib/auth.ts",
      ].sort(),
    );
  });
});

describe("every write is rate limited", () => {
  /**
   * Authorisation says WHO may write. This says HOW MUCH, and it matters for a
   * different threat: the session that has already been stolen, and the retry
   * loop that has already gone wrong. Neither is stopped by a role check.
   */
  const EXEMPT: Record<string, string> = {
    "auth/login POST": "has its own throttle, per source AND per account (lib/login-policy)",
    "auth/logout POST": "deletes the caller's own session; nothing to amplify",
    "auth/setup POST": "refuses inside a serializable transaction once any user exists",
  };

  it("limits every write handler that is not exempt", () => {
    const unlimited = ALL.filter(
      (h) => WRITES.has(h.method) && !/consumeRateLimit\s*\(/.test(h.body) && !(`${h.route} ${h.method}` in EXEMPT),
    ).map((h) => `${h.route} ${h.method}`);
    expect(unlimited, "add consumeRateLimit(RATE_LIMITS.…, actor.id), or exempt it with a reason").toEqual([]);
  });

  it("keeps the exemption list to routes that still exist", () => {
    const real = new Set(ALL.map((h) => `${h.route} ${h.method}`));
    expect(Object.keys(EXEMPT).filter((k) => !real.has(k))).toEqual([]);
  });

  it("counts the limit against the acting user, not the request", () => {
    /*
     * `consumeRateLimit(rule, subject)` — the subject has to be something the
     * caller cannot change at will. Keying on an address or a header would let
     * whoever is being limited simply pick a new one, which is exactly the hole
     * this update closed in the login throttle.
     */
    const bySubject = ALL.filter((h) => /consumeRateLimit\s*\(/.test(h.body));
    expect(bySubject.length).toBeGreaterThan(8);
    const suspicious = bySubject
      .filter((h) => !/consumeRateLimit\([^)]*,\s*(me|actor|user|u)\.id\s*\)/.test(h.body))
      .map((h) => `${h.route} ${h.method}`);
    expect(suspicious, "limit against the signed-in user's id").toEqual([]);
  });
});

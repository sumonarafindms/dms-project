import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "../../../../lib/prisma";
import { createSession, homeForRole, verifyCredential } from "../../../../lib/auth";
import { audit } from "../../../../lib/audit";
import { phoneKey } from "../../../../lib/phone";
import { apiError } from "../../../../lib/http-errors";
import { activeLock, nextLoginFailure } from "../../../../lib/login-policy";
import { nextAccountState } from "../../../../lib/credential-policy";

function mobileVariants(identifier: string) {
  const raw = identifier.trim(),
    key = phoneKey(raw);
  if (!key) return [raw];
  const values = new Set<string>([raw, key, `0${key}`, `880${key}`, `+880${key}`]);
  return [...values];
}
function clientHint(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || "unknown";
}
/**
 * The identifier, in the one form both buckets agree on.
 *
 * A field login can be typed as 01700000001, 8801700000001 or +8801700000001
 * and reach the same account; without normalising, each spelling would get its
 * own counter and the limit would be three times what it says.
 */
const normalizeIdentifier = (identifier: string, admin: boolean) =>
  admin ? identifier.trim().toLowerCase() : phoneKey(identifier) || identifier.trim().toLowerCase();

const bucket = (scope: string, admin: boolean, normalized: string, client?: string) =>
  createHash("sha256")
    .update(`${scope}:${admin ? "admin" : "field"}:${normalized}${client ? `:${client}` : ""}`)
    .digest("hex");

/** One source against one identifier. Catches a single noisy attacker fast. */
const throttleKey = (normalized: string, admin: boolean, client: string) => bucket("src", admin, normalized, client);

/*
 * The account-scoped THROTTLE bucket is gone, replaced by something stricter:
 * `User.failedLoginCount` and `User.lockedAt`. A throttle only ever slowed an
 * attacker down; five consecutive failures now stop the account until a person
 * unlocks it. The source bucket below stays, because it is what prevents one
 * attacker from walking down a list of mobile numbers locking each account in
 * turn — they get blocked after five attempts of their own, before they can.
 */

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const identifier = String(body.identifier || "").trim(),
      credential = String(body.credential || ""),
      admin = !!body.admin;
    if (!identifier || !credential)
      return NextResponse.json({ error: "Mobile/username and PIN/password are required." }, { status: 400 });

    const normalized = normalizeIdentifier(identifier, admin),
      key = throttleKey(normalized, admin, clientHint(req)),
      now = new Date();
    await prisma.loginThrottle
      .deleteMany({ where: { updatedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
      .catch(() => {});
    const throttle = await prisma.loginThrottle.findUnique({ where: { key } });
    // One source, hammering. Checked before the account is even looked up, so a
    // blocked attacker cannot keep adding failures to other people's accounts.
    if (activeLock([throttle?.lockedUntil], now))
      return NextResponse.json({ error: "Too many failed attempts. Try again later." }, { status: 429 });
    // An expired source lock is cleared so that address starts clean.
    if (throttle?.lockedUntil && throttle.lockedUntil <= now)
      await prisma.loginThrottle.delete({ where: { key } }).catch(() => {});

    const user = await prisma.user.findFirst({
      where: admin
        ? { OR: [{ username: identifier }, { mobileNumber: identifier }] }
        : { mobileNumber: { in: mobileVariants(identifier) } },
    });
    const roleAllowed = Boolean(user && (admin ? user.role === "ADMIN" : user.role !== "ADMIN"));

    /*
     * A locked account is refused before the credential is even checked.
     *
     * Checking first would mean a correct PIN on a locked account still told
     * the attacker their guess was right, which is most of what they wanted.
     */
    if (user?.lockedAt && roleAllowed)
      return NextResponse.json(
        { error: "This login is locked after too many failed attempts. Ask your administrator to unlock it." },
        { status: 403 },
      );

    const valid = Boolean(
      user && user.active && roleAllowed && (await verifyCredential(credential, user.credentialHash)),
    );
    if (!valid) {
      // The source bucket forgets: an office behind one address should not
      // inherit yesterday's mistakes once its lock has expired.
      const expired = Boolean(throttle?.lockedUntil && throttle.lockedUntil <= now);
      const src = nextLoginFailure(expired ? 0 : throttle?.failedCount || 0);
      await prisma.loginThrottle.upsert({
        where: { key },
        update: { failedCount: src.failedCount, lockedUntil: src.lockedUntil },
        create: { key, failedCount: src.failedCount, lockedUntil: src.lockedUntil },
      });

      /*
       * The account's own counter, on the user row rather than in a throttle
       * table, because this one has to outlive any sweep: a lock that quietly
       * expires is not the lock the owner asked for.
       *
       * Only counted for a real account the identifier could belong to. A
       * mistyped number has nothing to lock, and counting it would let anyone
       * lock an account by guessing near-miss numbers.
       */
      let justLocked = false;
      if (user && roleAllowed) {
        const next = nextAccountState(user.failedLoginCount);
        justLocked = Boolean(next.lockedAt);
        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginCount: next.failedLoginCount, lockedAt: next.lockedAt },
        });
        if (justLocked)
          await audit(user, "ACCOUNT_LOCKED", "auth", {
            targetType: "User",
            targetId: user.id,
            targetName: user.displayName,
            detail: `Locked after ${next.failedLoginCount} consecutive failed sign-ins`,
          });
      }

      if (justLocked)
        return NextResponse.json(
          { error: "This login is locked after too many failed attempts. Ask your administrator to unlock it." },
          { status: 403 },
        );
      const locked = activeLock([src.lockedUntil], now);
      return NextResponse.json(
        { error: locked ? "Too many failed attempts. Try again later." : "Invalid login credentials." },
        { status: locked ? 429 : 401 },
      );
    }

    // Proving the account is theirs clears both the source penalty and the
    // account's failure history.
    await prisma.loginThrottle.deleteMany({ where: { key } });
    if (user!.failedLoginCount > 0)
      await prisma.user.update({ where: { id: user!.id }, data: { failedLoginCount: 0 } });
    await createSession(user!.id);
    await audit(user!, "LOGIN", "auth", {
      targetType: "User",
      targetId: user!.id,
      targetName: user!.displayName,
      detail: "Signed in successfully",
    });
    return NextResponse.json({ ok: true, redirect: homeForRole(user!.role) });
  } catch (error) {
    console.error(error);
    const e = apiError(error, "Unable to sign in right now.");
    return NextResponse.json({ error: e.error }, { status: e.status });
  }
}

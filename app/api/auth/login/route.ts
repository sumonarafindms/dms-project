import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "../../../../lib/prisma";
import { createSession, homeForRole, verifyCredential } from "../../../../lib/auth";
import { audit } from "../../../../lib/audit";
import { phoneKey } from "../../../../lib/phone";
import { apiError } from "../../../../lib/http-errors";
import { activeLock, nextLoginFailure } from "../../../../lib/login-policy";
import { MAX_FAILURES_BEFORE_LOCK, nextAccountState } from "../../../../lib/credential-policy";
import { readJson } from "@/lib/request-body";

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

/**
 * v200: one source against EVERY identifier.
 *
 * The bucket above is per identifier, so it never stopped what its own comment
 * said it stopped: one address walking down the staff list, five wrong PINs
 * each, locking every RSO and BP until an administrator unlocked them one by
 * one. This one counts every failure from an address, whichever account it
 * names; past the limit the address is refused before any account is touched.
 * Generous enough for an office behind one connection with people mistyping.
 */
const SOURCE_WIDE_FAILURES = 25;
const sourceWideKey = (admin: boolean, client: string) => bucket("ip", admin, "*", client);

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
    const body = await readJson(req);
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
    const wideKey = sourceWideKey(admin, clientHint(req));
    const [throttle, wide] = await Promise.all([
      prisma.loginThrottle.findUnique({ where: { key } }),
      prisma.loginThrottle.findUnique({ where: { key: wideKey } }),
    ]);
    // One source, hammering. Checked before the account is even looked up, so a
    // blocked attacker cannot keep adding failures to other people's accounts.
    if (activeLock([throttle?.lockedUntil, wide?.lockedUntil], now))
      return NextResponse.json({ error: "Too many failed attempts. Try again later." }, { status: 429 });
    // An expired source lock is cleared so that address starts clean.
    if (throttle?.lockedUntil && throttle.lockedUntil <= now)
      await prisma.loginThrottle.delete({ where: { key } }).catch(() => {});
    if (wide?.lockedUntil && wide.lockedUntil <= now)
      await prisma.loginThrottle.delete({ where: { key: wideKey } }).catch(() => {});

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

    /*
     * v200: RESERVE the attempt before checking it.
     *
     * The counter used to be read, incremented in JavaScript and written back
     * as a fixed value after the ~50ms credential check. Five hundred guesses
     * sent at once all read 0, all passed the lock check, and all wrote 1 — so
     * the five-strike lock allowed thousands of guesses. Now each attempt
     * increments the row atomically first and reads what it got back: the
     * sixth concurrent guess sees 6 and is refused without being checked at
     * all. A correct PIN puts the counter back to zero below.
     */
    let reserved: { failedLoginCount: number; lockedAt: Date | null } | null = null;
    if (user && roleAllowed) {
      reserved = await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: { increment: 1 } },
        select: { failedLoginCount: true, lockedAt: true },
      });
      if (reserved.lockedAt || reserved.failedLoginCount > MAX_FAILURES_BEFORE_LOCK) {
        await prisma.user.updateMany({ where: { id: user.id, lockedAt: null }, data: { lockedAt: now } });
        return NextResponse.json(
          { error: "This login is locked after too many failed attempts. Ask your administrator to unlock it." },
          { status: 403 },
        );
      }
    }

    const valid = Boolean(
      user && user.active && roleAllowed && (await verifyCredential(credential, user.credentialHash)),
    );
    if (!valid) {
      // The source bucket forgets: an office behind one address should not
      // inherit yesterday's mistakes once its lock has expired.
      // v200: incremented in the database, not read-add-write, for the same
      // reason as the account counter above.
      const counted = await prisma.loginThrottle.upsert({
        where: { key },
        update: { failedCount: { increment: 1 } },
        create: { key, failedCount: 1 },
        select: { failedCount: true },
      });
      const src = nextLoginFailure(counted.failedCount - 1);
      if (src.lockedUntil)
        await prisma.loginThrottle.update({ where: { key }, data: { lockedUntil: src.lockedUntil } });
      const wideCount = await prisma.loginThrottle.upsert({
        where: { key: wideKey },
        update: { failedCount: { increment: 1 } },
        create: { key: wideKey, failedCount: 1 },
        select: { failedCount: true },
      });
      if (wideCount.failedCount >= SOURCE_WIDE_FAILURES)
        await prisma.loginThrottle.update({
          where: { key: wideKey },
          data: { lockedUntil: new Date(now.getTime() + 15 * 60_000), failedCount: 0 },
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
      if (user && roleAllowed && reserved) {
        // The attempt was already counted when it was reserved; this decides
        // the lock from that same number (nextAccountState(before) === reserved).
        const next = nextAccountState(reserved.failedLoginCount - 1);
        if (next.lockedAt) {
          // Only the request that actually sets the lock audits it.
          const set = await prisma.user.updateMany({
            where: { id: user.id, lockedAt: null },
            data: { lockedAt: next.lockedAt },
          });
          justLocked = set.count > 0;
        }
        if (justLocked)
          await audit(user, "ACCOUNT_LOCKED", "auth", {
            targetType: "User",
            targetId: user.id,
            targetName: user.displayName,
            detail: `Locked after ${reserved.failedLoginCount} consecutive failed sign-ins`,
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
    /*
     * v200: the reset only lands on an account that is still unlocked. A
     * concurrent wave of guesses may have locked it while this one was being
     * checked; a correct guess inside that wave must not get a session.
     */
    const cleared = await prisma.user.updateMany({
      where: { id: user!.id, lockedAt: null },
      data: { failedLoginCount: 0 },
    });
    if (cleared.count === 0)
      return NextResponse.json(
        { error: "This login is locked after too many failed attempts. Ask your administrator to unlock it." },
        { status: 403 },
      );
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

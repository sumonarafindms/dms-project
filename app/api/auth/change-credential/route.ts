import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { createSession, getCurrentUser, hashCredential, verifyCredential } from "../../../../lib/auth";
import { audit } from "../../../../lib/audit";
import { credentialNoun, validateCredentialChange } from "../../../../lib/credential-change";
import { RATE_LIMITS, consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Change your own PIN (or, for an administrator, your own password).
 *
 * ## Who may call it
 *
 * Anybody signed in, and that is the point: every role gets this, because the
 * person who most needs to change a PIN in a hurry is the RSO who just had
 * theirs read over their shoulder in a shop, and they are the role with the
 * fewest screens.
 *
 * ## Three decisions worth recording
 *
 * **A wrong current PIN does NOT count toward the five-strike lock.** The lock
 * has no timer — an administrator has to clear it — so counting fat fingers
 * here would take a working session and turn it into a support call. The
 * caller already holds a valid session, so this is not an anonymous guessing
 * oracle; the credential rate limit (20 per ten minutes, per user) is the
 * proportionate defence and it is applied before anything is read.
 *
 * **Every other session is revoked, and this one is replaced.** Changing a
 * credential because it may be known to somebody else is worthless if their
 * session stays alive. `deleteMany` then `createSession` also means the device
 * doing the changing is not signed out of itself, which is what would happen
 * if the revocation were left to the existing admin-reset path.
 *
 * **The audit entry records that it happened, never what changed.** No PIN,
 * old or new, reaches the log.
 */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await consumeRateLimit(RATE_LIMITS.credential, me.id);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl.retryAfterSeconds);
    return NextResponse.json(r.body, r.init);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const current = String(body.current ?? ""),
    next = String(body.next ?? ""),
    confirm = String(body.confirm ?? "");

  /*
   * The hash is read here rather than taken from `me`. `getCurrentUser` omits
   * `credentialHash` on purpose — that object is handed to layouts and client
   * components, and is one careless stringify away from a browser — so the one
   * place that needs it fetches it, exactly as the login route does.
   */
  const row = await prisma.user.findUnique({ where: { id: me.id }, select: { credentialHash: true } });
  if (!row) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  /*
   * The hash comparison runs first so `validateCredentialChange` can order its
   * messages properly — "your current PIN is incorrect" before anything about
   * the new one. It is skipped when the field is empty, because scrypt on an
   * empty string is work for an answer already known.
   */
  const currentMatches = current.trim() ? await verifyCredential(current.trim(), row.credentialHash) : false;
  const error = validateCredentialChange({ role: me.role, current, next, confirm, currentMatches });
  if (error) return NextResponse.json({ error }, { status: 400 });

  const credentialHash = await hashCredential(next.trim());
  await prisma.user.update({
    where: { id: me.id },
    // A person who can sign in and prove their current credential is not the
    // person a lock is meant to stop, so the counter is cleared with it.
    data: { credentialHash, failedLoginCount: 0, lockedAt: null },
  });
  await prisma.session.deleteMany({ where: { userId: me.id } });
  await createSession(me.id);

  await audit({ id: me.id, displayName: me.displayName, role: me.role }, "CHANGE_OWN_CREDENTIAL", "users", {
    targetType: "User",
    targetId: me.id,
    targetName: me.displayName,
    detail: `Changed their own ${credentialNoun(me.role)}. All other sessions signed out.`,
  });

  return NextResponse.json({ ok: true, message: `Your ${credentialNoun(me.role)} has been changed.` });
}

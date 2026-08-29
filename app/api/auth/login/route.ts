import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "../../../../lib/prisma";
import { createSession, homeForRole, verifyCredential } from "../../../../lib/auth";
import { audit } from "../../../../lib/audit";
import { phoneKey } from "../../../../lib/phone";
import { apiError } from "../../../../lib/http-errors";
import { nextLoginFailure } from "../../../../lib/login-policy";

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
const throttleKey = (identifier: string, admin: boolean, client: string) => {
  const normalized = admin ? identifier.trim().toLowerCase() : phoneKey(identifier) || identifier.trim().toLowerCase();
  return createHash("sha256")
    .update(`${admin ? "admin" : "field"}:${normalized}:${client}`)
    .digest("hex");
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const identifier = String(body.identifier || "").trim(),
      credential = String(body.credential || ""),
      admin = !!body.admin;
    if (!identifier || !credential)
      return NextResponse.json({ error: "Mobile/username and PIN/password are required." }, { status: 400 });

    const key = throttleKey(identifier, admin, clientHint(req)),
      now = new Date();
    await prisma.loginThrottle
      .deleteMany({ where: { updatedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
      .catch(() => {});
    const throttle = await prisma.loginThrottle.findUnique({ where: { key } });
    if (throttle?.lockedUntil && throttle.lockedUntil > now) {
      return NextResponse.json({ error: "Too many failed attempts. Try again later." }, { status: 429 });
    }
    if (throttle?.lockedUntil && throttle.lockedUntil <= now)
      await prisma.loginThrottle.delete({ where: { key } }).catch(() => {});

    const user = await prisma.user.findFirst({
      where: admin
        ? { OR: [{ username: identifier }, { mobileNumber: identifier }] }
        : { mobileNumber: { in: mobileVariants(identifier) } },
    });
    const roleAllowed = Boolean(user && (admin ? user.role === "ADMIN" : user.role !== "ADMIN"));
    const valid = Boolean(
      user && user.active && roleAllowed && (await verifyCredential(credential, user.credentialHash)),
    );
    if (!valid) {
      const current = throttle?.lockedUntil && throttle.lockedUntil <= now ? 0 : throttle?.failedCount || 0;
      const { failedCount, lockedUntil } = nextLoginFailure(current);
      await prisma.loginThrottle.upsert({
        where: { key },
        update: { failedCount, lockedUntil },
        create: { key, failedCount, lockedUntil },
      });
      return NextResponse.json(
        { error: lockedUntil ? "Too many failed attempts. Try again later." : "Invalid login credentials." },
        { status: lockedUntil ? 429 : 401 },
      );
    }

    await prisma.loginThrottle.deleteMany({ where: { key } });
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

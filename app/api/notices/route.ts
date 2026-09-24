/**
 * v203 — the notice board, write side.
 *
 *   POST   post a notice (Admin, IT, Manager, Accounts)
 *   PATCH  take one down, or put it back up ({ id, active })
 *
 * A Manager's notice is stamped with their supervisors at the moment of
 * posting, so it reaches their teams and nobody else's, and a Manager may
 * only take down their own. The role check and the rate limit are written out
 * in each handler — tests/api-authorization reads each handler's own body.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { RATE_LIMITS, consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { readJson } from "@/lib/request-body";
import { dhakaTodayYmd } from "@/lib/business-time";
import { managerScope } from "@/lib/manager-scope";
import { NOTICE_POST_ROLES, checkNotice } from "@/lib/notice-rules";

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || !NOTICE_POST_ROLES.includes(me.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await consumeRateLimit(RATE_LIMITS.mutation, me.id);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl.retryAfterSeconds);
    return NextResponse.json(r.body, r.init);
  }

  const b = await readJson(req);
  const checked = checkNotice(b, me.role, dhakaTodayYmd());
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const n = checked.notice;

  let supervisorIds: string[] = [];
  if (me.role === "MANAGER") {
    supervisorIds = (await managerScope(me.id)).supervisorIds;
    if (!supervisorIds.length)
      return NextResponse.json(
        { error: "No team is assigned to you yet, so there is nobody for this notice to reach." },
        { status: 400 },
      );
  }

  const row = await prisma.notice.create({
    data: {
      title: n.title,
      body: n.body,
      audience: n.audience,
      supervisorIds,
      urgent: n.urgent,
      expiresOn: n.expiresOn ? new Date(`${n.expiresOn}T00:00:00.000Z`) : null,
      createdById: me.id,
      createdByName: me.displayName,
    },
    select: { id: true },
  });
  await audit(me, "POST_NOTICE", "notices", {
    targetType: "Notice",
    targetId: row.id,
    targetName: n.title,
    metadata: { audience: n.audience, urgent: n.urgent, expiresOn: n.expiresOn, teams: supervisorIds.length },
  });
  return NextResponse.json({ ok: true, id: row.id });
}

export async function PATCH(req: Request) {
  const me = await getCurrentUser();
  if (!me || !NOTICE_POST_ROLES.includes(me.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await consumeRateLimit(RATE_LIMITS.mutation, me.id);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl.retryAfterSeconds);
    return NextResponse.json(r.body, r.init);
  }

  const b = await readJson(req);
  const id = typeof b.id === "string" ? b.id : "";
  if (!id || typeof b.active !== "boolean") return NextResponse.json({ error: "Which notice?" }, { status: 400 });
  const row = await prisma.notice.findUnique({ where: { id }, select: { id: true, title: true, createdById: true } });
  if (!row) return NextResponse.json({ error: "That notice no longer exists." }, { status: 404 });
  if (me.role === "MANAGER" && row.createdById !== me.id)
    return NextResponse.json({ error: "You can only change notices you posted." }, { status: 403 });

  await prisma.notice.update({ where: { id }, data: { active: b.active } });
  await audit(me, b.active ? "RESTORE_NOTICE" : "REMOVE_NOTICE", "notices", {
    targetType: "Notice",
    targetId: id,
    targetName: row.title,
  });
  return NextResponse.json({ ok: true });
}

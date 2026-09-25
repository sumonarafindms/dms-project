import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { dhakaTodayYmd } from "../../../../lib/business-time";
import { prisma } from "../../../../lib/prisma";
import { getCurrentUser } from "../../../../lib/auth";
import { audit } from "../../../../lib/audit";
import { RATE_LIMITS, consumeRateLimit, rateLimitResponse } from "../../../../lib/rate-limit";
import { readJson } from "@/lib/request-body";
import { monthCloseChecks, monthSnapshot } from "../../../../lib/month-close";
import {
  MONTH_CLOSE_ROLES,
  MONTH_REOPEN_ROLES,
  isYm,
  monthHasEnded,
  monthLabel,
} from "../../../../lib/month-close-rules";

/**
 * v206 — close a month (Accounts) or reopen one (Admin).
 *
 * Closing records the month's figures as they stand and, from then on, every
 * stock and money write dated in it is refused (lib/month-close.ts).
 * Days whose cash was never counted, or changed after counting, are listed
 * first; closing over them needs `confirm: true` — a warning, not a wall,
 * because a house that does not count cash every day must still be able to
 * close its books.
 */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || !MONTH_CLOSE_ROLES.includes(me.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await consumeRateLimit(RATE_LIMITS.mutation, me.id);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl.retryAfterSeconds);
    return NextResponse.json(r.body, r.init);
  }

  const b = (await readJson(req)) as Record<string, unknown>;
  const month = b.month;
  if (!isYm(month)) return NextResponse.json({ error: "Which month?" }, { status: 400 });
  if (!monthHasEnded(month, dhakaTodayYmd()))
    return NextResponse.json({ error: `${monthLabel(month)} has not ended yet.` }, { status: 400 });
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 400) : "";

  const checks = await monthCloseChecks(month);
  const warnings = checks.openCashDays.length + checks.changedCashDays.length;
  if (warnings && b.confirm !== true)
    return NextResponse.json(
      {
        error: "Some days need a look before closing.",
        checks,
      },
      { status: 409 },
    );

  const snapshot = await monthSnapshot(month);
  try {
    await prisma.monthClose.create({
      data: {
        month,
        closedById: me.id,
        closedByName: me.displayName,
        note: note || null,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json({ error: `${monthLabel(month)} is already closed.` }, { status: 409 });
    throw e;
  }
  await audit(me, "CLOSE_MONTH", "stock", {
    targetType: "MonthClose",
    targetId: month,
    detail: month,
    metadata: { ...snapshot, overLooked: warnings },
  });
  return NextResponse.json({ ok: true, snapshot });
}

export async function DELETE(req: Request) {
  const me = await getCurrentUser();
  if (!me || !MONTH_REOPEN_ROLES.includes(me.role))
    return NextResponse.json({ error: "Only Admin can reopen a closed month." }, { status: 401 });
  const rl = await consumeRateLimit(RATE_LIMITS.mutation, me.id);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl.retryAfterSeconds);
    return NextResponse.json(r.body, r.init);
  }

  const b = (await readJson(req)) as Record<string, unknown>;
  const month = b.month;
  if (!isYm(month)) return NextResponse.json({ error: "Which month?" }, { status: 400 });
  const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 400) : "";
  // Reopening sealed books is said out loud: the reason goes in the log.
  if (reason.length < 3) return NextResponse.json({ error: "Say why it is being reopened." }, { status: 400 });

  const row = await prisma.monthClose.findUnique({ where: { month } });
  if (!row) return NextResponse.json({ error: `${monthLabel(month)} is not closed.` }, { status: 404 });
  const gone = await prisma.monthClose.deleteMany({ where: { month } });
  if (!gone.count) return NextResponse.json({ error: `${monthLabel(month)} is not closed.` }, { status: 404 });
  await audit(me, "REOPEN_MONTH", "stock", {
    targetType: "MonthClose",
    targetId: month,
    detail: month,
    metadata: { reason, closedBy: row.closedByName, closedAt: row.closedAt.toISOString() },
  });
  return NextResponse.json({ ok: true });
}

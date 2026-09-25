import { NextResponse } from "next/server";
import { MAX_MONEY, dhakaTodayYmd, isYmd } from "../../../../../lib/business-time";
import { prisma } from "../../../../../lib/prisma";
import { getCurrentUser } from "../../../../../lib/auth";
import { audit } from "../../../../../lib/audit";
import { RATE_LIMITS, consumeRateLimit, rateLimitResponse } from "../../../../../lib/rate-limit";
import { readJson } from "@/lib/request-body";
import { lockedFor } from "../../../../../lib/month-close";
import { CASH_BOOK_WRITE_ROLES, CASH_MOVE_LABEL, isCashMoveKind } from "../../../../../lib/cash-book-rules";
import { paisa } from "../../../../../lib/stock";

/**
 * v206 — cash that moved in or out of the box other than a person's deposit
 * or an expense: taken to the bank, paid to the company, the owner's own.
 * Nothing here touches anybody's due.
 */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || !CASH_BOOK_WRITE_ROLES.includes(me.role))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await consumeRateLimit(RATE_LIMITS.mutation, me.id);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl.retryAfterSeconds);
    return NextResponse.json(r.body, r.init);
  }

  const b = (await readJson(req)) as Record<string, unknown>;
  const date = String(b.date || "");
  if (!isYmd(date)) return NextResponse.json({ error: "Which day?" }, { status: 400 });
  if (date > dhakaTodayYmd()) return NextResponse.json({ error: "That day has not come yet." }, { status: 400 });
  const locked = await lockedFor([date]);
  if (locked) return NextResponse.json({ error: locked }, { status: 423 });
  if (!isCashMoveKind(b.kind)) return NextResponse.json({ error: "Where did the cash go?" }, { status: 400 });
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || !(paisa(amount) > 0))
    return NextResponse.json({ error: "An amount must be more than zero." }, { status: 400 });
  if (paisa(amount) > MAX_MONEY) return NextResponse.json({ error: "That amount is too large." }, { status: 400 });
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 200) : "";

  const row = await prisma.cashMove.create({
    data: {
      date: new Date(`${date}T00:00:00.000Z`),
      kind: b.kind,
      amount: paisa(amount),
      note: note || null,
      createdById: me.id,
    },
    select: { id: true },
  });
  await audit(me, "RECORD_CASH_MOVE", "stock", {
    targetType: "CashMove",
    targetId: row.id,
    detail: date,
    metadata: { kind: b.kind, label: CASH_MOVE_LABEL[b.kind], amount: paisa(amount) },
  });
  return NextResponse.json({ ok: true, id: row.id });
}

export async function DELETE(req: Request) {
  const me = await getCurrentUser();
  if (!me || !CASH_BOOK_WRITE_ROLES.includes(me.role))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await consumeRateLimit(RATE_LIMITS.mutation, me.id);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl.retryAfterSeconds);
    return NextResponse.json(r.body, r.init);
  }

  const b = (await readJson(req)) as Record<string, unknown>;
  const id = typeof b.id === "string" ? b.id : "";
  if (!id) return NextResponse.json({ error: "Which entry?" }, { status: 400 });
  const row = await prisma.cashMove.findUnique({ where: { id }, select: { date: true, kind: true, amount: true } });
  if (!row) return NextResponse.json({ error: "That entry is already gone." }, { status: 404 });
  const locked = await lockedFor([row.date]);
  if (locked) return NextResponse.json({ error: locked }, { status: 423 });

  const gone = await prisma.cashMove.deleteMany({ where: { id } });
  if (!gone.count) return NextResponse.json({ error: "That entry is already gone." }, { status: 404 });
  await audit(me, "DELETE_CASH_MOVE", "stock", {
    targetType: "CashMove",
    targetId: id,
    detail: row.date.toISOString().slice(0, 10),
    metadata: { kind: row.kind, amount: Number(row.amount) },
  });
  return NextResponse.json({ ok: true });
}

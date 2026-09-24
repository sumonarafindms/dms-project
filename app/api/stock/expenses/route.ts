import { NextResponse } from "next/server";
import { MAX_MONEY, isYmd } from "../../../../lib/business-time";
import { prisma } from "../../../../lib/prisma";
import { getCurrentUser } from "../../../../lib/auth";
import { audit } from "../../../../lib/audit";
import { RATE_LIMITS, consumeRateLimit, rateLimitResponse } from "../../../../lib/rate-limit";
import { BOOKS_WRITE_ROLES } from "../../../../lib/lifting-data";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "../../../../lib/lifting";
import { paisa } from "../../../../lib/stock";
import { readJson } from "@/lib/request-body";

/**
 * The house's running costs.
 *
 * Nothing here touches anybody's due, and that separation is the point: an
 * RSO's balance must not move because the office bought tea. An expense
 * reduces the net on the profit screen and nothing else.
 */

const isCategory = (v: string): v is ExpenseCategory => (EXPENSE_CATEGORIES as readonly string[]).includes(v);

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || !BOOKS_WRITE_ROLES.includes(me.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await consumeRateLimit(RATE_LIMITS.mutation, me.id);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl.retryAfterSeconds);
    return NextResponse.json(r.body, r.init);
  }

  const b = (await readJson(req)) as Record<string, unknown>;
  const date = String(b.date || "");
  const category = String(b.category || "");
  const paidFrom = String(b.paidFrom || "CASH");
  const amount = Number(b.amount);
  const note = String(b.note || "").slice(0, 400);

  if (!isYmd(date)) return NextResponse.json({ error: "Which date?" }, { status: 400 });
  if (!isCategory(category)) return NextResponse.json({ error: "What was it spent on?" }, { status: 400 });
  if (paidFrom !== "CASH" && paidFrom !== "BANK")
    return NextResponse.json({ error: "Paid from cash or bank?" }, { status: 400 });
  // v202: judged after rounding to paisa (0.004 saved a ৳0 expense) and capped.
  if (!Number.isFinite(amount) || !(paisa(amount) > 0))
    return NextResponse.json({ error: "An amount must be more than zero." }, { status: 400 });
  if (paisa(amount) > MAX_MONEY) return NextResponse.json({ error: "That amount is too large." }, { status: 400 });
  /*
   * v201: the owner's own kind of expense is OTHER plus its name ("Internet").
   * A name is required — "Other" with nothing to say what it was is an entry
   * nobody can explain next month — and it is tidied to one spelling per kind,
   * so "internet" joins an existing "Internet" rather than starting a new line.
   * An old-style "Other" with only a note still saves, under its note.
   */
  let label: string | null = null;
  if (category === "OTHER") {
    const typed = String(b.label || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 40);
    if (!typed && !note.trim())
      return NextResponse.json({ error: "Name the new kind of expense — e.g. Internet." }, { status: 400 });
    if (typed) {
      const same = await prisma.expense.findFirst({
        where: { category: "OTHER", label: { equals: typed, mode: "insensitive" } },
        select: { label: true },
      });
      label = same?.label ?? typed;
    }
  }

  const row = await prisma.expense.create({
    data: {
      date: new Date(`${date}T00:00:00.000Z`),
      category,
      label,
      amount: paisa(amount),
      paidFrom,
      payee: String(b.payee || "").slice(0, 120) || null,
      note: note || null,
      createdById: me.id,
    },
    select: { id: true },
  });

  await audit(me, "RECORD_EXPENSE", "stock", {
    targetType: "Expense",
    targetId: row.id,
    detail: date,
    metadata: { category, label, amount: paisa(amount), paidFrom },
  });
  return NextResponse.json({ ok: true, id: row.id });
}

export async function DELETE(req: Request) {
  const me = await getCurrentUser();
  if (!me || !BOOKS_WRITE_ROLES.includes(me.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await consumeRateLimit(RATE_LIMITS.mutation, me.id);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl.retryAfterSeconds);
    return NextResponse.json(r.body, r.init);
  }

  const b = (await readJson(req)) as Record<string, unknown>;
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ error: "Which expense?" }, { status: 400 });

  const row = await prisma.expense.findUnique({
    where: { id },
    select: { id: true, category: true, amount: true, date: true },
  });
  if (!row) return NextResponse.json({ error: "That expense is already gone." }, { status: 404 });

  // v202: deleteMany + count — two people removing the same row at once made the second a 500.
  const gone = await prisma.expense.deleteMany({ where: { id } });
  if (!gone.count) return NextResponse.json({ error: "That expense is already gone." }, { status: 404 });
  await audit(me, "DELETE_EXPENSE", "stock", {
    targetType: "Expense",
    targetId: id,
    detail: row.date.toISOString().slice(0, 10),
    metadata: { category: row.category, amount: Number(row.amount) },
  });
  return NextResponse.json({ ok: true });
}

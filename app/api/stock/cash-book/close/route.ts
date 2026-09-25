import { NextResponse } from "next/server";
import { MAX_MONEY, dhakaTodayYmd, isYmd } from "../../../../../lib/business-time";
import { prisma } from "../../../../../lib/prisma";
import { getCurrentUser } from "../../../../../lib/auth";
import { audit } from "../../../../../lib/audit";
import { RATE_LIMITS, consumeRateLimit, rateLimitResponse } from "../../../../../lib/rate-limit";
import { readJson } from "@/lib/request-body";
import { lockedFor } from "../../../../../lib/month-close";
import { cashBookLedger } from "../../../../../lib/cash-book";
import {
  CASH_BOOK_WRITE_ROLES,
  VARIANCE_TOLERANCE,
  cleanDenominations,
  countedCash,
} from "../../../../../lib/cash-book-rules";
import { paisa } from "../../../../../lib/stock";

/**
 * v206 — close one day's cash: the notes counted, against what the books say
 * should be there.
 *
 * The expected figure is computed HERE from the rows, never taken from the
 * form, so the count is always judged against the books as they stand at the
 * moment of closing. Re-closing a day (after a correction) replaces its count.
 *
 * Opening cash is carried from the last close. Only when there is none — the
 * very first close — is it typed, and it is then required.
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
  if (date > dhakaTodayYmd())
    return NextResponse.json({ error: "A day can be closed once it has begun." }, { status: 400 });
  const locked = await lockedFor([date]);
  if (locked) return NextResponse.json({ error: locked }, { status: 423 });

  const denominations = cleanDenominations(b.denominations);
  if (denominations === null)
    return NextResponse.json({ error: "Count each note as a whole number, zero or more." }, { status: 400 });
  const counted = countedCash(denominations);
  if (counted > MAX_MONEY) return NextResponse.json({ error: "That count is too large." }, { status: 400 });
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 400) : "";

  const [day] = await cashBookLedger(date, date);
  /*
   * Opening: what the earlier counts carry into this day. Only when there is
   * no earlier count — the very first close — is it typed; re-closing that
   * first day keeps the typed figure unless a new one is sent.
   */
  let opening: number;
  let openingTyped = false;
  if (day.carriedIn !== null) opening = day.carriedIn;
  else {
    const sent = b.openingCash;
    const typed = Number(sent);
    const given = sent !== undefined && sent !== null && sent !== "";
    if (given && (!Number.isFinite(typed) || typed < 0 || typed > MAX_MONEY))
      return NextResponse.json({ error: "Opening cash is zero or more." }, { status: 400 });
    if (!given && !day.close?.openingTyped)
      return NextResponse.json(
        { error: "This is the first cash count. Enter the cash that was in hand when the day began." },
        { status: 400 },
      );
    opening = given ? paisa(typed) : day.close!.openingCash;
    openingTyped = true;
  }

  const expected = paisa(opening + day.cashIn - day.cashOut);
  const variance = paisa(counted - expected);
  // A shortfall or an excess is explained in words, or it cannot be signed off.
  if (Math.abs(variance) > VARIANCE_TOLERANCE && note.length < 3)
    return NextResponse.json(
      {
        error: `The count is ${variance < 0 ? "short" : "over"} by ৳${Math.abs(variance).toLocaleString("en-US")}. Write a short reason before closing.`,
      },
      { status: 400 },
    );

  const data = {
    openingCash: opening,
    openingTyped,
    cashIn: day.cashIn,
    cashOut: day.cashOut,
    expected,
    counted,
    denominations,
    note: note || null,
    closedById: me.id,
    closedByName: me.displayName,
  };
  const at = new Date(`${date}T00:00:00.000Z`);
  const again = !!day.close;
  await prisma.dayClose.upsert({
    where: { date: at },
    update: { ...data, closedAt: new Date() },
    create: { date: at, ...data },
  });

  await audit(me, again ? "RECLOSE_CASH_DAY" : "CLOSE_CASH_DAY", "stock", {
    targetType: "DayClose",
    targetId: date,
    detail: date,
    metadata: { opening, cashIn: day.cashIn, cashOut: day.cashOut, expected, counted, variance },
  });
  return NextResponse.json({ ok: true, expected, counted, variance });
}

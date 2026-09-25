/**
 * v205 — record that a due reminder was sent to one person.
 *
 * The WhatsApp message itself is a link the browser opens; this only writes
 * REMIND_DUE to the audit log, so the list can say "Reminded today by …" and
 * nobody chases the same RSO three times in an afternoon. The person must be
 * someone this viewer may open (`stockScope`), exactly as their ledger is.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { RATE_LIMITS, consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { readJson } from "@/lib/request-body";
import { findHolder, holderKey, mayOpen, parseHolderKey, stockScope } from "@/lib/stock-data";
import { REMINDER_ROLES } from "@/lib/reminder-text";

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || !REMINDER_ROLES.includes(me.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await consumeRateLimit(RATE_LIMITS.mutation, me.id);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl.retryAfterSeconds);
    return NextResponse.json(r.body, r.init);
  }
  const b = await readJson(req);
  const parsed = parseHolderKey(typeof b.holder === "string" ? b.holder : "");
  if (!parsed) return NextResponse.json({ error: "Which person?" }, { status: 400 });
  const scope = await stockScope(me);
  if (!mayOpen(scope, parsed.type, parsed.id)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const holder = await findHolder(parsed.type, parsed.id);
  if (!holder) return NextResponse.json({ error: "That person no longer exists." }, { status: 404 });
  const due = Number(b.due);
  await audit(me, "REMIND_DUE", "stock", {
    targetType: "StockHolder",
    targetId: holderKey(parsed.type, parsed.id),
    targetName: holder.name,
    metadata: { due: Number.isFinite(due) ? Math.round(due) : null },
  });
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}

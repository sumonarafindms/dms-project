import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getCurrentUser } from "../../../../lib/auth";
import { audit } from "../../../../lib/audit";
import { RATE_LIMITS, consumeRateLimit, rateLimitResponse } from "../../../../lib/rate-limit";
import { BOOKS_WRITE_ROLES } from "../../../../lib/lifting-data";
import { paisa } from "../../../../lib/stock";

/**
 * What we bought from the company.
 *
 * `unitCost` is a snapshot, for the reason `StockMovement.unitPrice` is one
 * (v193): the supplier's price changes too, and a purchase recorded in
 * September has to keep September's cost or every margin this app has ever
 * shown moves the next time somebody updates a price list. Nothing here ever
 * reads a "current" cost.
 *
 * Only Accounts writes, and only Accounts, IT and Admin read — the owner's
 * ruling on the buying price: *"Sudhu Accounts, IT ar Admin"*. A manager may
 * read every RSO's due and still have no business knowing what we paid.
 */

function positive(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || !BOOKS_WRITE_ROLES.includes(me.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await consumeRateLimit(RATE_LIMITS.mutation, me.id);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl.retryAfterSeconds);
    return NextResponse.json(r.body, r.init);
  }

  const b = (await req.json()) as Record<string, unknown>;
  const date = String(b.date || "");
  const productId = String(b.productId || "");
  const kind = String(b.kind || "PURCHASE");
  const qty = positive(b.qty);
  const unitCost = positive(b.unitCost);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Which date?" }, { status: 400 });
  if (kind !== "PURCHASE" && kind !== "OPENING")
    return NextResponse.json({ error: "Unknown kind of lifting." }, { status: 400 });
  if (qty === null) return NextResponse.json({ error: "A quantity must be more than zero." }, { status: 400 });
  if (unitCost === null) return NextResponse.json({ error: "A cost must be more than zero." }, { status: 400 });

  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, subType: true } });
  if (!product) return NextResponse.json({ error: "Unknown product." }, { status: 400 });

  /*
   * Appended, not upserted. Two invoices for the same product on the same day
   * are ordinary, and collapsing them would lose the references Accounts
   * reconciles against. A mistake is removed with DELETE.
   */
  const row = await prisma.lifting.create({
    data: {
      date: new Date(`${date}T00:00:00.000Z`),
      kind,
      productId,
      qty: Math.round(qty),
      unitCost: paisa(unitCost),
      invoiceRef: String(b.invoiceRef || "").slice(0, 120) || null,
      note: String(b.note || "").slice(0, 400) || null,
      createdById: me.id,
    },
    select: { id: true },
  });

  await audit(me, "RECORD_LIFTING", "stock", {
    targetType: "Product",
    targetId: productId,
    targetName: product.subType,
    detail: date,
    metadata: { qty: Math.round(qty), unitCost: paisa(unitCost), kind },
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

  const b = (await req.json()) as Record<string, unknown>;
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ error: "Which lifting?" }, { status: 400 });

  const row = await prisma.lifting.findUnique({
    where: { id },
    select: { id: true, qty: true, unitCost: true, date: true, product: { select: { subType: true } } },
  });
  if (!row) return NextResponse.json({ error: "That lifting is already gone." }, { status: 404 });

  await prisma.lifting.delete({ where: { id } });
  await audit(me, "DELETE_LIFTING", "stock", {
    targetType: "Lifting",
    targetId: id,
    targetName: row.product.subType,
    detail: row.date.toISOString().slice(0, 10),
    metadata: { qty: row.qty, unitCost: Number(row.unitCost) },
  });
  return NextResponse.json({ ok: true });
}

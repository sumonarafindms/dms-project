import { NextResponse } from "next/server";
import { MAX_LINE_QTY, MAX_MONEY, isYmd } from "../../../../lib/business-time";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../../lib/prisma";
import { getCurrentUser } from "../../../../lib/auth";
import { audit } from "../../../../lib/audit";
import { RATE_LIMITS, consumeRateLimit, rateLimitResponse } from "../../../../lib/rate-limit";
import { STOCK_WRITE_ROLES, findHolder } from "../../../../lib/stock-data";
import { paisa, priceOn, type HolderType } from "../../../../lib/stock";
import { readJson } from "@/lib/request-body";

/**
 * Where a holder stood on the day this module went live.
 *
 * The owner is not importing history — *"Excel theke na... but ager stock gula
 * import kora hobe.. jamon ajke projonto tar koto stock ace.. koto due ace"* —
 * so each person gets one opening position and the ledger runs forward from
 * there.
 *
 * `openingDue` is the WHOLE outstanding amount, including the value of the
 * stock in the same request. That is the owner's own arithmetic (took
 * ৳100,000, deposited ৳80,000, "due ৳20,000" — with ৳20,000 of goods still in
 * hand), and it is why the OPENING movements written here are deliberately
 * left out of the due in lib/stock.ts: this one number already contains them.
 * The screen prefills it with the stock value for the same reason, so the
 * common case is typed once and cannot disagree with itself.
 */

const isHolderType = (v: string): v is HolderType => v === "RSO" || v === "SUPERVISOR" || v === "BP";

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || !STOCK_WRITE_ROLES.includes(me.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await consumeRateLimit(RATE_LIMITS.mutation, me.id);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl.retryAfterSeconds);
    return NextResponse.json(r.body, r.init);
  }

  const b = (await readJson(req)) as Record<string, unknown>;
  const holderType = String(b.holderType || "");
  const holderId = String(b.holderId || "");
  const asOfDate = String(b.asOfDate || "");
  if (!isHolderType(holderType) || !holderId) return NextResponse.json({ error: "Which person?" }, { status: 400 });
  if (!isYmd(asOfDate)) return NextResponse.json({ error: "As of which date?" }, { status: 400 });

  const holder = await findHolder(holderType, holderId);
  if (!holder) return NextResponse.json({ error: "That person no longer exists." }, { status: 404 });

  const openingDue = Number(b.openingDue);
  if (!Number.isFinite(openingDue)) return NextResponse.json({ error: "How much is outstanding?" }, { status: 400 });
  if (Math.abs(openingDue) > MAX_MONEY)
    return NextResponse.json({ error: "That amount is too large." }, { status: 400 });
  const due = paisa(openingDue);

  // v202: a list item that is not an object (null, a number) is skipped — it crashed the save.
  const lines = (Array.isArray(b.lines) ? b.lines : []).filter(
    (l: unknown) => !!l && typeof l === "object" && !Array.isArray(l),
  ) as { productId?: unknown; qty?: unknown }[];
  const wanted = [...new Set(lines.map((l) => String(l.productId || "")))].filter(Boolean);
  const known = wanted.length
    ? await prisma.product.findMany({
        where: { id: { in: wanted } },
        select: { id: true, subType: true, prices: { select: { price: true, effectiveFrom: true } } },
      })
    : [];
  if (known.length !== wanted.length) return NextResponse.json({ error: "Unknown product." }, { status: 400 });

  /*
   * Opening stock is valued at the price in force on the opening DATE, and
   * that figure is written into each row. It is what the holder was carrying
   * the stock at when the ledger started, and nothing later can move it.
   */
  const onDate = new Map<string, number | null>();
  for (const p of known)
    onDate.set(
      p.id,
      priceOn(
        p.prices.map((x) => ({ price: Number(x.price), effectiveFrom: x.effectiveFrom.toISOString().slice(0, 10) })),
        asOfDate,
      ),
    );
  const nameOf = new Map(known.map((p) => [p.id, p.subType]));

  const at = new Date(`${asOfDate}T00:00:00.000Z`);
  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.stockOpening.upsert({
      where: { holderType_holderId: { holderType, holderId } },
      update: { asOfDate: at, openingDue: due, createdById: me.id },
      create: { holderType, holderId, asOfDate: at, openingDue: due, createdById: me.id },
    }),
    /*
     * Clear first. An opening position is a statement of where somebody
     * stands, not a list of additions, so re-saving it replaces what was
     * there — otherwise correcting a typo would double the opening stock.
     */
    prisma.stockMovement.deleteMany({ where: { holderType, holderId, kind: "OPENING" } }),
  ];

  let counted = 0;
  for (const line of lines) {
    const productId = String(line.productId || "");
    const qty = Number(line.qty) || 0;
    if (!productId || qty <= 0) continue;
    if (!Number.isInteger(qty) || qty > MAX_LINE_QTY)
      return NextResponse.json({ error: "A quantity is a whole number of units." }, { status: 400 });
    const unitPrice = onDate.get(productId) ?? null;
    if (unitPrice === null || !(unitPrice > 0))
      return NextResponse.json(
        {
          error: `${nameOf.get(productId) || "That product"} has no price on ${asOfDate}. Set one on the Products page first.`,
        },
        { status: 400 },
      );
    counted++;
    ops.push(
      prisma.stockMovement.create({
        data: { holderType, holderId, date: at, productId, kind: "OPENING", qty, unitPrice, createdById: me.id },
      }),
    );
  }

  await prisma.$transaction(ops);

  await audit(me, "SET_STOCK_OPENING", "stock", {
    targetType: holderType,
    targetId: holderId,
    targetName: holder.name,
    detail: asOfDate,
    metadata: { openingDue: due, lines: counted },
  });
  return NextResponse.json({ ok: true, openingDue: due, lines: counted });
}

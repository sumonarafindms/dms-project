import { NextResponse } from "next/server";
import { isYmd } from "../../../../lib/business-time";
import { prisma } from "../../../../lib/prisma";
import { getCurrentUser } from "../../../../lib/auth";
import { audit } from "../../../../lib/audit";
import { RATE_LIMITS, consumeRateLimit, rateLimitResponse } from "../../../../lib/rate-limit";
import { STOCK_WRITE_ROLES } from "../../../../lib/stock-data";
import { PRODUCT_CATEGORIES, paisa, type ProductCategory } from "../../../../lib/stock";

/**
 * The product master, and its price list.
 *
 * v192 protected history with a rule: a price was frozen once a movement
 * referred to it, and changing it created a duplicate product. The protection
 * has moved into the data — every movement now carries its own `unitPrice` —
 * so this file no longer has anything to defend. A product is an identity, its
 * prices are a dated list, and both may be corrected freely because **no
 * figure already recorded reads either of them**.
 *
 * That is worth stating plainly because it is the opposite of how it reads:
 * the freedom here is not a relaxation of the v192 rule, it is what becomes
 * safe once the rule stopped being the thing holding the money together.
 *
 * One thing this still will not do: silently reprice a day that has already
 * been entered. Adding a price starting last Tuesday does not touch the
 * movements recorded last Tuesday — they keep what they were handed at. To
 * change those, somebody re-enters those days on purpose, and the screen says
 * so when a back-dated price is added.
 */

const isCategory = (v: string): v is ProductCategory => (PRODUCT_CATEGORIES as readonly string[]).includes(v);

/*
 * v198: which company activations a SIM shows up as. Blank is a real answer —
 * "not linked" — and the Accounts home says so rather than showing 0.
 */
const ACTIVATION_TYPES = ["GA_170", "GA_300", "SIM_SWAP"] as const;
type ActivationType = (typeof ACTIVATION_TYPES)[number];
function parseActivation(raw: unknown): ActivationType | null | "bad" {
  if (raw === undefined || raw === null || raw === "") return null;
  const v = String(raw);
  return (ACTIVATION_TYPES as readonly string[]).includes(v) ? (v as ActivationType) : "bad";
}

function validPrice(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return paisa(n);
}

/*
 * The role check and the rate limit are written out in EVERY handler below
 * rather than shared in a guard() helper. That is not repetition for its own
 * sake: tests/api-authorization reads each handler's own body, so a check
 * hidden behind a call it cannot see is a check nobody knows is missing. v189
 * learned this the same way — by the test catching it.
 */

/** Add a product, with the price it starts at. */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || !STOCK_WRITE_ROLES.includes(me.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await consumeRateLimit(RATE_LIMITS.mutation, me.id);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl.retryAfterSeconds);
    return NextResponse.json(r.body, r.init);
  }

  const b = (await req.json()) as Record<string, unknown>;
  const category = String(b.category || "");
  const subType = String(b.subType || "").trim();
  const unitLabel = String(b.unitLabel || "").trim();
  const price = validPrice(b.price);
  const effectiveFrom = String(b.effectiveFrom || "");

  if (!isCategory(category)) return NextResponse.json({ error: "Which kind of product?" }, { status: 400 });
  if (!subType) return NextResponse.json({ error: "Give the product a name." }, { status: 400 });
  const activationType = category === "SIM" ? parseActivation(b.activationType) : null;
  if (activationType === "bad")
    return NextResponse.json({ error: "A SIM activates as GA 170, GA 300 or a SIM swap." }, { status: 400 });
  if (price === null) return NextResponse.json({ error: "A price must be more than zero." }, { status: 400 });
  if (!isYmd(effectiveFrom)) return NextResponse.json({ error: "When does this price start?" }, { status: 400 });

  const product = await prisma.product.create({
    data: {
      category,
      subType,
      unitLabel: unitLabel || null,
      activationType,
      createdById: me.id,
      prices: {
        create: { price, effectiveFrom: new Date(`${effectiveFrom}T00:00:00.000Z`), createdById: me.id },
      },
    },
    select: { id: true, subType: true },
  });

  await audit(me, "CREATE_PRODUCT", "stock", {
    targetType: "Product",
    targetId: product.id,
    targetName: product.subType,
    metadata: { category, price, from: effectiveFrom },
  });
  return NextResponse.json({ ok: true, id: product.id });
}

/** Rename, retire, or add a dated price. */
export async function PATCH(req: Request) {
  const me = await getCurrentUser();
  if (!me || !STOCK_WRITE_ROLES.includes(me.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await consumeRateLimit(RATE_LIMITS.mutation, me.id);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl.retryAfterSeconds);
    return NextResponse.json(r.body, r.init);
  }

  const b = (await req.json()) as Record<string, unknown>;
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ error: "Which product?" }, { status: 400 });

  const current = await prisma.product.findUnique({
    where: { id },
    select: { id: true, subType: true, unitLabel: true, status: true, category: true },
  });
  if (!current) return NextResponse.json({ error: "That product no longer exists." }, { status: 404 });

  /* Which activations a SIM shows up as. A label for a report; no money reads it. */
  if (b.activationType !== undefined) {
    const activationType = parseActivation(b.activationType);
    if (activationType === "bad" || (current.category !== "SIM" && activationType !== null))
      return NextResponse.json({ error: "Only a SIM activates, as GA 170, GA 300 or a SIM swap." }, { status: 400 });
    await prisma.product.update({ where: { id }, data: { activationType } });
    await audit(me, "SET_PRODUCT_ACTIVATION", "stock", {
      targetType: "Product",
      targetId: id,
      targetName: current.subType,
      metadata: { activationType },
    });
    return NextResponse.json({ ok: true, id });
  }

  /* Retiring changes nothing historical — the movements keep their own prices. */
  if (b.status !== undefined) {
    const status = String(b.status);
    if (status !== "ACTIVE" && status !== "INACTIVE")
      return NextResponse.json({ error: "Unknown status." }, { status: 400 });
    await prisma.product.update({ where: { id }, data: { status } });
    await audit(me, "SET_PRODUCT_STATUS", "stock", {
      targetType: "Product",
      targetId: id,
      targetName: current.subType,
      metadata: { status },
    });
    return NextResponse.json({ ok: true, status });
  }

  /* A new price, starting on a date. */
  if (b.price !== undefined) {
    const price = validPrice(b.price);
    if (price === null) return NextResponse.json({ error: "A price must be more than zero." }, { status: 400 });
    const effectiveFrom = String(b.effectiveFrom || "");
    if (!isYmd(effectiveFrom)) return NextResponse.json({ error: "When does the new price start?" }, { status: 400 });
    const from = new Date(`${effectiveFrom}T00:00:00.000Z`);

    /*
     * Two prices cannot start on the same day — one of them would be a coin
     * toss. Saving the same date again REPLACES it, which is how a price typed
     * wrong a minute ago gets corrected.
     */
    const row = await prisma.productPrice.upsert({
      where: { productId_effectiveFrom: { productId: id, effectiveFrom: from } },
      update: { price, createdById: me.id },
      create: { productId: id, price, effectiveFrom: from, createdById: me.id },
      select: { id: true },
    });

    /* How many already-recorded days this price does NOT touch, so we can say so. */
    const affectedFrom = await prisma.stockMovement.count({ where: { productId: id, date: { gte: from } } });

    await audit(me, "SET_PRODUCT_PRICE", "stock", {
      targetType: "Product",
      targetId: id,
      targetName: current.subType,
      detail: `${price} from ${effectiveFrom}`,
      metadata: { priceId: row.id, entriesOnOrAfter: affectedFrom },
    });
    return NextResponse.json({ ok: true, id, entriesOnOrAfter: affectedFrom });
  }

  /* A rename. The name is a label on the same thing; no figure reads it. */
  const subType = b.subType === undefined ? current.subType : String(b.subType).trim();
  const unitLabel = b.unitLabel === undefined ? current.unitLabel : String(b.unitLabel).trim() || null;
  if (!subType) return NextResponse.json({ error: "Give the product a name." }, { status: 400 });
  await prisma.product.update({ where: { id }, data: { subType, unitLabel } });
  await audit(me, "EDIT_PRODUCT", "stock", { targetType: "Product", targetId: id, targetName: subType });
  return NextResponse.json({ ok: true, id });
}

/** Remove a price row that was added by mistake. */
export async function DELETE(req: Request) {
  const me = await getCurrentUser();
  if (!me || !STOCK_WRITE_ROLES.includes(me.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await consumeRateLimit(RATE_LIMITS.mutation, me.id);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl.retryAfterSeconds);
    return NextResponse.json(r.body, r.init);
  }

  const b = (await req.json()) as Record<string, unknown>;
  const productId = String(b.productId || "");
  const effectiveFrom = String(b.effectiveFrom || "");
  if (!productId || !isYmd(effectiveFrom)) return NextResponse.json({ error: "Which price?" }, { status: 400 });

  const from = new Date(`${effectiveFrom}T00:00:00.000Z`);
  const count = await prisma.productPrice.count({ where: { productId } });
  /*
   * A product with no price at all cannot be entered anywhere, so the last one
   * does not go. Retire the product instead — that is the action that means
   * "stop offering this", and it leaves every recorded figure untouched.
   */
  if (count <= 1)
    return NextResponse.json(
      { error: "This is the only price. Retire the product instead of removing it." },
      { status: 400 },
    );

  const deleted = await prisma.productPrice.deleteMany({ where: { productId, effectiveFrom: from } });
  if (!deleted.count) return NextResponse.json({ error: "That price is already gone." }, { status: 404 });

  await audit(me, "DELETE_PRODUCT_PRICE", "stock", {
    targetType: "Product",
    targetId: productId,
    detail: effectiveFrom,
  });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { MAX_LINE_QTY, isYmd } from "../../../../lib/business-time";
import { prisma } from "../../../../lib/prisma";
import { getCurrentUser } from "../../../../lib/auth";
import { audit } from "../../../../lib/audit";
import { RATE_LIMITS, consumeRateLimit, rateLimitResponse } from "../../../../lib/rate-limit";
import { STOCK_WRITE_ROLES, findHolder } from "../../../../lib/stock-data";
import { paisa, priceOn, type HolderType, type MoveKind } from "../../../../lib/stock";

/**
 * One holder's whole day, saved in one request.
 *
 * The four tabs on the entry screen — Give, Sell, Return, Collect — are one
 * form and one write. Saving them separately would let a save half-apply, and
 * a half-applied day is a wrong due: the goods recorded and the money not, or
 * the other way round, with nothing on screen to say so.
 *
 * A quantity of zero DELETES its row rather than storing a zero. "Nothing was
 * given" and "zero was given" are the same fact, and keeping both shapes in
 * the table would mean every reader has to know it.
 *
 * Any past date may be corrected — the owner's ruling — so this is an upsert
 * on (holder, date, product, kind) and never an append. The due is derived,
 * so a correction to a day three weeks ago simply makes every figure after it
 * right; there is no stored balance to rebuild.
 *
 * ## Where each line's price comes from
 *
 * Written into the row, here, once. Never looked up again.
 *
 *   GIVEN and SOLD  a NEW line: the price in force ON THE DATE BEING ENTERED;
 *                   a line already saved keeps its own (v199). Not today's
 *                   — correcting a day from before a price change must use the
 *                   price that applied then, which is the whole point.
 *   RETURNED        what the CALLER sends, because a return clears stock at the
 *                   price it was lifted at and only the client knows which lot
 *                   the operator agreed to. The screen shows that figure in an
 *                   editable box; this route sanity-checks it and records it.
 *
 * A product with no price on that date is refused rather than recorded at
 * zero. A product added in October has no September price, and a silent zero
 * is a free handout nobody will ever notice.
 */

const KINDS: MoveKind[] = ["GIVEN", "SOLD", "RETURNED"];
const isHolderType = (v: string): v is HolderType => v === "RSO" || v === "SUPERVISOR" || v === "BP";

/** A quantity a person typed. Rejects the shapes that silently become zero. */
function quantity(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return 0;
  const n = Number(raw);
  /*
   * v199: whole numbers only. 2.5 used to be rounded to 3 here while the
   * screen's "Due after saving" had valued 2.5 — two different figures for
   * one entry, and the saved one nobody had seen.
   */
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n) || n > MAX_LINE_QTY) return null;
  return n;
}

function money(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return paisa(n);
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || !STOCK_WRITE_ROLES.includes(me.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await consumeRateLimit(RATE_LIMITS.mutation, me.id);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl.retryAfterSeconds);
    return NextResponse.json(r.body, r.init);
  }

  const b = (await req.json()) as Record<string, unknown>;
  const holderType = String(b.holderType || "");
  const holderId = String(b.holderId || "");
  const date = String(b.date || "");
  if (!isHolderType(holderType) || !holderId) return NextResponse.json({ error: "Which person?" }, { status: 400 });
  if (!isYmd(date)) return NextResponse.json({ error: "Which date?" }, { status: 400 });

  const holder = await findHolder(holderType, holderId);
  if (!holder) return NextResponse.json({ error: "That person no longer exists." }, { status: 404 });

  const at = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(at.getTime())) return NextResponse.json({ error: "Which date?" }, { status: 400 });

  /*
   * Every productId must be a real product. Without this an unknown id would
   * fail on the foreign key mid-transaction and lose the rest of the day with
   * a message nobody can act on.
   */
  const lines = (Array.isArray(b.lines) ? b.lines : []) as {
    productId?: unknown;
    kind?: unknown;
    qty?: unknown;
    unitPrice?: unknown;
  }[];
  const wanted = [...new Set(lines.map((l) => String(l.productId || "")))].filter(Boolean);
  const known = wanted.length
    ? await prisma.product.findMany({
        where: { id: { in: wanted } },
        select: { id: true, subType: true, prices: { select: { price: true, effectiveFrom: true } } },
      })
    : [];
  if (known.length !== wanted.length) return NextResponse.json({ error: "Unknown product." }, { status: 400 });

  /** The price each product carried on the day being entered. */
  const onDate = new Map<string, number | null>();
  for (const p of known)
    onDate.set(
      p.id,
      priceOn(
        p.prices.map((x) => ({ price: Number(x.price), effectiveFrom: x.effectiveFrom.toISOString().slice(0, 10) })),
        date,
      ),
    );
  const nameOf = new Map(known.map((p) => [p.id, p.subType]));
  /** The highest price each product has ever had — the ceiling a return price is checked against. */
  const highest = new Map(known.map((p) => [p.id, Math.max(0, ...p.prices.map((x) => Number(x.price)))]));

  /*
   * v199: what is ALREADY saved for this day keeps its price.
   *
   * The form sends every line on every save, and this route used to re-price
   * each one at the price in force on the date. So re-opening 10 Sep just to
   * add a bank reference, after a price had been back-dated to 1 Sep, quietly
   * raised the due by the difference on every line — the very thing the
   * Products page promises cannot happen. A line that exists keeps its
   * snapshot; only a NEW line takes the day's price. To re-price a day on
   * purpose, clear the line, save, and enter it again.
   */
  const saved = new Map(
    (
      await prisma.stockMovement.findMany({
        where: { holderType, holderId, date: at, kind: { in: ["GIVEN", "SOLD"] } },
        select: { productId: true, kind: true, unitPrice: true },
      })
    ).map((m) => [`${m.productId}|${m.kind}`, Number(m.unitPrice)]),
  );

  const writes: ReturnType<typeof prisma.stockMovement.upsert>[] = [];
  const deletes: ReturnType<typeof prisma.stockMovement.deleteMany>[] = [];
  let touched = 0;

  for (const line of lines) {
    const productId = String(line.productId || "");
    const kind = String(line.kind || "") as MoveKind;
    if (!productId || !KINDS.includes(kind)) return NextResponse.json({ error: "Unknown line." }, { status: 400 });
    const qty = quantity(line.qty);
    if (qty === null)
      return NextResponse.json({ error: "A quantity is a whole number, zero or more." }, { status: 400 });

    const where = {
      holderType_holderId_date_productId_kind: { holderType, holderId, date: at, productId, kind },
    } as const;

    if (qty === 0) {
      deletes.push(prisma.stockMovement.deleteMany({ where: { holderType, holderId, date: at, productId, kind } }));
      continue;
    }

    /*
     * The snapshot. A return carries its own price because it clears stock at
     * what that stock was lifted at; everything else is priced by the day.
     */
    let unitPrice: number | null;
    if (kind === "RETURNED") {
      const sent = money(line.unitPrice);
      if (sent === null) return NextResponse.json({ error: "A return price cannot be negative." }, { status: 400 });
      unitPrice = line.unitPrice === undefined || line.unitPrice === "" ? (onDate.get(productId) ?? null) : sent;
      /*
       * v199: the sanity check the comment above always promised. A return
       * credited at more than one and a half times anything the product has
       * EVER cost is a typo — ৳2,000 for ৳200 — and would wipe out ten times
       * the stock's value from the due.
       */
      const ceiling = highest.get(productId) || 0;
      if (unitPrice !== null && ceiling > 0 && unitPrice > ceiling * 1.5)
        return NextResponse.json(
          {
            error: `The return price for ${nameOf.get(productId) || "that product"} (৳${unitPrice}) is far above anything it has ever cost (৳${ceiling}). Check the figure.`,
          },
          { status: 400 },
        );
    } else {
      unitPrice = saved.get(`${productId}|${kind}`) ?? onDate.get(productId) ?? null;
    }
    if (unitPrice === null || !(unitPrice > 0))
      return NextResponse.json(
        {
          error: `${nameOf.get(productId) || "That product"} has no price on ${date}. Set one on the Products page first.`,
        },
        { status: 400 },
      );

    touched++;
    writes.push(
      prisma.stockMovement.upsert({
        where,
        update: { qty, unitPrice, createdById: me.id },
        create: { holderType, holderId, date: at, productId, kind, qty, unitPrice, createdById: me.id },
      }),
    );
  }

  const cash = money(b.cash);
  const bank = money(b.bank);
  if (cash === null || bank === null)
    return NextResponse.json({ error: "A deposit cannot be negative." }, { status: 400 });
  const bankRef = b.bankRef === undefined ? "" : String(b.bankRef).slice(0, 120);
  const notes = b.notes === undefined ? "" : String(b.notes).slice(0, 400);

  const depositWhere = { holderType_holderId_date: { holderType, holderId, date: at } } as const;
  const depositOps =
    cash === 0 && bank === 0 && !bankRef && !notes
      ? [prisma.cashDeposit.deleteMany({ where: { holderType, holderId, date: at } })]
      : [
          prisma.cashDeposit.upsert({
            where: depositWhere,
            update: { cash, bank, bankRef: bankRef || null, notes: notes || null, createdById: me.id },
            create: {
              holderType,
              holderId,
              date: at,
              cash,
              bank,
              bankRef: bankRef || null,
              notes: notes || null,
              createdById: me.id,
            },
          }),
        ];

  await prisma.$transaction([...deletes, ...writes, ...depositOps]);

  await audit(me, "SAVE_STOCK_DAY", "stock", {
    targetType: holderType,
    targetId: holderId,
    targetName: holder.name,
    detail: date,
    metadata: { lines: touched, cash, bank },
  });
  return NextResponse.json({ ok: true, lines: touched, cash, bank });
}

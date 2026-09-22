/**
 * Daily entry — the screen Accounts lives in.
 *
 * Date and person are in the URL so the page can be linked to from a ledger,
 * reloaded, and shared between two people looking at the same day. The form
 * itself is a client island (StockDayEntry) because the running due under it
 * has to move as the numbers are typed.
 *
 * Any past date may be opened and corrected — the owner's ruling. Nothing
 * needs rebuilding when one is: every figure in this module is derived, so a
 * correction to a day three weeks ago simply makes everything after it right.
 */

import { requireUser } from "../../../lib/auth";
import { dhakaTodayYmd } from "../../../lib/business-time";
import {
  allProducts,
  dayEntry,
  holderKey,
  listHolders,
  parseHolderKey,
  pricedProducts,
  stockScope,
} from "../../../lib/stock-data";
import { prisma } from "../../../lib/prisma";
import { HOLDER_TYPE_LABEL, dueOf, movementValue, paisa, stockLines } from "../../../lib/stock";
import { EmptyState, LinkBtn, PageHeader } from "../../components/Kit";
import { Icon } from "../../components/icons";
import { StockDayEntry } from "../../components/StockDayEntry";

export const dynamic = "force-dynamic";

export default async function DailyEntry({
  searchParams,
}: {
  searchParams: Promise<{ holder?: string; date?: string }>;
}) {
  /*
   * The literal, not STOCK_WRITE_ROLES, because tests/route-guards reads this
   * call as source text and a map entry that cannot be read is not a guard.
   * tests/stock.smoke.test.ts asserts the two say the same thing.
   */
  const u = await requireUser(["ACCOUNTS"]);

  const scope = await stockScope(u);
  const sp = await searchParams;
  const holders = await listHolders(scope);

  if (!holders.length)
    return (
      <main className="page">
        <PageHeader title="Daily entry" subtitle="Give, sell, return and collect — one person, one day." />
        <EmptyState
          title="Nobody to enter for"
          hint="No active RSO, supervisor or BP code was found."
          icon={<Icon name="users" />}
        />
      </main>
    );

  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date || "") ? sp.date! : dhakaTodayYmd();
  /*
   * Priced AS AT THE DATE BEING ENTERED, not today. Correcting a day from
   * before a price change must use the price that applied then — v192 used
   * today's, which is the defect this whole version is about.
   */
  const products = await pricedProducts(date);
  const parsed = parseHolderKey(sp.holder || "");
  const chosen = parsed && holders.find((h) => h.type === parsed.type && h.id === parsed.id);
  const holder = chosen || holders[0];
  const key = holderKey(holder.type, holder.id);

  const entry = await dayEntry(holder.type, holder.id, date);

  /*
   * The due with THIS DAY taken out of it.
   *
   * Computed here rather than in the island so that re-opening a day already
   * entered shows the same running total as leaving it alone. Subtracting the
   * saved day in the browser would work too, until somebody changed one of the
   * two subtractions and not the other.
   */
  const at = new Date(`${date}T00:00:00.000Z`);
  const [movements, deposits, opening, everyProduct] = await Promise.all([
    prisma.stockMovement.findMany({
      where: { holderType: holder.type, holderId: holder.id, date: { not: at } },
      select: { kind: true, productId: true, qty: true, unitPrice: true },
    }),
    prisma.cashDeposit.aggregate({
      where: { holderType: holder.type, holderId: holder.id, date: { not: at } },
      _sum: { cash: true, bank: true },
    }),
    prisma.stockOpening.findUnique({
      where: { holderType_holderId: { holderType: holder.type, holderId: holder.id } },
      select: { openingDue: true },
    }),
    allProducts(),
  ]);

  const linesBefore = stockLines(
    movements.map((m: (typeof movements)[number]) => ({ ...m, unitPrice: Number(m.unitPrice) })),
    everyProduct,
  );
  const before = movementValue(linesBefore);

  /*
   * What this holder is carrying each product at, ignoring today. That is the
   * price a return credits at — the owner's "je dame nice sei dame" — and the
   * entry screen shows it in an editable box rather than applying it silently.
   */
  const carryPrice: Record<string, number> = {};
  for (const l of linesBefore) if (l.inHand > 0 && l.carryPrice > 0) carryPrice[l.product.id] = l.carryPrice;
  const dueBefore = dueOf({
    openingDue: Number(opening?.openingDue || 0),
    givenValue: before.givenValue,
    returnedValue: before.returnedValue,
    cash: Number(deposits._sum.cash || 0),
    bank: Number(deposits._sum.bank || 0),
  }).due;

  return (
    <main className="page">
      <PageHeader
        title="Daily entry"
        subtitle="Give, sell, return and collect — one person, one day, one save."
        action={
          <LinkBtn href={`/stock/${holder.type}/${holder.id}`} variant="ghost">
            <Icon name="file" /> Ledger
          </LinkBtn>
        }
      />
      <StockDayEntry
        holders={holders.map((h) => ({
          id: holderKey(h.type, h.id),
          label: h.name,
          meta: [HOLDER_TYPE_LABEL[h.type], h.code, h.supervisorName].filter(Boolean).join(" · "),
        }))}
        holderKey={key}
        date={date}
        products={products}
        initial={entry}
        dueBefore={paisa(dueBefore)}
        carryPrice={carryPrice}
        basePath="/stock/daily"
      />
    </main>
  );
}

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
import { AppLink } from "../../components/AppLink";
import { StockDayEntry } from "../../components/StockDayEntry";
import { godown } from "../../../lib/lifting-data";

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
  const parsed = parseHolderKey(sp.holder || "");
  const chosen = parsed && holders.find((h) => h.type === parsed.type && h.id === parsed.id);
  /*
   * v199: a person asked for by the link and not found is said so. Opening the
   * first person in the list instead meant money meant for one person could
   * be saved against another without anybody noticing the name had changed.
   */
  if (parsed && !chosen)
    return (
      <main className="page">
        <PageHeader title="Daily entry" subtitle="Give, sell, return and collect — one person, one day." />
        <EmptyState
          title="That person is not in your list"
          hint={
            <>
              They may have been removed. <AppLink href="/stock/daily">Choose someone from the list →</AppLink>
            </>
          }
          icon={<Icon name="users" />}
        />
      </main>
    );
  const holder = chosen || holders[0];
  const key = holderKey(holder.type, holder.id);

  const entry = await dayEntry(holder.type, holder.id, date);
  // Retired products this day already has lines for stay on the form (v199).
  const products = await pricedProducts(date, [
    ...new Set([...Object.keys(entry.given), ...Object.keys(entry.sold), ...Object.keys(entry.returned)]),
  ]);

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
      select: { kind: true, productId: true, qty: true, unitPrice: true, date: true },
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

  const rows = movements.map((m: (typeof movements)[number]) => ({
    kind: m.kind,
    productId: m.productId,
    qty: m.qty,
    unitPrice: Number(m.unitPrice),
    date: m.date.toISOString().slice(0, 10),
  }));
  // Every OTHER day, before and after — the running due is all-time.
  const before = movementValue(stockLines(rows, everyProduct));

  /*
   * What this holder is carrying each product at on the morning of this day.
   * That is the price a return credits at — the owner's "je dame nice sei
   * dame" — and the entry screen shows it in an editable box rather than
   * applying it silently.
   *
   * v199: only days BEFORE this one. v193–v198 included days after it too, so
   * correcting a return last week was offered a blend of stock given out
   * since — stock the person did not yet hold on the day being corrected.
   */
  const carryPrice: Record<string, number> = {};
  for (const l of stockLines(
    rows.filter((r) => r.date < date),
    everyProduct,
  ))
    if (l.inHand > 0 && l.carryPrice > 0) carryPrice[l.product.id] = l.carryPrice;

  /*
   * v197: what the godown holds BEFORE this person's entry for this day.
   *
   * The all-time godown already counts whatever was saved for this day, so it
   * is added back here — otherwise re-opening a saved day would show the stock
   * as gone twice. The Give tab then subtracts what is typed, live.
   *
   * Only for products that have ever been lifted. A product nobody has
   * recorded buying has no godown figure to check against, and showing it as
   * "0 left" would warn on every line until Lifting is in use — the
   * not-set-is-not-zero rule again.
   */
  const godownBefore: Record<string, number> = {};
  for (const l of await godown())
    if (l.liftedQty > 0)
      godownBefore[l.product.id] = l.inGodown + (entry.given[l.product.id] || 0) - (entry.returned[l.product.id] || 0);
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
        subtitle="Give RSOs, BPs and supervisors their products — then record sales, returns and the cash they deposit."
        action={
          <LinkBtn href={`/stock/${holder.type}/${holder.id}`} variant="ghost">
            <Icon name="file" /> Ledger
          </LinkBtn>
        }
      />
      {/*
       * v197: keyed by person AND day. Without the key, changing either one
       * reloaded the data but React kept the form's state — so RSO 48's 37
       * SIMs were still in the boxes after switching to RSO 47, and Save would
       * have charged RSO 47 for stock they never received. Measured in the
       * browser before the fix (.scratch/stalestate.ts). A different key is a
       * fresh form, built from THIS person's saved day.
       */}
      <StockDayEntry
        key={`${key}|${date}`}
        holders={holders.map((h) => ({
          id: holderKey(h.type, h.id),
          label: h.name,
          meta: [HOLDER_TYPE_LABEL[h.type], h.code, h.supervisorName, h.inactive ? "no longer active" : null]
            .filter(Boolean)
            .join(" · "),
        }))}
        holderKey={key}
        date={date}
        products={products}
        initial={entry}
        dueBefore={paisa(dueBefore)}
        carryPrice={carryPrice}
        godown={godownBefore}
        basePath="/stock/daily"
      />
    </main>
  );
}

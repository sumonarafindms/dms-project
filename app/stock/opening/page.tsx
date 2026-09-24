/**
 * Opening positions — how the ledger starts without importing history.
 */

import { requireUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { dhakaTodayYmd, isYmd } from "../../../lib/business-time";
import {
  holderKey,
  holderOption,
  listHolders,
  parseHolderKey,
  pricedProducts,
  stockScope,
} from "../../../lib/stock-data";
import { EmptyState, PageHeader } from "../../components/Kit";
import { Icon } from "../../components/icons";
import { AppLink } from "../../components/AppLink";
import { StockOpeningForm } from "../../components/StockOpeningForm";

export const dynamic = "force-dynamic";

export default async function Opening({ searchParams }: { searchParams: Promise<{ holder?: string; as?: string }> }) {
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
        <PageHeader title="Opening positions" subtitle="Where each person stood when the ledger started." />
        <EmptyState
          title="Nobody to open"
          hint="No active RSO, supervisor or BP code was found."
          icon={<Icon name="users" />}
        />
      </main>
    );

  /*
   * Opening stock is valued at the price in force on the OPENING DATE, so the
   * date drives the form. A ledger that starts in August must not be opened at
   * October's prices.
   */
  const asked = isYmd(sp.as) ? sp.as : null;
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
        <PageHeader title="Opening positions" subtitle="Where each person stood when the ledger started." />
        <EmptyState
          title="That person is not in your list"
          hint={
            <>
              They may have been removed. <AppLink href="/stock/opening">Choose someone from the list →</AppLink>
            </>
          }
          icon={<Icon name="users" />}
        />
      </main>
    );
  const holder = chosen || holders[0];

  const [existing, openingLines] = await Promise.all([
    prisma.stockOpening.findUnique({
      where: { holderType_holderId: { holderType: holder.type, holderId: holder.id } },
      select: { asOfDate: true, openingDue: true },
    }),
    prisma.stockMovement.findMany({
      where: { holderType: holder.type, holderId: holder.id, kind: "OPENING" },
      select: { productId: true, qty: true },
    }),
  ]);
  /*
   * v200: the date the form will SAVE at is the date the products are priced
   * at. Without `?as=` the form opens on the saved opening's date, but the
   * prices were taken at today's — so 10 SIMs opened on 1 Aug at ৳100 showed
   * as ৳1,200 on screen after a September price rise, and saved at ৳1,000.
   */
  const asOf = asked ?? (existing?.asOfDate ? existing.asOfDate.toISOString().slice(0, 10) : dhakaTodayYmd());
  // Retired products this person opened with stay on the form, so saving does not delete them (v199).
  const products = await pricedProducts(asOf, [...new Set(openingLines.map((l) => l.productId))]);

  return (
    <main className="page">
      <PageHeader
        title="Opening positions"
        subtitle="Set once per person: the stock they already hold and the amount they already owe."
      />
      {/* Keyed for the same reason as the Daily Entry form: a different
          person or date must never inherit the previous one's typed stock. */}
      <StockOpeningForm
        key={`${holderKey(holder.type, holder.id)}|${asOf}`}
        holders={holders.map(holderOption)}
        holderKey={holderKey(holder.type, holder.id)}
        products={products}
        today={dhakaTodayYmd()}
        initial={{
          asOfDate: asOf,
          openingDue: Number(existing?.openingDue || 0),
          lines: Object.fromEntries(openingLines.map((l) => [l.productId, l.qty])),
          exists: Boolean(existing),
        }}
        basePath="/stock/opening"
      />
    </main>
  );
}

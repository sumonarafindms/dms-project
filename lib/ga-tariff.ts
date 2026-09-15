import { prisma } from "./prisma";
import { GA_170_MATCH_CODES, LEGACY_GA_170_PRICE } from "./business-rules";

/**
 * What the 170-tier SIM costs right now, read from the data.
 *
 * The 170 / 300 breakdown is the only GA figure that cannot be worked out from
 * the product code alone: a code nobody has seen before (`MMSTSC`, `MMST1911`)
 * is certainly a normal SIM, but only its price says which tier it belongs to.
 *
 * Rather than hold a number that has to be edited whenever the carrier moves a
 * tariff — the thing the owner asked never to have to do again — this asks the
 * one code we are sure about what it is being sold for:
 *
 *     "amar protibar change hobe price ar protibar ki amar update korte hobe
 *      naki .. aita ke dynamic korar kono way bar koro"
 *
 * Cached for a minute, because it changes when a file is uploaded and never in
 * between, and four screens ask for it.
 */

let cache: { at: number; prices: Set<number> } | null = null;
const TTL_MS = 60_000;

/** Forget the cached tariff. Called by the importer, which has just changed it. */
export function forgetGaTariff() {
  cache = null;
}

export async function currentGa170Tariff(): Promise<Set<number>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.prices;
  const rows = await prisma.gaActivation
    .groupBy({ by: ["sellingPrice"], where: { productCode: { in: GA_170_MATCH_CODES } } })
    .catch(() => [] as { sellingPrice: unknown }[]);
  const prices = new Set<number>();
  for (const row of rows) {
    const n = Number(row.sellingPrice);
    if (Number.isFinite(n)) prices.add(n);
  }
  // Nothing imported yet, so nothing to learn from. The historical tariff is
  // the only answer available, and it is right until the first upload.
  if (!prices.size) prices.add(LEGACY_GA_170_PRICE);
  cache = { at: Date.now(), prices };
  return prices;
}

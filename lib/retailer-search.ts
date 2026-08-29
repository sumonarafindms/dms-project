import type { RetailerOpportunity } from "./retailer-opportunities";
import { matchesTokens } from "./text-search";

/**
 * The fields a person actually types when looking for a retailer.
 *
 * Its own module, free of Prisma and of "use client", so both a server page and
 * the browser-side list can use the same definition — a client module's exports
 * are references, not functions, once a Server Component imports them.
 *
 * One caller used `JSON.stringify(row).includes(q)`, which also matched
 * internal cuids and the literal words "true" and "false".
 */
export function matchesRetailerQuery(r: RetailerOpportunity, lowercaseQuery: string) {
  return matchesTokens(
    `${r.retailerCode} ${r.retailerName} ${r.employeeName} ${r.supervisor} ${r.route} ${r.category}`.toLowerCase(),
    lowercaseQuery,
  );
}

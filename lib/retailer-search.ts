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
  /*
   * The two wallet numbers joined this list in v186.
   *
   * `employeeMsisdn` is described in its own type as "the field people
   * actually dial", and `retailerWallet` is the outlet's iTop-Up number — both
   * printed on these rows, neither searchable, so typing the number in front
   * of you found nothing. They are also the only UNIQUE way to name a person
   * here: the Accounts directory links an RSO to their outlets by wallet
   * rather than by name, because two RSOs can share a name and a name-keyed
   * link would quietly show both.
   */
  return matchesTokens(
    `${r.retailerCode} ${r.retailerName} ${r.retailerWallet} ${r.employeeName} ${r.employeeMsisdn} ${r.supervisor} ${r.route} ${r.category}`.toLowerCase(),
    lowercaseQuery,
  );
}

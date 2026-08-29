/**
 * Who owns what, resolved in one place.
 *
 * The schema carries two different links from a Retailer to an Employee, and
 * before this file different pages picked whichever one was closest to hand.
 * They answer different questions and are not interchangeable:
 *
 *   Retailer.employeeId
 *     Which RSO works this outlet. Set in bulk by the retailer master import,
 *     which matches I_TOP_UP_SR_NUMBER against the employee's RSO MSISDN
 *     (lib/master-import.ts). Every active retailer has one.
 *
 *   BpAssignment
 *     Which retailers act as Business Partners, which RSO each BP reports to,
 *     and that BP's GA target. Created one at a time by an admin from
 *     /admin/bp-management, date-ranged so history is preserved. Only a small
 *     subset of retailers ever has one.
 *
 * So: BpAssignment is authoritative for BP identity and BP ownership;
 * Retailer.employeeId is authoritative for retailer ownership. Using
 * BpAssignment for plain retailer scoping would empty every RSO, supervisor
 * and manager page, because most retailers are not BPs.
 *
 * Scope arguments below are REQUIRED, not optional. lib/retailer-opportunities
 * and lib/performance both treat an omitted employeeIds as "company-wide",
 * which is one forgotten argument away from leaking another team's data. The
 * helpers here have no such mode.
 */

import { Prisma } from "@prisma/client";

/** Retailers worked by these RSOs. Pass [] to mean "none", never "all". */
export function retailersOwnedBy(employeeIds: string[]): Prisma.RetailerWhereInput {
  return { employeeId: { in: employeeIds }, active: true };
}

/**
 * The BP assignments these RSOs currently hold.
 *
 * `active` is what makes an assignment current; endDate is kept for history.
 * A BP moved to another RSO leaves the old row inactive, so filtering on
 * active alone is what "who owns this BP today" means.
 */
export function bpAssignmentsOwnedBy(employeeIds: string[]): Prisma.BpAssignmentWhereInput {
  return { employeeId: { in: employeeIds }, active: true };
}

/** The current BP assignment for one retailer, or null when it is not a BP. */
export function currentBpAssignmentWhere(retailerId: string): Prisma.BpAssignmentWhereInput {
  return { retailerId, active: true };
}

/**
 * Retailer ids that are currently BPs, as a Set for cheap membership tests
 * when decorating a retailer list with "this one is a BP" information.
 */
export function bpRetailerIdSet(assignments: { retailerId: string }[]) {
  return new Set(assignments.map((a) => a.retailerId));
}

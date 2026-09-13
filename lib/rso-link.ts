/**
 * One rule for deciding which RSO a retailer belongs to.
 *
 * ## What it is for
 *
 * A retailer was linked to its RSO by one field and one field only: the RSO's
 * mobile number in `I_TOP_UP_SR_NUMBER`. That works until the carrier leaves it
 * out, and in the owner's real exports it does:
 *
 *     R565817  KAMAL TELECOM   RSOCODE RS049839  ITOPUPSRNUMBER 01935599620  SRNUMBER (blank)
 *     R342717  Ma Electronics  RSOCODE RS045160  ITOPUPSRNUMBER 01967046995  SRNUMBER (blank)
 *
 * **Nine retailers across the three daily files carry a blank `SRNUMBER`.** The
 * file says plainly which RSO they belong to — twice over, by code and by the
 * iTop-up SR number — and the app assigned them to nobody, so their sales and
 * balances appeared under no RSO anywhere in the app. Not an error: silence.
 *
 * `Retailer.rsoCode` and `Employee.employeeCode` both existed the whole time.
 * The code was stored on both sides and never used to connect them.
 *
 * ## The order, and why it is that order
 *
 * 1. **The iTop-up SR number** — what the Retailer Master has always matched on,
 *    kept first so nothing that works today starts resolving differently.
 * 2. **The row's own SR number** — the same kind of value from the transaction
 *    line, used when the first is absent.
 * 3. **The RSO code** — the last resort, because a code is a label people retype
 *    and a number is issued by the carrier. It is still far better than nothing,
 *    and it is what rescues the nine rows above.
 *
 * Every step is a *fallback*: a retailer that matches by number is never
 * re-decided by its code, so adding this cannot move an existing assignment.
 */

import { phoneKey } from "./phone";

export type LinkableEmployee = { id: string; rsoMsisdn: string; employeeCode?: string | null; name?: string };

export type EmployeeIndex<E extends LinkableEmployee> = {
  byPhone: Map<string, E>;
  byCode: Map<string, E>;
  size: number;
};

/** How the link was made, so callers can explain themselves. */
export type LinkBasis = "phone" | "code" | null;

export function buildEmployeeIndex<E extends LinkableEmployee>(employees: E[]): EmployeeIndex<E> {
  const byPhone = new Map<string, E>();
  const byCode = new Map<string, E>();
  for (const e of employees) {
    /*
     * Keyed by `phoneKey`, not by the raw column.
     *
     * `phoneKey` strips a leading 88 and leading zeros, so its output does not
     * equal what the column stores. Anything that tries to do this matching in
     * a database `where` clause silently matches nothing — which is exactly the
     * bug that shipped into the first draft of lib/retailer-autocreate.ts and
     * created every new outlet unassigned while reporting success.
     */
    const phone = phoneKey(e.rsoMsisdn);
    if (phone && !byPhone.has(phone)) byPhone.set(phone, e);
    const code = normalizeRsoCode(e.employeeCode);
    if (code && !byCode.has(code)) byCode.set(code, e);
  }
  return { byPhone, byCode, size: employees.length };
}

export function normalizeRsoCode(value: string | null | undefined) {
  return (value || "").trim().toUpperCase();
}

export type RetailerLinkFields = {
  /** The RSO's number as the master holds it (`I_TOP_UP_SR_NUMBER`/`ITOPUPSRNUMBER`). */
  iTopUpSrNumber?: string | null;
  /** The RSO's number on the transaction line (`SRNUMBER`). */
  srNumber?: string | null;
  /** The RSO's code (`RSOCODE`). */
  rsoCode?: string | null;
};

/**
 * The employee this retailer belongs to, and how that was decided.
 *
 * Returns `{ employee: null, basis: null }` rather than throwing: a retailer
 * genuinely without an RSO is a real state, and inventing one would be worse
 * than leaving it unassigned.
 */
export function linkEmployee<E extends LinkableEmployee>(
  index: EmployeeIndex<E>,
  fields: RetailerLinkFields,
): { employee: E | null; basis: LinkBasis } {
  for (const candidate of [fields.iTopUpSrNumber, fields.srNumber]) {
    const key = phoneKey(candidate ?? "");
    if (!key) continue;
    const found = index.byPhone.get(key);
    if (found) return { employee: found, basis: "phone" };
  }
  const code = normalizeRsoCode(fields.rsoCode);
  if (code) {
    const found = index.byCode.get(code);
    if (found) return { employee: found, basis: "code" };
  }
  return { employee: null, basis: null };
}

import { prisma } from "@/lib/prisma";
import { phoneKey } from "./phone";
import { recordAssignmentChanges } from "./assignment-history";
import type { AuditActor } from "./audit";

/**
 * Creates the outlets a daily report knows about and the Retailer Master does
 * not yet.
 *
 * ## Why this exists
 *
 * C2C, C2S and OB all refused any file containing a retailer code that was not
 * already in the master — and refused the **whole file**, not the row. Measured
 * against the owner's real exports with three of 2,190 outlets held back:
 *
 *     C2C: FAILED — 3 invalid or unmapped row(s)
 *     C2S: FAILED — 3 invalid or unmapped row(s)
 *     OB : FAILED — 3 invalid/unmapped row(s)
 *     stored after all three: C2C 0, C2S 0, OB 0
 *
 * Three new shops out of two thousand — 0.14% of the file — and nothing at all
 * landed. Since the carrier adds outlets routinely, the daily upload would
 * simply stop working on the day that happened and stay stopped until somebody
 * noticed and re-exported the master. The OB message even said *"Fix the file
 * before replacing the current snapshot"*, which sends the operator to inspect
 * a file that is perfectly correct.
 *
 * ## Why creating them is safe
 *
 * These reports already carry everything the master needs to identify an
 * outlet: `RETAILER_CODE`, `RETAILER_NAME`, `RETAILER_ITOPUP_NO` and the RSO's
 * own `SRNUMBER`, which is the same field the master maps by. So the row is not
 * invented — it is copied from the carrier's own file.
 *
 * ## What it deliberately does NOT do
 *
 * A created retailer is a **stub**, not a substitute for the master. It gets a
 * code, a name, its iTop-up number and its RSO. It does not get `SIM_SELLER`,
 * `CATEGORY` or `ROUTE`, because the daily reports do not contain them.
 *
 * That has one consequence worth stating plainly: **SSO counts a retailer only
 * when `simSeller` is `Y`**, so a stub cannot qualify for SSO until the real
 * master upload fills that in. Guessing `Y` would be worse — it would inflate
 * SSO with outlets nobody has confirmed sell SIMs. The import result names
 * every retailer it created so the gap is visible rather than silent.
 *
 * An existing retailer is never touched here. This only ever adds.
 */

export type RetailerSeed = {
  retailerCode: string;
  retailerName?: string;
  iTopUpNumber?: string;
  /** The RSO's own number, which is how the master maps a retailer to an RSO. */
  srNumber?: string;
  iTopUpSeller?: string;
};

export type AutoCreateResult = {
  /** Codes created by this call, in the order the file first mentioned them. */
  created: string[];
  /** Created and immediately matched to an RSO. */
  createdMapped: number;
};

/**
 * @param seeds one entry per row; duplicates and already-known codes are fine.
 * @param knownCodes the uppercased codes already in the master, so the caller's
 *        existing lookup is reused rather than repeated.
 */
export async function createMissingRetailers(
  seeds: RetailerSeed[],
  knownCodes: Set<string>,
  source: string,
  actor: AuditActor | null = null,
): Promise<AutoCreateResult> {
  const wanted = new Map<string, RetailerSeed>();
  for (const seed of seeds) {
    const code = seed.retailerCode.toUpperCase();
    if (!code || knownCodes.has(code)) continue;
    const seen = wanted.get(code);
    /*
     * First mention wins, except that a later line may be the one carrying the
     * name — a shared BP appears once per RSO and not every line is equally
     * complete. Taking the fullest version avoids creating a nameless outlet
     * when the file did say what it is called.
     */
    if (!seen) wanted.set(code, seed);
    else if (!seen.retailerName && seed.retailerName) wanted.set(code, { ...seen, ...seed });
  }
  if (!wanted.size) return { created: [], createdMapped: 0 };

  /*
   * Every RSO, matched in memory — not a `where: { rsoMsisdn: { in: [...] } }`.
   *
   * `phoneKey` strips a leading 88 and leading zeros, so the key it produces
   * ("1937614430") is not what the column stores ("01937614430"). The first
   * version of this filtered the query by those keys, matched nothing, and
   * created every new outlet unassigned — a silent failure that looked exactly
   * like success. The master importer already loads all employees and maps by
   * key for this reason; there are tens of RSOs, not thousands.
   */
  const employees = await prisma.employee.findMany({ select: { id: true, rsoMsisdn: true, name: true } });
  const employeeByMsisdn = new Map(employees.map((e) => [phoneKey(e.rsoMsisdn), e]));

  const created: string[] = [];
  let createdMapped = 0;
  const history = [];

  for (const [code, seed] of wanted) {
    const employee = employeeByMsisdn.get(phoneKey(seed.srNumber ?? "")) ?? null;
    if (employee) createdMapped++;
    /*
     * `createMany` with `skipDuplicates` would be one round trip, but it cannot
     * report which rows it skipped, and two uploads running at once must not
     * make one of them fail. An upsert per new retailer is a handful of queries
     * on a normal day — the number of NEW outlets, not the size of the file.
     */
    await prisma.retailer.upsert({
      where: { retailerCode: code },
      update: {},
      create: {
        retailerCode: code,
        retailerName: seed.retailerName?.trim() || null,
        iTopUpNumber: seed.iTopUpNumber?.trim() || null,
        iTopUpSrNumber: seed.srNumber?.trim() || null,
        iTopUpSeller: seed.iTopUpSeller?.trim() || null,
        employeeId: employee?.id ?? null,
        active: true,
      },
    });
    created.push(code);
    if (employee)
      history.push({
        kind: "RETAILER_RSO" as const,
        entityId: code,
        entityName: `${code}${seed.retailerName ? ` — ${seed.retailerName}` : ""}`,
        fromId: null,
        fromName: null,
        toId: employee.id,
        toName: employee.name,
      });
  }

  // The same rule the master import follows: history is written after the rows
  // exist, never before, so it cannot claim an assignment that failed to save.
  if (history.length) await recordAssignmentChanges(actor, history, source);

  return { created, createdMapped };
}

/** A sentence for the import result, or null when nothing was created. */
export function describeCreatedRetailers(result: AutoCreateResult): string | null {
  const { created } = result;
  if (!created.length) return null;
  const shown = created.slice(0, 6).join(", ");
  const rest = created.length > 6 ? ` and ${created.length - 6} more` : "";
  return (
    `${created.length} new retailer${created.length > 1 ? "s were" : " was"} added from this file: ${shown}${rest}. ` +
    "They carry only what the report knows — upload the Retailer Master to fill in SIM_SELLER, CATEGORY and ROUTE. " +
    "Until SIM_SELLER is set, they cannot count towards SSO."
  );
}

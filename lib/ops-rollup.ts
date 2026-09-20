/**
 * Rolling an upload feed up from retailers to RSOs to supervisors.
 *
 * ## The rule, and why it is a plain sum here
 *
 * `lib/bp-rollup.ts` exists because a Business Partner's outlet is credited to
 * the RSO holding it and removed from its owner, and because one outlet can be
 * held by two RSOs on the same team — so a total across teams has to go back
 * to the underlying rows rather than add the teams up.
 *
 * None of that applies on these four screens. The GA, C2C, C2S and OB pages
 * report what a FILE contained, against the master data's ownership: a
 * retailer has exactly one `employeeId` and an employee exactly one
 * `supervisorId`, so every amount belongs to one RSO and one supervisor and to
 * nobody else. Adding them up double-counts nothing.
 *
 * That distinction is the whole reason this is a separate module with its own
 * name. Someone reaching for `teamTotals()` here would be applying the BP
 * ledger to a file import, and someone reaching for this on a performance
 * screen would be dropping the ledger. Neither is a mistake you can see by
 * reading the call site, so the two live apart and say why.
 *
 * ## Grouping by id, never by name
 *
 * Two supervisors can share a name. v181 found exactly that defect in the
 * Reporting Center, where a name-keyed roll-up silently merged two people's
 * teams into one row. Every function here takes a key that must be an id, and
 * carries the name along only as a label.
 */

/** Which level of the same feed a table is showing. */
export type OpsLevel = "retailer" | "rso" | "supervisor";

export const OPS_LEVELS: readonly OpsLevel[] = ["retailer", "rso", "supervisor"];

/** What each tab is called, in one place, so four pages cannot disagree. */
export const OPS_LEVEL_LABEL: Record<OpsLevel, string> = {
  retailer: "Retailer",
  rso: "RSO",
  supervisor: "Supervisor",
};

/** What one row of a rolled-up table carries, whatever the feed. */
export type OpsGroup<K extends string> = {
  /** The id the rows were grouped on. Never a name. */
  key: string;
  /** What to print: the person's name. */
  name: string;
  /** A second line — an RSO's mobile number, a supervisor's team size. */
  sub: string;
  /** How many underlying rows fell into this group. */
  count: number;
  /** The summed numeric fields, in the order they were asked for. */
  totals: Record<K, number>;
};

/**
 * Group rows and sum the named numeric fields.
 *
 * `numeric` is a list of field names rather than a callback per field so that a
 * caller adding a column to its table cannot forget to add it to the roll-up
 * and end up with a column of zeros — the names are the columns.
 *
 * Sorted by the FIRST numeric field, descending, then by name. That field is
 * the one the table is about (balance, amount, activations), so the largest
 * lands at the top, which is what an operator opens these screens for.
 */
export function groupOps<Row, K extends string>(
  rows: readonly Row[],
  identify: (row: Row) => { key: string; name: string; sub?: string },
  numeric: readonly K[],
  value: (row: Row, field: K) => number,
): OpsGroup<K>[] {
  const map = new Map<string, OpsGroup<K>>();
  for (const row of rows) {
    const { key, name, sub } = identify(row);
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        name,
        sub: sub || "",
        count: 0,
        totals: Object.fromEntries(numeric.map((f) => [f, 0])) as Record<K, number>,
      };
      map.set(key, group);
    }
    group.count += 1;
    for (const field of numeric) group.totals[field] += Number(value(row, field)) || 0;
  }
  const first = numeric[0];
  return [...map.values()].sort(
    (a, b) => (first ? b.totals[first] - a.totals[first] : 0) || a.name.localeCompare(b.name),
  );
}

/**
 * The same, for rows that are ALREADY one per RSO.
 *
 * GA, C2C and C2S hand the page a row per employee; rolling those to
 * supervisors is the same arithmetic one level up, and it is spelled out here
 * rather than left to each page so the id-not-name rule is applied once.
 */
export function groupOpsBySupervisor<
  Row extends { supervisorId?: string | null; supervisor: string },
  K extends string,
>(rows: readonly Row[], numeric: readonly K[], value: (row: Row, field: K) => number): OpsGroup<K>[] {
  return groupOps(
    rows,
    (row) => ({
      // An employee with no supervisor is a real state in this data and gets
      // its own row rather than being dropped or merged into someone else's.
      key: row.supervisorId || `name:${row.supervisor}`,
      name: row.supervisor,
    }),
    numeric,
    value,
  );
}

/** "12 RSOs" / "1 RSO" — the count line under a rolled-up name. */
export function opsCountLabel(count: number, noun: string) {
  return `${count.toLocaleString("en-US")} ${count === 1 ? noun : `${noun}s`}`;
}

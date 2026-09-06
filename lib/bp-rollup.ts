/**
 * Adding Business Partners back above RSO level.
 *
 * ## The rule
 *
 * A BP retailer's SIMs and recharge do **not** count toward its RSO. The RSO
 * did not make those sales; the BP did, on its own account and against its own
 * target. But a supervisor, a manager and the company are responsible for the
 * whole territory, so at every level above the RSO the BP figures count
 * normally.
 *
 * `employeePerformance()` therefore returns each RSO's own numbers with the BP
 * share held aside in `row.bp`. This file is the ONLY place that share is added
 * back.
 *
 * ## Why one file rather than `a + b` at each call site
 *
 * There are a dozen places that roll RSO rows up into a team or company total.
 * If one of them forgets, a supervisor's GA silently drops by however much
 * their BPs sold — no error, no empty screen, just a number that is too small,
 * on a screen whose whole job is to be the number. `tests/bp-rollup.smoke.test.ts`
 * asserts that no page sums these fields by hand, which only works because the
 * legitimate way to do it lives here.
 *
 * Prisma-free (types only), like `achievement.ts` and `pacing.ts`.
 */

/**
 * What a Business Partner under this RSO produced.
 *
 * Held separately because the two audiences want different answers. An RSO is
 * measured on the outlets THEY work; a BP is a retailer that sells on its own
 * account, with its own target, and counting its SIMs toward the RSO flattered
 * the RSO and hid the BP. A supervisor, manager or the company is responsible
 * for the whole territory, so at those levels the BP figures are added straight
 * back — here, and nowhere else.
 */
export type BpPortion = {
  /** BP assignments active in the period under this RSO. */
  count: number;
  gaTarget: number;
  gaAchieved: number;
  ssoAchieved: number;
  c2cAchieved: number;
  lsoAchieved: number;
  c2sAmount: number;
  c2sTransactions: number;
  /**
   * The same figures split by BP retailer, which is what makes a team total
   * addable.
   *
   * A BP may be held by SEVERAL RSOs at once. Each of them is working that
   * outlet, so each sees its whole GA on their own page — that is the owner's
   * rule, and `withBp()` below honours it. But the outlet sold those SIMs
   * once, so a supervisor's or the company's total must count them once, and
   * summing the rows would count them per RSO holding the assignment.
   *
   * Aggregates alone cannot be de-duplicated after the fact: 40 + 40 is 80
   * whether or not it is the same 40. Keeping the retailer id is the whole
   * difference between a team total that is right and one that is quietly
   * inflated by exactly the shared BPs.
   */
  byRetailer: Record<string, BpRetailerFigures>;
};

/** One BP retailer's contribution, so a shared one can be counted once. */
export type BpRetailerFigures = {
  gaTarget: number;
  gaAchieved: number;
  ssoAchieved: number;
  c2cAchieved: number;
  lsoAchieved: number;
  c2sAmount: number;
  c2sTransactions: number;
};

/**
 * What a rollup needs from a row.
 *
 * Structural rather than `EmployeePerformance`, because two code paths produce
 * these rows: `lib/performance.ts` for the role pages, and
 * `/api/dashboard/summary` for the admin dashboard, whose rows carry no C2S
 * figures. One helper for both is the point — a second implementation is how
 * the two screens start disagreeing.
 */
export type RollupRow = {
  gaTarget: number;
  gaAchieved: number;
  ssoTarget: number;
  ssoAchieved: number;
  c2cTarget: number;
  c2cAchieved: number;
  lsoTarget: number;
  lsoAchieved: number;
  scTarget: number;
  scAchieved: number;
  totalRechargeTarget: number;
  totalRechargeAchieved: number;
  c2sAmount?: number;
  c2sTransactions?: number;
  retailerCount: number;
  bp: BpPortion;
};

/** The metrics that have a BP counterpart. */
export type RollupTotals = {
  gaTarget: number;
  gaAchieved: number;
  ssoTarget: number;
  ssoAchieved: number;
  c2cTarget: number;
  c2cAchieved: number;
  lsoTarget: number;
  lsoAchieved: number;
  scTarget: number;
  scAchieved: number;
  totalRechargeTarget: number;
  totalRechargeAchieved: number;
  c2sAmount: number;
  c2sTransactions: number;
  retailerCount: number;
  /**
   * BPs inside this total. On one RSO's row it is their assignment count; in a
   * team total it is DISTINCT BP retailers, because one outlet shared by three
   * RSOs is one Business Partner, not three.
   */
  bpCount: number;
};

const EMPTY: RollupTotals = {
  gaTarget: 0,
  gaAchieved: 0,
  ssoTarget: 0,
  ssoAchieved: 0,
  c2cTarget: 0,
  c2cAchieved: 0,
  lsoTarget: 0,
  lsoAchieved: 0,
  scTarget: 0,
  scAchieved: 0,
  totalRechargeTarget: 0,
  totalRechargeAchieved: 0,
  c2sAmount: 0,
  c2sTransactions: 0,
  retailerCount: 0,
  bpCount: 0,
};

/**
 * One RSO's row as the territory sees it: their own figures plus their BPs'.
 *
 * Use this wherever a single RSO's contribution to a TEAM is what matters. On a
 * screen about the RSO themselves, use the row as it comes.
 */
export function withBp(row: RollupRow): RollupTotals {
  const bp = row.bp;
  return {
    gaTarget: row.gaTarget + bp.gaTarget,
    gaAchieved: row.gaAchieved + bp.gaAchieved,
    ssoTarget: row.ssoTarget,
    ssoAchieved: row.ssoAchieved + bp.ssoAchieved,
    c2cTarget: row.c2cTarget,
    c2cAchieved: row.c2cAchieved + bp.c2cAchieved,
    lsoTarget: row.lsoTarget,
    lsoAchieved: row.lsoAchieved + bp.lsoAchieved,
    scTarget: row.scTarget,
    scAchieved: row.scAchieved,
    // Total recharge is C2C plus the manual SC figure, so the BP's C2C flows
    // through here too. Recomputed rather than read from the row, which
    // already had the BP share removed.
    totalRechargeTarget: row.totalRechargeTarget,
    totalRechargeAchieved: row.c2cAchieved + bp.c2cAchieved + row.scAchieved,
    c2sAmount: (row.c2sAmount ?? 0) + bp.c2sAmount,
    c2sTransactions: (row.c2sTransactions ?? 0) + bp.c2sTransactions,
    retailerCount: row.retailerCount,
    bpCount: bp.count,
  };
}

/**
 * Several RSO rows as one team or company total, BPs included.
 *
 * Note the targets that are NOT adjusted. A BP assignment carries a GA target
 * and nothing else, so `gaTarget` is the only one with a BP component to add.
 * SSO, C2C, LSO and SC targets are the RSO's as set in `/targets`, unchanged by
 * this split — which is also why an RSO with BPs will show a lower achievement
 * percentage on those four until their targets are revised by hand.
 */
export function teamTotals(rows: RollupRow[]): RollupTotals {
  /*
   * The RSOs' OWN figures add up; the BPs' are unioned by retailer.
   *
   * Summing `withBp(row)` across rows would be wrong now that a BP can sit
   * under several RSOs: the shared outlet's GA, and its GA target, would be
   * added once per holder. On a company dashboard that reads as growth nobody
   * earned — the exact "correct-looking output that is not correct" this
   * project keeps auditing for.
   *
   * So each BP retailer is collected into one map first, and only then added.
   * A retailer that appears under three RSOs contributes one entry.
   */
  const bpByRetailer = new Map<string, BpRetailerFigures>();
  for (const row of rows)
    for (const [retailerId, f] of Object.entries(row.bp.byRetailer))
      // Same retailer from a second RSO: identical figures, so the first entry
      // already says everything. Overwrite rather than add.
      bpByRetailer.set(retailerId, f);

  const bp = [...bpByRetailer.values()].reduce(
    (a, f) => ({
      gaTarget: a.gaTarget + f.gaTarget,
      gaAchieved: a.gaAchieved + f.gaAchieved,
      ssoAchieved: a.ssoAchieved + f.ssoAchieved,
      c2cAchieved: a.c2cAchieved + f.c2cAchieved,
      lsoAchieved: a.lsoAchieved + f.lsoAchieved,
      c2sAmount: a.c2sAmount + f.c2sAmount,
      c2sTransactions: a.c2sTransactions + f.c2sTransactions,
    }),
    { gaTarget: 0, gaAchieved: 0, ssoAchieved: 0, c2cAchieved: 0, lsoAchieved: 0, c2sAmount: 0, c2sTransactions: 0 },
  );

  const own = rows.reduce<RollupTotals>(
    (acc, row) => ({
      gaTarget: acc.gaTarget + row.gaTarget,
      gaAchieved: acc.gaAchieved + row.gaAchieved,
      ssoTarget: acc.ssoTarget + row.ssoTarget,
      ssoAchieved: acc.ssoAchieved + row.ssoAchieved,
      c2cTarget: acc.c2cTarget + row.c2cTarget,
      c2cAchieved: acc.c2cAchieved + row.c2cAchieved,
      lsoTarget: acc.lsoTarget + row.lsoTarget,
      lsoAchieved: acc.lsoAchieved + row.lsoAchieved,
      scTarget: acc.scTarget + row.scTarget,
      scAchieved: acc.scAchieved + row.scAchieved,
      totalRechargeTarget: acc.totalRechargeTarget + row.totalRechargeTarget,
      totalRechargeAchieved: acc.totalRechargeAchieved + row.totalRechargeAchieved,
      c2sAmount: acc.c2sAmount + (row.c2sAmount ?? 0),
      c2sTransactions: acc.c2sTransactions + (row.c2sTransactions ?? 0),
      retailerCount: acc.retailerCount + row.retailerCount,
      bpCount: 0,
    }),
    EMPTY,
  );

  return {
    gaTarget: own.gaTarget + bp.gaTarget,
    gaAchieved: own.gaAchieved + bp.gaAchieved,
    ssoTarget: own.ssoTarget,
    ssoAchieved: own.ssoAchieved + bp.ssoAchieved,
    c2cTarget: own.c2cTarget,
    c2cAchieved: own.c2cAchieved + bp.c2cAchieved,
    lsoTarget: own.lsoTarget,
    lsoAchieved: own.lsoAchieved + bp.lsoAchieved,
    scTarget: own.scTarget,
    scAchieved: own.scAchieved,
    // Same recomputation as withBp(): the rows already had the BP share taken
    // out, so total recharge is rebuilt from C2C plus the manual SC figure.
    totalRechargeTarget: own.totalRechargeTarget,
    totalRechargeAchieved: own.c2cAchieved + bp.c2cAchieved + own.scAchieved,
    c2sAmount: own.c2sAmount + bp.c2sAmount,
    c2sTransactions: own.c2sTransactions + bp.c2sTransactions,
    retailerCount: own.retailerCount,
    bpCount: bpByRetailer.size,
  };
}

/**
 * Several teams at once: one `RollupTotals` per group, each de-duplicated.
 *
 * ## Why this exists rather than a reduce at the call site
 *
 * Four pages grouped RSO rows into supervisor buckets like this:
 *
 *     const t = withBp(r);
 *     bucket.gaAchieved += t.gaAchieved;
 *
 * Which was right for as long as a Business Partner had one holder. The moment
 * one outlet could sit under two RSOs, a bucket containing both of them added
 * that outlet's GA twice — and its GA target twice — because `withBp()` gives
 * each holder the whole thing on purpose. Measured on real data, one shared
 * outlet turned 3,744 GA against a 415 target into 3,765 against 440.
 *
 * `teamTotals()` already knew how to avoid that. These pages were not calling
 * it: they were doing the same job by hand, one metric at a time, and the
 * dedup lives inside the function they skipped.
 *
 * Note what a group means here. Each group counts a shared outlet once, and two
 * groups that both hold it each count it once — a supervisor answers for their
 * own territory, and the outlet really is worked in both. Only a total ACROSS
 * groups needs `teamTotals()` over the underlying rows, never a sum of these.
 */
export function groupTotals<T extends RollupRow, K>(
  rows: T[],
  // Generic in the ROW too: callers group by fields that live on their own row
  // type (`supervisorId`, and so on) rather than on the structural minimum
  // this module needs.
  key: (row: T) => K | null | undefined,
): Map<K, RollupTotals> {
  const grouped = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (k === null || k === undefined) continue;
    const list = grouped.get(k);
    if (list) list.push(row);
    else grouped.set(k, [row]);
  }
  const out = new Map<K, RollupTotals>();
  for (const [k, list] of grouped) out.set(k, teamTotals(list));
  return out;
}

/**
 * How many RSO rows are in each group, which the totals above deliberately do
 * not carry — `retailerCount` counts outlets, not people.
 */
export function groupSizes<T, K>(rows: T[], key: (row: T) => K | null | undefined): Map<K, number> {
  const out = new Map<K, number>();
  for (const row of rows) {
    const k = key(row);
    if (k === null || k === undefined) continue;
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

/** True when any BP sits inside this set — worth a footnote on a team screen. */
export const hasBp = (rows: RollupRow[]) => rows.some((r) => r.bp.count > 0);

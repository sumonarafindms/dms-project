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
  /** How many BP assignments are inside this total. */
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
  return rows.reduce<RollupTotals>((acc, row) => {
    const t = withBp(row);
    return {
      gaTarget: acc.gaTarget + t.gaTarget,
      gaAchieved: acc.gaAchieved + t.gaAchieved,
      ssoTarget: acc.ssoTarget + t.ssoTarget,
      ssoAchieved: acc.ssoAchieved + t.ssoAchieved,
      c2cTarget: acc.c2cTarget + t.c2cTarget,
      c2cAchieved: acc.c2cAchieved + t.c2cAchieved,
      lsoTarget: acc.lsoTarget + t.lsoTarget,
      lsoAchieved: acc.lsoAchieved + t.lsoAchieved,
      scTarget: acc.scTarget + t.scTarget,
      scAchieved: acc.scAchieved + t.scAchieved,
      totalRechargeTarget: acc.totalRechargeTarget + t.totalRechargeTarget,
      totalRechargeAchieved: acc.totalRechargeAchieved + t.totalRechargeAchieved,
      c2sAmount: acc.c2sAmount + t.c2sAmount,
      c2sTransactions: acc.c2sTransactions + t.c2sTransactions,
      retailerCount: acc.retailerCount + t.retailerCount,
      bpCount: acc.bpCount + t.bpCount,
    };
  }, EMPTY);
}

/** True when any BP sits inside this set — worth a footnote on a team screen. */
export const hasBp = (rows: RollupRow[]) => rows.some((r) => r.bp.count > 0);

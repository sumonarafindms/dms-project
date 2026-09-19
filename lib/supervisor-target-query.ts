import { prisma } from "./prisma";
import { monthStartsInRange } from "./date-range";
import { emptySupervisorTarget, type SupervisorTarget } from "./supervisor-target";

/**
 * The database half of lib/supervisor-target.ts.
 *
 * Separated for the reason `lib/ga-category.ts` is separated from
 * `lib/business-rules.ts`: the rules themselves must be importable by a client
 * component, and `prisma` must not be.
 */
/**
 * Stored targets for a range, one entry per supervisor that has one.
 *
 * Every calendar month the range touches counts, and they add — the same rule
 * `employeePerformance` applies to an RSO's months, so a quarter's target is
 * the three months' targets and not one of them.
 *
 * A supervisor with no row for any of those months is simply absent from the
 * map; callers use `emptySupervisorTarget()` and get the honest empty state.
 */
export async function supervisorTargets(
  start: Date,
  endExclusive: Date,
  supervisorIds?: string[],
): Promise<Map<string, SupervisorTarget>> {
  const months = monthStartsInRange(start, endExclusive);
  if (!months.length) return new Map();
  const first = months[0],
    last = months[months.length - 1],
    lastEnd = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 1));

  const rows = await prisma.supervisorMonthlyTarget.findMany({
    where: {
      month: { gte: first, lt: lastEnd },
      ...(supervisorIds ? { supervisorId: { in: supervisorIds } } : {}),
    },
    select: {
      supervisorId: true,
      gaTarget: true,
      c2cTarget: true,
      scTarget: true,
      totalRechargeTarget: true,
      ssoTarget: true,
      lsoTarget: true,
    },
  });

  const out = new Map<string, SupervisorTarget>();
  for (const r of rows) {
    const cur = out.get(r.supervisorId) ?? emptySupervisorTarget();
    out.set(r.supervisorId, {
      set: true,
      gaTarget: cur.gaTarget + r.gaTarget,
      c2cTarget: cur.c2cTarget + Number(r.c2cTarget),
      scTarget: cur.scTarget + Number(r.scTarget),
      totalRechargeTarget: cur.totalRechargeTarget + Number(r.totalRechargeTarget),
      ssoTarget: cur.ssoTarget + r.ssoTarget,
      lsoTarget: cur.lsoTarget + r.lsoTarget,
    });
  }
  return out;
}

import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { monthBounds } from "./month";
/*
 * `paceStatus`, `rankRows` and the `PaceStatus` type were removed in v132:
 * nothing imported them. `rankRows` was the only caller of `paceStatus`, and
 * nothing called `rankRows` — so the whole chain was dead.
 *
 * Worth recording, because it is the sort of thing that wastes a later hour:
 * v128 "removed a duplicate" inside `paceStatus` (it inlined the 8 / -5
 * margins that lib/achievement.ts already owned as PACE_AHEAD_MARGIN and
 * PACE_BEHIND_MARGIN). The observation was right and the fix was correct, but
 * it was applied to code no screen ever ran. Deleting it is the real fix.
 */
import { dhakaTodayYmd } from "./business-time";
import { withStandardGa } from "./business-rules";

export function monthPace(month: string, now = new Date()) {
  const { start, end } = monthBounds(month);
  const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000);
  const todayUtc = new Date(`${dhakaTodayYmd(now)}T00:00:00.000Z`);
  if (todayUtc < start) return 0;
  if (todayUtc >= end) return 100;
  const elapsed = Math.max(1, Math.min(totalDays, Math.floor((todayUtc.getTime() - start.getTime()) / 86400000) + 1));
  return Math.round((elapsed / totalDays) * 100);
}
export async function latestDailySnapshot(employeeIds?: string[]) {
  const gaFilter: Prisma.GaActivationWhereInput = withStandardGa(
    employeeIds ? { retailer: { employeeId: { in: employeeIds } } } : {},
  );
  const c2cFilter: Prisma.C2cRecordWhereInput = employeeIds ? { retailer: { employeeId: { in: employeeIds } } } : {};
  const [latestGa, latestC2c] = await Promise.all([
    prisma.gaActivation.findFirst({
      where: gaFilter,
      orderBy: { activationDate: "desc" },
      select: { activationDate: true },
    }),
    prisma.c2cRecord.findFirst({ where: c2cFilter, orderBy: { date: "desc" }, select: { date: true } }),
  ]);
  const gaDate = latestGa?.activationDate || null,
    c2cDate = latestC2c?.date || null;
  const [gaRows, c2cRows] = await Promise.all([
    gaDate
      ? prisma.gaActivation.findMany({
          where: { ...gaFilter, activationDate: gaDate },
          select: { retailer: { select: { employeeId: true } } },
        })
      : Promise.resolve([]),
    c2cDate
      ? prisma.c2cRecord.findMany({
          where: { ...c2cFilter, date: c2cDate },
          select: { amount: true, retailer: { select: { employeeId: true } } },
        })
      : Promise.resolve([]),
  ]);
  const gaBy = new Map<string, number>(),
    c2cBy = new Map<string, number>();
  for (const x of gaRows) {
    const id = x.retailer.employeeId;
    if (id) gaBy.set(id, (gaBy.get(id) || 0) + 1);
  }
  for (const x of c2cRows) {
    const id = x.retailer.employeeId;
    if (id) c2cBy.set(id, (c2cBy.get(id) || 0) + Number(x.amount));
  }
  return {
    gaDate,
    c2cDate,
    gaTotal: [...gaBy.values()].reduce((a, b) => a + b, 0),
    c2cTotal: [...c2cBy.values()].reduce((a, b) => a + b, 0),
    gaBy,
    c2cBy,
  };
}

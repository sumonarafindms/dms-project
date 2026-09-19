import { NextRequest, NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { monthBounds } from "@/lib/month";
import {
  classifyGaActivation,
  isSsoComplete,
  lsoCompleteMonthlySummaryWhere,
  withStandardGa,
} from "@/lib/business-rules";
import { addTier, noTiers, type GaTiers } from "@/lib/ga-category";
import { currentGa170Tariff } from "@/lib/ga-tariff";
import { apiError } from "@/lib/http-errors";
import { dhakaMonth } from "@/lib/business-time";
import { bpLedger } from "@/lib/bp-ledger";
import { supervisorTargets } from "@/lib/supervisor-target-query";
import type { BpPortion } from "@/lib/bp-rollup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

function selectedMonth(value: string | null) {
  const text = value && /^\d{4}-\d{2}$/.test(value) ? value : dhakaMonth();
  return monthBounds(`${text}-01T00:00:00.000Z`);
}

export async function GET(req: NextRequest) {
  if (!(await apiUser(["ADMIN", "IT"]))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { start, end } = selectedMonth(req.nextUrl.searchParams.get("month"));

    // Everything below is aggregated in the database. This endpoint used to pull
    // every GaActivation and C2cRecord row for the month into memory, which is
    // what made the dashboard slow once a month held tens of thousands of rows.
    // The request window is exactly one calendar month, so a groupBy on
    // retailerId already gives the per-retailer monthly count SSO needs.
    const [employees, retailers, gaGroups, c2cGroups, lsoRetailers] = await Promise.all([
      prisma.employee.findMany({
        where: { active: true },
        select: {
          id: true,
          employeeCode: true,
          name: true,
          rsoMsisdn: true,
          supervisorId: true,
          supervisor: { select: { name: true } },
          _count: { select: { retailers: true } },
          targets: {
            where: { month: start },
            take: 1,
            select: {
              gaTarget: true,
              c2cTarget: true,
              scTarget: true,
              totalRechargeTarget: true,
              ssoTarget: true,
              lsoTarget: true,
            },
          },
          manualMetrics: { where: { month: start }, take: 1, select: { scAchieved: true } },
        },
        orderBy: [{ supervisor: { name: "asc" } }, { name: "asc" }],
      }),
      prisma.retailer.findMany({
        where: { employeeId: { not: null } },
        select: { id: true, employeeId: true, simSeller: true },
      }),
      // Grouped by DAY as well as retailer: a BP assignment starts and ends on
      // a date, so without the day there is no way to give the 11th to the RSO
      // and the 13th to the BP.
      /*
       * `productCode` and `sellingPrice` join the grouping keys so the 170/300
       * split can be decided here rather than with two more round trips. It is
       * the same query — the result set gains a row only where one retailer
       * sold both tiers on one day.
       */
      prisma.gaActivation.groupBy({
        by: ["retailerId", "activationDate", "productCode", "sellingPrice"],
        where: withStandardGa({ activationDate: { gte: start, lt: end } }),
        _count: { _all: true },
      }),
      prisma.c2cRecord.groupBy({
        by: ["retailerId", "date"],
        where: { date: { gte: start, lt: end } },
        _sum: { amount: true },
      }),
      prisma.c2sMonthlySummary.findMany({
        where: { month: start, ...lsoCompleteMonthlySummaryWhere },
        select: { retailerId: true },
      }),
    ]);

    const retailerMap = new Map(retailers.map((r) => [r.id, r]));

    /*
     * Business Partners, dated.
     *
     * A BP retailer's SIMs and recharge belong to the BP, not to the RSO that
     * services the outlet — so they are split out here exactly as
     * `lib/performance.ts` does it, and added back for the company totals by
     * `teamTotals()` on the dashboard. Two aggregation paths reach this data
     * (this route, and employeePerformance for the role pages); they must apply
     * the same rule or /dashboard and /admin/performance/rsos will disagree
     * about the same RSO.
     */
    const bpAssignments = await prisma.bpAssignment.findMany({
      where: { startDate: { lt: end }, OR: [{ endDate: null }, { endDate: { gte: start } }] },
      select: {
        retailerId: true,
        employeeId: true,
        startDate: true,
        endDate: true,
        gaTarget: true,
        monthlyTargets: { select: { month: true, gaTarget: true } },
      },
    });
    /*
     * The same ledger lib/performance.ts uses, and that is the point.
     *
     * This route and employeePerformance() both split BP figures out of the
     * RSO's own, and the comment above has always said they must agree. They
     * used to agree by having two copies of the rule side by side. Since a BP
     * may now be held by several RSOs at once — each seeing the whole thing,
     * the company counting it once — the rule got harder, and a second copy
     * would have been a second chance to get it wrong.
     *
     * This is the company dashboard, so every employee is in scope.
     */
    const ledger = bpLedger(bpAssignments, start, end, () => true);

    const gaByEmployee = new Map<string, GaTiers>();
    const ssoByEmployee = new Map<string, number>();
    /*
     * `/dashboard` and `employeePerformance` are required to agree (see the
     * note below), so the tier split has to be computed the same way on both
     * sides: from the learned tariff, never from a hardcoded price.
     */
    const tariff = await currentGa170Tariff();
    // SSO counts retailer-MONTHS that reached the threshold, and the window
    // here is exactly one month — so the per-retailer totals are accumulated
    // first, split RSO-side from BP-side, and only then tested.
    const perRetailer = new Map<string, { rso: GaTiers; bp: GaTiers }>();
    for (const group of gaGroups) {
      const bucket = perRetailer.get(group.retailerId) ?? { rso: noTiers(), bp: noTiers() };
      const side = ledger.ownsDay(group.retailerId, group.activationDate.getTime()) ? bucket.bp : bucket.rso;
      addTier(side, classifyGaActivation(group, tariff), group._count._all);
      perRetailer.set(group.retailerId, bucket);
    }
    for (const [retailerId, counts] of perRetailer) {
      const retailer = retailerMap.get(retailerId);
      const employeeId = retailer?.employeeId;
      if (!employeeId) continue;
      if (counts.rso.total > 0) {
        const mine = gaByEmployee.get(employeeId) ?? noTiers();
        mine.total += counts.rso.total;
        mine.ga170 += counts.rso.ga170;
        mine.ga300 += counts.rso.ga300;
        gaByEmployee.set(employeeId, mine);
        if (isSsoComplete(retailer.simSeller, counts.rso.total))
          ssoByEmployee.set(employeeId, (ssoByEmployee.get(employeeId) || 0) + 1);
      }
      if (counts.bp.total > 0) {
        // The window here is exactly one month, so any day inside it picks the
        // same holders; `start` is the cheapest one to hand.
        const sso = isSsoComplete(retailer.simSeller, counts.bp.total);
        ledger.credit(retailerId, start.getTime(), employeeId, (f) => {
          f.gaAchieved += counts.bp.total;
          f.ga170 += counts.bp.ga170;
          f.ga300 += counts.bp.ga300;
          if (sso) f.ssoAchieved += 1;
        });
      }
    }

    const c2cByEmployee = new Map<string, number>();
    for (const group of c2cGroups) {
      const employeeId = retailerMap.get(group.retailerId)?.employeeId;
      if (!employeeId) continue;
      const amount = Number(group._sum.amount || 0);
      if (ledger.ownsDay(group.retailerId, group.date.getTime()))
        ledger.credit(group.retailerId, group.date.getTime(), employeeId, (f) => {
          f.c2cAchieved += amount;
        });
      else c2cByEmployee.set(employeeId, (c2cByEmployee.get(employeeId) || 0) + amount);
    }

    const lsoByEmployee = new Map<string, number>();
    for (const row of lsoRetailers) {
      const employeeId = retailerMap.get(row.retailerId)?.employeeId;
      if (!employeeId) continue;
      if (ledger.ownsRetailer(row.retailerId))
        ledger.credit(row.retailerId, null, employeeId, (f) => {
          f.lsoAchieved += 1;
        });
      else lsoByEmployee.set(employeeId, (lsoByEmployee.get(employeeId) || 0) + 1);
    }

    const rows = employees.map((employee) => {
      const target = employee.targets[0],
        manual = employee.manualMetrics[0];
      const scAchieved = Number(manual?.scAchieved || 0);
      const c2cAchieved = c2cByEmployee.get(employee.id) || 0;
      const ga = gaByEmployee.get(employee.id) ?? noTiers();
      const bp: BpPortion = ledger.portionFor(employee.id);
      return {
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        name: employee.name,
        supervisorId: employee.supervisorId,
        supervisor: employee.supervisor?.name || "Unassigned",
        retailerCount: employee._count.retailers,
        // Exactly as entered. RSO and BP targets are set independently, so
        // subtracting the BP's here would remove the same SIMs twice — see the
        // note in lib/performance.ts.
        gaTarget: target?.gaTarget || 0,
        gaAchieved: ga.total,
        ga170: ga.ga170,
        ga300: ga.ga300,
        /*
         * Same fold as lib/performance.ts, and it has to be: this endpoint and
         * that function are the app's two aggregation paths, and the older
         * comments in both already say they must apply one rule or /dashboard
         * and /admin/performance/rsos will disagree about the same RSO.
         *
         * A BP has no SSO, LSO or C2C target, and the RSO's target covers
         * their whole base including the outlets they hold as a BP — so the
         * holder is credited for them. GA stays apart, because a BP assignment
         * does carry its own GA target.
         */
        ssoTarget: target?.ssoTarget || 0,
        ssoAchieved: (ssoByEmployee.get(employee.id) || 0) + bp.ssoAchieved,
        c2cTarget: Number(target?.c2cTarget || 0),
        c2cAchieved: c2cAchieved + bp.c2cAchieved,
        scTarget: Number(target?.scTarget || 0),
        scAchieved,
        totalRechargeTarget: Number(target?.totalRechargeTarget || 0),
        totalRechargeAchieved: c2cAchieved + bp.c2cAchieved + scAchieved,
        lsoTarget: target?.lsoTarget || 0,
        lsoAchieved: (lsoByEmployee.get(employee.id) || 0) + bp.lsoAchieved,
        bp,
      };
    });

    /*
     * The supervisors' own targets travel with the rows.
     *
     * The dashboard groups RSO rows into supervisor buckets in the browser, so
     * it needs the stored targets there to apply them — v181: a supervisor is
     * measured against a target somebody set, not against their RSOs' added
     * up. Sent as plain data; the rule that turns it into a figure lives in
     * lib/supervisor-target.ts, which the client imports.
     */
    const supTargets = await supervisorTargets(start, end);
    return NextResponse.json(
      {
        month: start.toISOString().slice(0, 7),
        rows,
        supervisorTargets: [...supTargets].map(([supervisorId, t]) => ({ supervisorId, ...t })),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.error(error);
    const e = apiError(error, "Failed to load dashboard summary.");
    return NextResponse.json({ error: e.error }, { status: e.status });
  }
}

import { apiUser, apiPermission } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { monthBounds } from "@/lib/month";
import { monthStartsInRange, monthStartUtc } from "@/lib/date-range";
import { dhakaMonth } from "@/lib/business-time";
import { apiError } from "@/lib/http-errors";
import {
  GA_CLASSIFICATION_SELECT,
  addGaActivation,
  emptyGaBreakdown,
  isSsoComplete,
  withGa170,
  withGa300,
  withSimSwap,
  withStandardGa,
} from "@/lib/business-rules";

export const dynamic = "force-dynamic";

function dateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export async function GET(req: NextRequest) {
  if (!(await apiUser(["ADMIN", "IT", "ACCOUNTS"])))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await apiPermission("ga", "view"))) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  try {
    const month = req.nextUrl.searchParams.get("month") || dhakaMonth() + "-01";
    const requestedDate = req.nextUrl.searchParams.get("date");
    const { start, end } = monthBounds(month);
    const fromDate = dateOnly(req.nextUrl.searchParams.get("from") || "") || start;
    const toDateRaw = dateOnly(req.nextUrl.searchParams.get("to") || "");
    const rangeEnd = toDateRaw ? new Date(toDateRaw.getTime() + 86400000) : end;
    if (rangeEnd <= fromDate)
      return NextResponse.json({ error: "End date must be on or after start date." }, { status: 400 });
    const targetMonths = monthStartsInRange(fromDate, rangeEnd),
      targetStart = targetMonths[0] || monthStartUtc(fromDate),
      targetEnd = new Date(
        Date.UTC(
          (targetMonths.at(-1) || targetStart).getUTCFullYear(),
          (targetMonths.at(-1) || targetStart).getUTCMonth() + 1,
          1,
        ),
      );

    const dailyStart = requestedDate ? dateOnly(requestedDate) : null;
    const dailyEnd = dailyStart ? new Date(dailyStart.getTime() + 24 * 60 * 60 * 1000) : null;

    const [
      employees,
      retailers,
      ga170Groups,
      ga300Groups,
      swapGroups,
      monthlyStandardByDay,
      dailyActivations,
      importHistory,
    ] = await Promise.all([
      prisma.employee.findMany({
        where: { active: true },
        orderBy: [{ supervisor: { name: "asc" } }, { name: "asc" }],
        include: {
          supervisor: { select: { name: true } },
          _count: { select: { retailers: true } },
          targets: { where: { month: { gte: targetStart, lt: targetEnd } } },
        },
      }),
      prisma.retailer.findMany({
        where: { employeeId: { not: null } },
        select: { id: true, employeeId: true, simSeller: true },
      }),
      prisma.gaActivation.groupBy({
        by: ["retailerId"],
        where: withGa170({ activationDate: { gte: fromDate, lt: rangeEnd } }),
        _count: { _all: true },
      }),
      prisma.gaActivation.groupBy({
        by: ["retailerId"],
        where: withGa300({ activationDate: { gte: fromDate, lt: rangeEnd } }),
        _count: { _all: true },
      }),
      prisma.gaActivation.groupBy({
        by: ["retailerId"],
        where: withSimSwap({ activationDate: { gte: fromDate, lt: rangeEnd } }),
        _count: { _all: true },
      }),
      // SSO is a per-calendar-month rule. When the selected range sits inside a
      // single month the per-retailer totals above already answer it, so the
      // extra day-level grouping is only issued for multi-month ranges.
      targetMonths.length > 1
        ? prisma.gaActivation.groupBy({
            by: ["retailerId", "activationDate"],
            where: withStandardGa({ activationDate: { gte: fromDate, lt: rangeEnd } }),
            _count: { _all: true },
          })
        : Promise.resolve([]),
      dailyStart && dailyEnd
        ? prisma.gaActivation.findMany({
            where: { activationDate: { gte: dailyStart, lt: dailyEnd } },
            select: {
              retailerId: true,
              ...GA_CLASSIFICATION_SELECT,
              retailer: {
                select: {
                  retailerCode: true,
                  retailerName: true,
                  employeeId: true,
                  employee: {
                    select: {
                      name: true,
                      rsoMsisdn: true,
                      supervisor: { select: { name: true } },
                    },
                  },
                },
              },
            },
          })
        : Promise.resolve([]),
      prisma.importBatch.findMany({
        where: { type: "GA" },
        orderBy: { uploadedAt: "desc" },
        take: 10,
        select: {
          id: true,
          fileName: true,
          uploadedAt: true,
          businessDate: true,
          totalRows: true,
          successRows: true,
          failedRows: true,
          duplicateRows: true,
          status: true,
        },
      }),
    ]);

    const retailerMap = new Map(retailers.map((r) => [r.id, r]));
    const employeeAgg = new Map<string, ReturnType<typeof emptyGaBreakdown>>();
    const aggFor = (employeeId: string) => {
      const current = employeeAgg.get(employeeId) || emptyGaBreakdown();
      employeeAgg.set(employeeId, current);
      return current;
    };

    const standardByRetailer = new Map<string, number>();
    for (const [groups, bucket] of [
      [ga170Groups, "ga170"],
      [ga300Groups, "ga300"],
      [swapGroups, "simSwap"],
    ] as const) {
      for (const group of groups) {
        const employeeId = retailerMap.get(group.retailerId)?.employeeId;
        if (!employeeId) continue;
        const count = group._count._all;
        const agg = aggFor(employeeId);
        agg[bucket] += count;
        if (bucket !== "simSwap") {
          agg.total += count;
          standardByRetailer.set(group.retailerId, (standardByRetailer.get(group.retailerId) || 0) + count);
        }
      }
    }

    // retailerId|YYYY-MM -> standard GA count, for the per-month SSO rule.
    const retailerMonthlyCount = new Map<string, number>();
    if (targetMonths.length > 1) {
      for (const group of monthlyStandardByDay) {
        const key = `${group.retailerId}|${group.activationDate.toISOString().slice(0, 7)}`;
        retailerMonthlyCount.set(key, (retailerMonthlyCount.get(key) || 0) + group._count._all);
      }
    } else {
      for (const [retailerId, count] of standardByRetailer) {
        retailerMonthlyCount.set(`${retailerId}|single`, count);
      }
    }

    const ssoByEmployee = new Map<string, number>();
    for (const [key, count] of retailerMonthlyCount) {
      const retailer = retailerMap.get(key.slice(0, key.lastIndexOf("|")));
      if (!retailer?.employeeId) continue;
      if (!isSsoComplete(retailer.simSeller, count)) continue;
      ssoByEmployee.set(retailer.employeeId, (ssoByEmployee.get(retailer.employeeId) || 0) + 1);
    }

    const rows = employees.map((employee) => {
      const ga = employeeAgg.get(employee.id) || emptyGaBreakdown();
      const target = employee.targets.reduce((a, x) => ({ ga: a.ga + x.gaTarget, sso: a.sso + x.ssoTarget }), {
        ga: 0,
        sso: 0,
      });
      return {
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        name: employee.name,
        rsoMsisdn: employee.rsoMsisdn,
        supervisor: employee.supervisor?.name ?? "Unassigned",
        retailerCount: employee._count.retailers,
        ga150: ga.ga170,
        ga300: ga.ga300,
        simSwap: ga.simSwap,
        gaAchieved: ga.total,
        gaTarget: target.ga,
        gaPercent: target.ga ? Number(((ga.total / target.ga) * 100).toFixed(1)) : 0,
        ssoAchieved: ssoByEmployee.get(employee.id) ?? 0,
        ssoTarget: target.sso,
      };
    });

    type DailyRetailerRow = ReturnType<typeof emptyGaBreakdown> & {
      retailerCode: string;
      retailerName: string;
      employee: string;
      rsoMsisdn: string;
      supervisor: string;
    };
    const dailyMap = new Map<string, DailyRetailerRow>();

    for (const activation of dailyActivations) {
      const info = activation.retailer;
      const current: DailyRetailerRow = dailyMap.get(activation.retailerId) || {
        retailerCode: info.retailerCode,
        retailerName: info.retailerName || "",
        employee: info.employee?.name || "Unassigned",
        rsoMsisdn: info.employee?.rsoMsisdn || "",
        supervisor: info.employee?.supervisor?.name || "Unassigned",
        ...emptyGaBreakdown(),
      };
      addGaActivation(current, activation);
      dailyMap.set(activation.retailerId, current);
    }

    // API contract unchanged: the 170 bucket is still published as `ga150`.
    const retailerDaily = [...dailyMap.values()]
      .map(({ ga170, unknown, ...rest }) => ({ ...rest, ga150: ga170, unknown }))
      .sort((a, b) => b.total - a.total || b.simSwap - a.simSwap || a.retailerCode.localeCompare(b.retailerCode));

    return NextResponse.json({
      month: start,
      range: {
        from: fromDate.toISOString().slice(0, 10),
        to: new Date(rangeEnd.getTime() - 86400000).toISOString().slice(0, 10),
      },
      selectedDate: dailyStart?.toISOString().slice(0, 10) || null,
      rows,
      retailerDaily,
      importHistory,
    });
  } catch (error) {
    console.error(error);
    const e = apiError(error, "Failed to load GA summary.");
    return NextResponse.json({ error: e.error }, { status: e.status });
  }
}

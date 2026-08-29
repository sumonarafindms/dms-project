import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { withStandardGa } from "./business-rules";
import { compare, endExclusive, startOf, windowsFor } from "./comparison";
import type { Comparison, ComparisonKind, ComparisonWindows } from "./comparison";

/**
 * Period-over-period figures for the metrics that arrive daily.
 *
 * ## Why each metric has its OWN anchor date
 *
 * The obvious design is one anchor for all three — "the latest day with data"
 * — and it is wrong here. The feeds are uploaded independently: GA may be in
 * for the 29th while C2S is only in to the 28th. A shared anchor of the 29th
 * would compare C2S's empty 29th against a full 28th and report a total
 * collapse, every morning, until someone uploaded the file.
 *
 * So each metric finds the newest date it actually has and compares from
 * there, and each card carries the dates it used. Two cards may name different
 * days; that is the truth, and it is more useful than a tidy row of matching
 * labels that quietly lies about one of them.
 *
 * ## Query cost
 *
 * Three "latest date" lookups plus two aggregates per metric — nine queries,
 * constant whatever the number of retailers or rows. Nothing here loops over
 * a result set.
 */

export type MetricKey = "GA" | "C2C" | "C2S";

export type MetricComparison = {
  metric: MetricKey;
  label: string;
  unit: string;
  /** Null when this metric has no data at all yet. */
  windows: ComparisonWindows | null;
  comparison: Comparison;
};

const scope = (employeeIds?: string[]) =>
  employeeIds && employeeIds.length ? { retailer: { employeeId: { in: employeeIds } } } : {};

/** Latest date that has a row for this scope, as YYYY-MM-DD, or null. */
async function latestGaDate(employeeIds?: string[]) {
  const row = await prisma.gaActivation.findFirst({
    where: withStandardGa(scope(employeeIds)),
    orderBy: { activationDate: "desc" },
    select: { activationDate: true },
  });
  return row ? row.activationDate.toISOString().slice(0, 10) : null;
}

async function latestC2Date(table: "c2cRecord" | "c2sRecord", employeeIds?: string[]) {
  // C2C and C2S have identical shapes but distinct Prisma where types, so the
  // filter is built once per branch rather than cast across them.
  const row =
    table === "c2cRecord"
      ? await prisma.c2cRecord.findFirst({
          where: scope(employeeIds),
          orderBy: { date: "desc" },
          select: { date: true },
        })
      : await prisma.c2sRecord.findFirst({
          where: scope(employeeIds),
          orderBy: { date: "desc" },
          select: { date: true },
        });
  return row ? row.date.toISOString().slice(0, 10) : null;
}

const empty = (metric: MetricKey, label: string, unit: string): MetricComparison => ({
  metric,
  label,
  unit,
  windows: null,
  comparison: compare(0, 0),
});

/**
 * @param kind        day / week / month.
 * @param employeeIds Restrict to these RSOs. Omit for the whole company.
 */
export async function performanceComparison(kind: ComparisonKind, employeeIds?: string[]) {
  const [gaAnchor, c2cAnchor, c2sAnchor] = await Promise.all([
    latestGaDate(employeeIds),
    latestC2Date("c2cRecord", employeeIds),
    latestC2Date("c2sRecord", employeeIds),
  ]);

  const gaWindows = gaAnchor ? windowsFor(kind, gaAnchor) : null;
  const c2cWindows = c2cAnchor ? windowsFor(kind, c2cAnchor) : null;
  const c2sWindows = c2sAnchor ? windowsFor(kind, c2sAnchor) : null;

  const gaCount = (w: ComparisonWindows["current"]) =>
    prisma.gaActivation.count({
      where: withStandardGa({ ...scope(employeeIds), activationDate: { gte: startOf(w), lt: endExclusive(w) } }),
    });

  const c2Sum = (table: "c2cRecord" | "c2sRecord", w: ComparisonWindows["current"]) => {
    const date = { gte: startOf(w), lt: endExclusive(w) };
    return table === "c2cRecord"
      ? prisma.c2cRecord.aggregate({ where: { ...scope(employeeIds), date }, _sum: { amount: true } })
      : prisma.c2sRecord.aggregate({ where: { ...scope(employeeIds), date }, _sum: { amount: true } });
  };

  const [gaNow, gaPrev, c2cNow, c2cPrev, c2sNow, c2sPrev] = await Promise.all([
    gaWindows ? gaCount(gaWindows.current) : Promise.resolve(0),
    gaWindows ? gaCount(gaWindows.previous) : Promise.resolve(0),
    c2cWindows ? c2Sum("c2cRecord", c2cWindows.current) : Promise.resolve(null),
    c2cWindows ? c2Sum("c2cRecord", c2cWindows.previous) : Promise.resolve(null),
    c2sWindows ? c2Sum("c2sRecord", c2sWindows.current) : Promise.resolve(null),
    c2sWindows ? c2Sum("c2sRecord", c2sWindows.previous) : Promise.resolve(null),
  ]);

  const amount = (r: { _sum: { amount: Prisma.Decimal | null } } | null) => Number(r?._sum.amount ?? 0);

  const metrics: MetricComparison[] = [
    gaWindows
      ? { metric: "GA", label: "GA", unit: "", windows: gaWindows, comparison: compare(gaNow, gaPrev) }
      : empty("GA", "GA", ""),
    c2cWindows
      ? {
          metric: "C2C",
          label: "C2C",
          unit: "৳",
          windows: c2cWindows,
          comparison: compare(amount(c2cNow), amount(c2cPrev)),
        }
      : empty("C2C", "C2C", "৳"),
    c2sWindows
      ? {
          metric: "C2S",
          label: "C2S",
          unit: "৳",
          windows: c2sWindows,
          comparison: compare(amount(c2sNow), amount(c2sPrev)),
        }
      : empty("C2S", "C2S", "৳"),
  ];

  return { kind, metrics };
}

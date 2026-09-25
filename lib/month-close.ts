/**
 * v206 — closed months, read from the database. The rules are
 * lib/month-close-rules.ts; this is what every write route asks.
 */

import { prisma } from "./prisma";
import { paisa } from "./stock";
import { cashBookGaps } from "./cash-book";
import { closedMessage, closedOnOrAfter, monthDays, monthLabel, monthOfYmd } from "./month-close-rules";
import type { MonthChecks, MonthSnapshot } from "./month-close-types";

export async function closedMonths(): Promise<string[]> {
  const rows = await prisma.monthClose.findMany({ select: { month: true }, orderBy: { month: "asc" } });
  return rows.map((r) => r.month);
}

const ymdOf = (d: string | Date) => (typeof d === "string" ? d : d.toISOString().slice(0, 10));

/**
 * The refusal for a write touching any of these dates, or null when every one
 * of them is in an open month. One query, whatever the number of dates.
 */
export async function lockedFor(dates: readonly (string | Date | null | undefined)[]): Promise<string | null> {
  const months = [...new Set(dates.filter(Boolean).map((d) => monthOfYmd(ymdOf(d as string | Date))))];
  if (!months.length) return null;
  const hit = await prisma.monthClose.findFirst({
    where: { month: { in: months } },
    select: { month: true },
    orderBy: { month: "asc" },
  });
  return hit ? closedMessage(hit.month) : null;
}

/**
 * An opening position is part of every figure after its date, so it is
 * refused once any month from its own onward is closed — changing it would
 * move a closed month's brought-forward.
 */
export async function openingLockedFor(dates: readonly (string | Date | null | undefined)[]) {
  const list = dates.filter(Boolean).map((d) => ymdOf(d as string | Date));
  if (!list.length) return null;
  const earliest = list.sort()[0];
  const hit = closedOnOrAfter(await closedMonths(), earliest);
  return hit
    ? `${monthLabel(hit)} is closed, and an opening dated ${earliest} is part of its figures. Admin can reopen it.`
    : null;
}

export type { MonthSnapshot } from "./month-close-types";

type Agg = { kind: string; value: string | number | null };

export async function monthSnapshot(ym: string): Promise<MonthSnapshot> {
  const { from, to } = monthDays(ym);
  const range = { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) };
  const [moves, deposits, expenses, lifting, closes] = await Promise.all([
    prisma.$queryRaw<Agg[]>`
      SELECT "kind"::text AS kind, SUM("qty" * "unitPrice") AS value
        FROM "StockMovement"
       WHERE "date" >= ${range.gte} AND "date" <= ${range.lte} AND "kind" IN ('GIVEN', 'RETURNED')
       GROUP BY 1`,
    prisma.cashDeposit.aggregate({ where: { date: range }, _sum: { cash: true, bank: true } }),
    prisma.expense.groupBy({ by: ["paidFrom"], where: { date: range }, _sum: { amount: true } }),
    prisma.$queryRaw<{ value: string | number | null }[]>`
      SELECT SUM("qty" * "unitCost") AS value FROM "Lifting"
       WHERE "date" >= ${range.gte} AND "date" <= ${range.lte}`,
    prisma.dayClose.findMany({ where: { date: range }, select: { counted: true, expected: true } }),
  ]);
  const v = (k: string) => paisa(Number(moves.find((m) => m.kind === k)?.value || 0));
  const e = (k: string) => paisa(Number(expenses.find((x) => x.paidFrom === k)?._sum.amount || 0));
  return {
    given: v("GIVEN"),
    returned: v("RETURNED"),
    cash: paisa(Number(deposits._sum.cash || 0)),
    bank: paisa(Number(deposits._sum.bank || 0)),
    expensesCash: e("CASH"),
    expensesBank: e("BANK"),
    lifting: paisa(Number(lifting[0]?.value || 0)),
    outstanding: await outstandingAt(to),
    daysClosed: closes.length,
    variance: paisa(closes.reduce((s, c) => s + Number(c.counted) - Number(c.expected), 0)),
  };
}

/** The company's total due at the end of a day: openings + given − returned − deposits, up to it. */
async function outstandingAt(to: string) {
  const end = new Date(`${to}T00:00:00.000Z`);
  const [moves, deposits, openings] = await Promise.all([
    prisma.$queryRaw<Agg[]>`
      SELECT "kind"::text AS kind, SUM("qty" * "unitPrice") AS value
        FROM "StockMovement" WHERE "date" <= ${end} AND "kind" IN ('GIVEN', 'RETURNED') GROUP BY 1`,
    prisma.cashDeposit.aggregate({ where: { date: { lte: end } }, _sum: { cash: true, bank: true } }),
    prisma.stockOpening.aggregate({ _sum: { openingDue: true } }),
  ]);
  const v = (k: string) => Number(moves.find((m) => m.kind === k)?.value || 0);
  return paisa(
    Number(openings._sum.openingDue || 0) +
      v("GIVEN") -
      v("RETURNED") -
      Number(deposits._sum.cash || 0) -
      Number(deposits._sum.bank || 0),
  );
}

export type MonthRow = {
  month: string;
  closed: { byName: string; at: string; note: string | null; snapshot: MonthSnapshot } | null;
  /** Anything recorded in the month at all. */
  entries: number;
};

/** The months that have anything in them, newest first, with their close. */
export async function monthRows(): Promise<MonthRow[]> {
  const [counts, closes] = await Promise.all([
    prisma.$queryRaw<{ month: string; n: bigint }[]>`
      SELECT to_char("date", 'YYYY-MM') AS month, COUNT(*) AS n FROM (
        SELECT "date" FROM "StockMovement" WHERE "kind" <> 'OPENING'
        UNION ALL SELECT "date" FROM "CashDeposit"
        UNION ALL SELECT "date" FROM "Expense"
        UNION ALL SELECT "date" FROM "Lifting"
        UNION ALL SELECT "date" FROM "CashMove"
      ) t GROUP BY 1`,
    prisma.monthClose.findMany(),
  ]);
  const byMonth = new Map<string, MonthRow>();
  for (const c of counts) byMonth.set(c.month, { month: c.month, closed: null, entries: Number(c.n) });
  for (const c of closes)
    byMonth.set(c.month, {
      month: c.month,
      entries: byMonth.get(c.month)?.entries ?? 0,
      closed: {
        byName: c.closedByName,
        at: c.closedAt.toISOString(),
        note: c.note,
        snapshot: c.snapshot as unknown as MonthSnapshot,
      },
    });
  return [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month));
}

/** What to look at before closing: cash days never counted, and counts that changed since. */
export async function monthCloseChecks(ym: string): Promise<MonthChecks> {
  const { from, to } = monthDays(ym);
  const gaps = await cashBookGaps(from, to);
  return { openCashDays: gaps.open, changedCashDays: gaps.changed };
}

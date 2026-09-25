/**
 * v206 — the Cash Book: the house's cash box, day by day, read from the rows
 * the rest of the app already writes. The arithmetic is lib/cash-book-rules.ts.
 */

import { prisma } from "./prisma";
import { listHolders, holderKey } from "./stock-data";
import { paisa, type HolderType } from "./stock";
import { expenseLabel, type ExpenseCategory } from "./lifting";
import {
  CASH_MOVE_LABEL,
  cashLedger,
  cashMoveDir,
  type CashMoveKind,
  type DayFlow,
  type Denominations,
  type LedgerDay,
  type StoredClose,
} from "./cash-book-rules";
import type { CashBookDay } from "./cash-book-types";

const at = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const ymdOf = (d: Date) => d.toISOString().slice(0, 10);

/** Every day from `from` to `to`, inclusive. */
export function daysBetweenInclusive(from: string, to: string) {
  const out: string[] = [];
  for (let d = at(from); d <= at(to); d = new Date(d.getTime() + 86_400_000)) out.push(ymdOf(d));
  return out;
}

const toStored = (c: {
  date: Date;
  openingCash: unknown;
  openingTyped: boolean;
  cashIn: unknown;
  cashOut: unknown;
  expected: unknown;
  counted: unknown;
}): StoredClose => ({
  date: ymdOf(c.date),
  openingCash: Number(c.openingCash),
  openingTyped: c.openingTyped,
  cashIn: Number(c.cashIn),
  cashOut: Number(c.cashOut),
  expected: Number(c.expected),
  counted: Number(c.counted),
});

/** The cash box's movement per day, in four grouped queries. */
export async function cashFlows(from: string, to: string): Promise<Map<string, DayFlow>> {
  const range = { gte: at(from), lte: at(to) };
  const [deposits, expenses, moves] = await Promise.all([
    prisma.cashDeposit.groupBy({ by: ["date"], where: { date: range, cash: { gt: 0 } }, _sum: { cash: true } }),
    prisma.expense.groupBy({ by: ["date"], where: { date: range, paidFrom: "CASH" }, _sum: { amount: true } }),
    prisma.cashMove.groupBy({ by: ["date", "kind"], where: { date: range }, _sum: { amount: true } }),
  ]);
  const flows = new Map<string, DayFlow>();
  const of = (d: Date) => {
    const k = ymdOf(d);
    let f = flows.get(k);
    if (!f) flows.set(k, (f = { date: k, deposits: 0, movesIn: 0, expenses: 0, movesOut: 0 }));
    return f;
  };
  for (const r of deposits) of(r.date).deposits = paisa(Number(r._sum.cash || 0));
  for (const r of expenses) of(r.date).expenses = paisa(Number(r._sum.amount || 0));
  for (const r of moves) {
    const f = of(r.date);
    const v = Number(r._sum.amount || 0);
    if (cashMoveDir(r.kind as CashMoveKind) === "in") f.movesIn = paisa(f.movesIn + v);
    else f.movesOut = paisa(f.movesOut + v);
  }
  return flows;
}

/**
 * The ledger for [from, to]. It starts from the last close BEFORE `from`
 * and walks every day since, so a count carried across unclosed days picks
 * up what moved on them.
 */
export async function cashBookLedger(from: string, to: string): Promise<LedgerDay[]> {
  const seedRow = await prisma.dayClose.findFirst({ where: { date: { lt: at(from) } }, orderBy: { date: "desc" } });
  const seed = seedRow ? toStored(seedRow) : null;
  const walkFrom = seed ? ymdOf(new Date(at(seed.date).getTime() + 86_400_000)) : from;
  const [flows, closeRows] = await Promise.all([
    cashFlows(walkFrom, to),
    prisma.dayClose.findMany({ where: { date: { gte: at(walkFrom), lte: at(to) } } }),
  ]);
  const closes = new Map(closeRows.map((c) => [ymdOf(c.date), toStored(c)]));
  return cashLedger(daysBetweenInclusive(walkFrom, to), flows, closes, seed).filter((d) => d.date >= from);
}

export type { CashBookDay, CashBookLine } from "./cash-book-types";

export async function cashBookDay(date: string): Promise<CashBookDay> {
  const d = at(date);
  const [[ledger], deposits, expenses, moves, close] = await Promise.all([
    cashBookLedger(date, date),
    prisma.cashDeposit.findMany({
      where: { date: d },
      select: { holderType: true, holderId: true, cash: true, bank: true, bankRef: true },
    }),
    prisma.expense.findMany({
      where: { date: d },
      select: { id: true, category: true, label: true, amount: true, paidFrom: true, payee: true, note: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.cashMove.findMany({ where: { date: d }, orderBy: { createdAt: "asc" } }),
    prisma.dayClose.findUnique({ where: { date: d } }),
  ]);

  const names = new Map<string, string>();
  if (deposits.length) {
    const holders = await listHolders({ holders: null, self: null, canWrite: false });
    for (const h of holders) names.set(holderKey(h.type, h.id), h.name);
  }
  const who = (t: string, id: string) => names.get(holderKey(t as HolderType, id)) ?? "Unknown person";

  return {
    ...ledger,
    deposits: deposits
      .filter((r) => Number(r.cash) > 0)
      .map((r) => ({ label: who(r.holderType, r.holderId), sub: r.holderType, amount: Number(r.cash) }))
      .sort((a, b) => b.amount - a.amount),
    expenses: expenses
      .filter((e) => e.paidFrom === "CASH")
      .map((e) => ({
        id: e.id,
        label: expenseLabel({ category: e.category as ExpenseCategory, label: e.label }),
        sub: e.payee || e.note,
        amount: Number(e.amount),
      })),
    movesIn: moves
      .filter((m) => cashMoveDir(m.kind as CashMoveKind) === "in")
      .map((m) => ({
        id: m.id,
        kind: m.kind as CashMoveKind,
        label: CASH_MOVE_LABEL[m.kind as CashMoveKind],
        sub: m.note,
        amount: Number(m.amount),
      })),
    movesOut: moves
      .filter((m) => cashMoveDir(m.kind as CashMoveKind) === "out")
      .map((m) => ({
        id: m.id,
        kind: m.kind as CashMoveKind,
        label: CASH_MOVE_LABEL[m.kind as CashMoveKind],
        sub: m.note,
        amount: Number(m.amount),
      })),
    bankDeposits: paisa(deposits.reduce((s, r) => s + Number(r.bank), 0)),
    bankExpenses: paisa(expenses.filter((e) => e.paidFrom === "BANK").reduce((s, e) => s + Number(e.amount), 0)),
    detail: close
      ? {
          denominations: (close.denominations ?? {}) as Denominations,
          note: close.note,
          closedByName: close.closedByName,
          closedAt: close.closedAt.toISOString(),
        }
      : null,
  };
}

/** Days in a window that had cash moving and were never closed, or were closed and changed since. */
export async function cashBookGaps(from: string, to: string) {
  const days = await cashBookLedger(from, to);
  return {
    days,
    open: days.filter((d) => !d.close && (d.cashIn > 0 || d.cashOut > 0)).map((d) => d.date),
    changed: days.filter((d) => d.changed).map((d) => d.date),
  };
}

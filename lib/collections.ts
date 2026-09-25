/**
 * v206 — the Collection dashboard: for one month, what went out to each
 * person and what came back in, day by day and person by person.
 *
 * The owner picked it from the Accounts list ("Protidin koto maal deya holo
 * ar koto taka uthlo").
 *
 * Every figure is the ledger's own: goods at the price written into each line
 * (v193), money from CashDeposit, and a sale is never a collection. The
 * "collection rate" is money in ÷ goods out, net of returns, for the month —
 * above 100% means the person also paid down an older due.
 *
 * A team's goods and money are real totals and are shown; a team's DUE is
 * not a sum anybody owes (lib/stock.ts), so the closing total appears only
 * for a viewer whose scope is the whole company.
 */

import { prisma } from "./prisma";
import { holderKey, listHolders, type StockScope } from "./stock-data";
import { paisa, type HolderType } from "./stock";
import { monthDays } from "./month-close-rules";
import { daysBetweenInclusive } from "./cash-book";
import type { CollectionDay, CollectionRow, Collections } from "./collections-types";
import { collectionRate } from "./collections-rate";

export type { CollectionDay, CollectionRow, Collections } from "./collections-types";

type MoveAgg = { holderType: string; holderId: string; date?: Date; kind: string; value: string | number | null };

export { collectionRate } from "./collections-rate";

export async function collections(scope: StockScope, month: string, today: string): Promise<Collections> {
  const { from, to: monthEnd } = monthDays(month);
  const to = monthEnd > today ? today : monthEnd;
  const fromAt = new Date(`${from}T00:00:00.000Z`);
  const toAt = new Date(`${to}T00:00:00.000Z`);

  const [holders, before, inMonth, depBefore, depIn, openings] = await Promise.all([
    listHolders(scope),
    prisma.$queryRaw<MoveAgg[]>`
      SELECT "holderType"::text AS "holderType", "holderId", "kind"::text AS kind, SUM("qty" * "unitPrice") AS value
        FROM "StockMovement"
       WHERE "date" < ${fromAt} AND "kind" IN ('GIVEN', 'RETURNED')
       GROUP BY 1, 2, 3`,
    prisma.$queryRaw<MoveAgg[]>`
      SELECT "holderType"::text AS "holderType", "holderId", "date", "kind"::text AS kind, SUM("qty" * "unitPrice") AS value
        FROM "StockMovement"
       WHERE "date" >= ${fromAt} AND "date" <= ${toAt} AND "kind" IN ('GIVEN', 'RETURNED')
       GROUP BY 1, 2, 3, 4`,
    prisma.cashDeposit.groupBy({
      by: ["holderType", "holderId"],
      where: { date: { lt: fromAt } },
      _sum: { cash: true, bank: true },
    }),
    prisma.cashDeposit.findMany({
      where: { date: { gte: fromAt, lte: toAt } },
      select: { holderType: true, holderId: true, date: true, cash: true, bank: true },
    }),
    prisma.stockOpening.findMany({ select: { holderType: true, holderId: true, openingDue: true } }),
  ]);

  const allowed = (t: string, id: string) =>
    scope.holders === null || scope.holders.has(holderKey(t as HolderType, id));
  const k = (t: string, id: string) => `${t}:${id}`;

  const bf = new Map<string, number>();
  const add = (m: Map<string, number>, key: string, v: number) => m.set(key, (m.get(key) || 0) + v);
  for (const o of openings) add(bf, k(o.holderType, o.holderId), Number(o.openingDue || 0));
  for (const r of before) add(bf, k(r.holderType, r.holderId), (r.kind === "GIVEN" ? 1 : -1) * Number(r.value || 0));
  for (const d of depBefore)
    add(bf, k(d.holderType, d.holderId), -(Number(d._sum.cash || 0) + Number(d._sum.bank || 0)));

  const given = new Map<string, number>(),
    returned = new Map<string, number>(),
    cash = new Map<string, number>(),
    bank = new Map<string, number>(),
    lastPaid = new Map<string, string>();
  const days = new Map<string, CollectionDay>(
    daysBetweenInclusive(from, to).map((d) => [d, { date: d, given: 0, returned: 0, collected: 0 }]),
  );
  for (const r of inMonth) {
    if (!allowed(r.holderType, r.holderId)) continue;
    const v = Number(r.value || 0);
    const day = days.get(r.date!.toISOString().slice(0, 10));
    if (r.kind === "GIVEN") {
      add(given, k(r.holderType, r.holderId), v);
      if (day) day.given = paisa(day.given + v);
    } else {
      add(returned, k(r.holderType, r.holderId), v);
      if (day) day.returned = paisa(day.returned + v);
    }
  }
  for (const d of depIn) {
    if (!allowed(d.holderType, d.holderId)) continue;
    const key = k(d.holderType, d.holderId);
    const c = Number(d.cash || 0),
      b = Number(d.bank || 0);
    add(cash, key, c);
    add(bank, key, b);
    const ymd = d.date.toISOString().slice(0, 10);
    if (c + b > 0 && (lastPaid.get(key) ?? "") < ymd) lastPaid.set(key, ymd);
    const day = days.get(ymd);
    if (day) day.collected = paisa(day.collected + c + b);
  }

  const rows: CollectionRow[] = holders.map((h) => {
    const key = k(h.type, h.id);
    const g = paisa(given.get(key) || 0),
      r = paisa(returned.get(key) || 0),
      c = paisa(cash.get(key) || 0),
      b = paisa(bank.get(key) || 0);
    const broughtForward = paisa(bf.get(key) || 0);
    const collected = paisa(c + b);
    return {
      key: holderKey(h.type, h.id),
      type: h.type,
      id: h.id,
      name: h.name,
      code: h.code,
      supervisorName: h.supervisorName,
      broughtForward,
      given: g,
      returned: r,
      cash: c,
      bank: b,
      collected,
      closing: paisa(broughtForward + g - r - collected),
      rate: collectionRate(collected, paisa(g - r)),
      lastPaid: lastPaid.get(key) ?? null,
    };
  });

  const sum = (f: (r: CollectionRow) => number) => paisa(rows.reduce((s, r) => s + f(r), 0));
  const companyWide = scope.holders === null;
  const totals = {
    given: sum((r) => r.given),
    returned: sum((r) => r.returned),
    cash: sum((r) => r.cash),
    bank: sum((r) => r.bank),
    collected: sum((r) => r.collected),
    broughtForward: companyWide ? sum((r) => r.broughtForward) : null,
    closing: companyWide ? sum((r) => r.closing) : null,
  };
  return {
    month,
    from,
    to,
    companyWide,
    rows,
    days: [...days.values()],
    totals,
    rate: collectionRate(totals.collected, paisa(totals.given - totals.returned)),
  };
}

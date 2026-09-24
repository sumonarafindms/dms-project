/**
 * v203 — a person's statement for a period: the paper an RSO or BP is handed
 * at month end.
 *
 *   Brought forward   the due on the morning of the first day
 *   each day          given, returned, sold (for the record), cash, bank,
 *                     and the due after that day
 *   Carried forward   the due at the end of the last day
 *
 * The arithmetic is the ledger's own, and nothing else: due = opening due +
 * given − returned − cash − bank, running, per person (lib/stock.ts). A sale
 * is shown and never subtracted. An OPENING stock line is the ledger's
 * starting stock, already inside the opening due, so it never moves the due.
 *
 * Pure and Prisma-free, so the tests can hold it to the ledger's figures.
 */

import { lineValue, paisa, type MoveKind } from "./stock";

export type StatementMovement = { kind: MoveKind; productId: string; qty: number; unitPrice: number; date: string };
export type StatementDeposit = { date: string; cash: number; bank: number; bankRef?: string | null };
export type StatementProduct = { id: string; name: string; money: boolean };

export type StatementItem = { productId: string; name: string; qty: number; value: number; money: boolean };

export type StatementDay = {
  date: string;
  given: StatementItem[];
  returned: StatementItem[];
  sold: StatementItem[];
  givenValue: number;
  returnedValue: number;
  soldValue: number;
  cash: number;
  bank: number;
  bankRef: string | null;
  /** The due at the end of this day. */
  due: number;
};

export type Statement = {
  from: string;
  to: string;
  broughtForward: number;
  days: StatementDay[];
  totals: { given: number; returned: number; sold: number; cash: number; bank: number };
  /** Per product over the period: how many were given, returned and reported sold. */
  products: { productId: string; name: string; money: boolean; given: number; returned: number; sold: number }[];
  carriedForward: number;
};

export function buildStatement(input: {
  from: string;
  to: string;
  openingDue: number;
  movements: readonly StatementMovement[];
  deposits: readonly StatementDeposit[];
  products: readonly StatementProduct[];
}): Statement {
  const { from, to } = input;
  const product = new Map(input.products.map((p) => [p.id, p]));

  // Everything before the period, folded into the figure brought forward.
  let bf = input.openingDue;
  for (const m of input.movements) {
    if (m.date >= from) continue;
    if (m.kind === "GIVEN") bf += lineValue(m.qty, m.unitPrice);
    else if (m.kind === "RETURNED") bf -= lineValue(m.qty, m.unitPrice);
  }
  for (const d of input.deposits) if (d.date < from) bf -= d.cash + d.bank;
  const broughtForward = paisa(bf);

  // The period, one entry per day that has anything on it.
  const byDay = new Map<string, StatementDay>();
  const dayOf = (date: string) => {
    let d = byDay.get(date);
    if (!d) {
      d = {
        date,
        given: [],
        returned: [],
        sold: [],
        givenValue: 0,
        returnedValue: 0,
        soldValue: 0,
        cash: 0,
        bank: 0,
        bankRef: null,
        due: 0,
      };
      byDay.set(date, d);
    }
    return d;
  };
  const inPeriod = (date: string) => date >= from && date <= to;

  for (const m of input.movements) {
    if (!inPeriod(m.date) || m.kind === "OPENING" || m.qty <= 0) continue;
    const p = product.get(m.productId);
    const item: StatementItem = {
      productId: m.productId,
      name: p?.name ?? "Unknown product",
      qty: m.qty,
      value: lineValue(m.qty, m.unitPrice),
      money: p?.money ?? false,
    };
    const d = dayOf(m.date);
    if (m.kind === "GIVEN") {
      d.given.push(item);
      d.givenValue = paisa(d.givenValue + item.value);
    } else if (m.kind === "RETURNED") {
      d.returned.push(item);
      d.returnedValue = paisa(d.returnedValue + item.value);
    } else if (m.kind === "SOLD") {
      d.sold.push(item);
      d.soldValue = paisa(d.soldValue + item.value);
    }
  }
  for (const dep of input.deposits) {
    if (!inPeriod(dep.date) || (!(dep.cash > 0) && !(dep.bank > 0))) continue;
    const d = dayOf(dep.date);
    d.cash = paisa(d.cash + dep.cash);
    d.bank = paisa(d.bank + dep.bank);
    d.bankRef = dep.bankRef || d.bankRef;
  }

  const days = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  let running = broughtForward;
  const totals = { given: 0, returned: 0, sold: 0, cash: 0, bank: 0 };
  for (const d of days) {
    running = paisa(running + d.givenValue - d.returnedValue - d.cash - d.bank);
    d.due = running;
    totals.given = paisa(totals.given + d.givenValue);
    totals.returned = paisa(totals.returned + d.returnedValue);
    totals.sold = paisa(totals.sold + d.soldValue);
    totals.cash = paisa(totals.cash + d.cash);
    totals.bank = paisa(totals.bank + d.bank);
  }

  const perProduct = new Map<string, Statement["products"][number]>();
  for (const d of days)
    for (const [kind, items] of [
      ["given", d.given],
      ["returned", d.returned],
      ["sold", d.sold],
    ] as const)
      for (const it of items) {
        const row = perProduct.get(it.productId) ?? {
          productId: it.productId,
          name: it.name,
          money: it.money,
          given: 0,
          returned: 0,
          sold: 0,
        };
        row[kind] += it.qty;
        perProduct.set(it.productId, row);
      }
  const order = new Map(input.products.map((p, i) => [p.id, i]));

  return {
    from,
    to,
    broughtForward,
    days,
    totals,
    products: [...perProduct.values()].sort(
      (a, b) => (order.get(a.productId) ?? 1e9) - (order.get(b.productId) ?? 1e9),
    ),
    carriedForward: running,
  };
}

/** The statement as a WhatsApp message: the period's totals and where the due ends. */
export function statementMessage(s: Statement, who: { name: string; code?: string | null }) {
  const tk = (v: number) => `৳${Math.round(v).toLocaleString("en-US")}`;
  const dmy = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(2, 4)}`;
  const out: string[] = [];
  out.push(`📄 স্টেটমেন্ট — ${dmy(s.from)} থেকে ${dmy(s.to)}`);
  out.push(`নাম: ${who.name}${who.code ? ` (${who.code})` : ""}`);
  out.push("", `আগের বাকি: ${tk(s.broughtForward)}`);
  out.push(`➕ দেওয়া হয়েছে: ${tk(s.totals.given)}`);
  if (s.totals.returned) out.push(`➖ ফেরত: ${tk(s.totals.returned)}`);
  if (s.totals.cash) out.push(`➖ Cash জমা: ${tk(s.totals.cash)}`);
  if (s.totals.bank) out.push(`➖ Bank জমা: ${tk(s.totals.bank)}`);
  if (s.totals.sold) out.push(`🛒 বিক্রি (রিপোর্ট): ${tk(s.totals.sold)}`);
  out.push(
    "",
    s.carriedForward < 0
      ? `✅ ${dmy(s.to)} শেষে অগ্রিম জমা: ${tk(-s.carriedForward)}`
      : `🔴 ${dmy(s.to)} শেষে মোট বাকি: ${tk(s.carriedForward)}`,
  );
  out.push("", "ধন্যবাদ 🙏");
  return out.join("\n");
}

/**
 * One day, everything — the report Accounts sends every evening.
 *
 * The owner: *"accounts ar proti din report dite hoi.. je tar koto takar sell
 * hoice.. koto taka bank a gase and koto taka cash paice.. koto taka expanse a
 * gase.. ki ki expanse gase... scratch card koto takar sell.. sim koita and
 * koto takar sell... mane sob kicur report dite hoi"*.
 *
 * Every figure here is read from the same tables the rest of the module reads
 * and valued the same way — `qty × unitPrice` off the movement, never a lookup
 * through a product — so the day's report and the ledgers it summarises cannot
 * disagree.
 *
 * ## Two figures that look alike and are not
 *
 * **Sold** is what the field REPORTED selling that day. **Collected** is the
 * money that actually came in. They differ every day and the difference is
 * normal — somebody sells on Monday and deposits on Tuesday — so the report
 * shows both and never nets one against the other. Netting them would print a
 * "shortfall" for every day a deposit ran a day late.
 *
 * ## The drawer
 *
 * `cash in − cash expenses` is what the day did to the cash drawer, and
 * `bank in − bank expenses` to the account. That is the figure somebody counts
 * against at closing, so it is the last line of the report.
 */

import { prisma } from "./prisma";
import { paisa, PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABEL, isMoneyProduct, type ProductCategory } from "./stock";
import { EXPENSE_CATEGORY_LABEL, PAID_FROM_LABEL, type ExpenseCategory, type PaidFrom } from "./lifting";
import { fmtMoney, fmtNumber } from "./format";

export type DaySalesLine = {
  category: ProductCategory;
  label: string;
  /** Pieces; for iTopup this is Taka, and the screen says so. */
  qty: number;
  value: number;
  money: boolean;
};

export type DayProductLine = DaySalesLine & { product: string };

export type DayExpense = {
  category: ExpenseCategory;
  label: string;
  amount: number;
  paidFrom: PaidFrom;
  payee: string | null;
  note: string | null;
};

export type DayDepositor = { name: string; role: string; cash: number; bank: number };

export type DailyReport = {
  date: string;
  sold: { total: number; byCategory: DaySalesLine[]; byProduct: DayProductLine[] };
  given: { total: number; byCategory: DaySalesLine[] };
  returned: { total: number };
  collected: { cash: number; bank: number; total: number; depositors: DayDepositor[] };
  expenses: { cash: number; bank: number; total: number; items: DayExpense[] };
  /** What the day did to the drawer and the account. */
  net: { cash: number; bank: number; total: number };
  lifted: { qty: number; cost: number; lines: number };
  /** True when nothing at all was recorded for the day — an empty report, not a zero one. */
  empty: boolean;
};

const at = (s: string) => new Date(`${s}T00:00:00.000Z`);

function byCategory(rows: { category: string; qty: number; value: number }[]): DaySalesLine[] {
  const acc = new Map<ProductCategory, { qty: number; value: number }>();
  for (const r of rows) {
    const c = r.category as ProductCategory;
    const x = acc.get(c) || { qty: 0, value: 0 };
    x.qty += r.qty;
    x.value += r.value;
    acc.set(c, x);
  }
  return PRODUCT_CATEGORIES.filter((c) => acc.has(c)).map((c) => ({
    category: c,
    label: PRODUCT_CATEGORY_LABEL[c],
    qty: acc.get(c)!.qty,
    value: paisa(acc.get(c)!.value),
    money: isMoneyProduct(c),
  }));
}

export async function dailyReport(date: string): Promise<DailyReport> {
  const day = at(date);

  const [moves, deposits, expenses, lifts] = await Promise.all([
    prisma.$queryRaw<{ kind: string; category: string; subType: string; qty: string; value: string }[]>`
      SELECT m."kind"::text AS kind, p."category"::text AS category, p."subType" AS "subType",
             SUM(m."qty")::text AS qty,
             ROUND(SUM(m."qty" * m."unitPrice"), 2)::text AS value
        FROM "StockMovement" m JOIN "Product" p ON p."id" = m."productId"
       WHERE m."date" = ${day}::date AND m."kind" IN ('GIVEN', 'SOLD', 'RETURNED')
       GROUP BY 1, 2, 3`,
    prisma.cashDeposit.findMany({
      where: { date: day },
      select: { holderType: true, holderId: true, cash: true, bank: true },
    }),
    prisma.expense.findMany({
      where: { date: day },
      orderBy: [{ category: "asc" }, { createdAt: "asc" }],
      select: { category: true, amount: true, paidFrom: true, payee: true, note: true },
    }),
    // v199: purchases only. An opening count is where the godown started, not
    // something bought that day — go-live day read as one enormous lifting.
    prisma.lifting.aggregate({ where: { date: day, kind: "PURCHASE" }, _sum: { qty: true }, _count: true }),
  ]);

  const liftCost = await prisma.$queryRaw<{ v: string }[]>`
    SELECT COALESCE(ROUND(SUM("qty" * "unitCost"), 2), 0)::text AS v FROM "Lifting" WHERE "date" = ${day}::date AND "kind" = 'PURCHASE'`;

  const rowsOf = (kind: string) =>
    moves
      .filter((m) => m.kind === kind)
      .map((m) => ({ category: m.category, subType: m.subType, qty: Number(m.qty), value: Number(m.value) }));

  const soldRows = rowsOf("SOLD");
  const givenRows = rowsOf("GIVEN");
  const returnedRows = rowsOf("RETURNED");

  /* Names for the depositors, resolved in three small lookups rather than one per row. */
  const ids = (t: string) => deposits.filter((d) => d.holderType === t).map((d) => d.holderId);
  const [rsos, sups, bps] = await Promise.all([
    prisma.employee.findMany({ where: { id: { in: ids("RSO") } }, select: { id: true, name: true } }),
    prisma.supervisor.findMany({ where: { id: { in: ids("SUPERVISOR") } }, select: { id: true, name: true } }),
    prisma.retailer.findMany({
      where: { id: { in: ids("BP") } },
      select: { id: true, retailerCode: true, retailerName: true, bpName: true },
    }),
  ]);
  const nameOf = new Map<string, string>([
    ...rsos.map((r) => [`RSO:${r.id}`, r.name] as const),
    ...sups.map((s) => [`SUPERVISOR:${s.id}`, s.name] as const),
    ...bps.map((b) => [`BP:${b.id}`, b.bpName || b.retailerName || b.retailerCode] as const),
  ]);
  const ROLE: Record<string, string> = { RSO: "RSO", SUPERVISOR: "Supervisor", BP: "BP" };

  const depositors: DayDepositor[] = deposits
    .map((d) => ({
      name: nameOf.get(`${d.holderType}:${d.holderId}`) || "Unknown",
      role: ROLE[d.holderType] || d.holderType,
      cash: paisa(Number(d.cash)),
      bank: paisa(Number(d.bank)),
    }))
    .sort((a, b) => b.cash + b.bank - (a.cash + a.bank) || a.name.localeCompare(b.name));

  const cashIn = paisa(depositors.reduce((s, d) => s + d.cash, 0));
  const bankIn = paisa(depositors.reduce((s, d) => s + d.bank, 0));

  const items: DayExpense[] = expenses.map((e) => ({
    category: e.category as ExpenseCategory,
    label: EXPENSE_CATEGORY_LABEL[e.category as ExpenseCategory],
    amount: paisa(Number(e.amount)),
    paidFrom: e.paidFrom as PaidFrom,
    payee: e.payee,
    note: e.note,
  }));
  const cashOut = paisa(items.filter((e) => e.paidFrom === "CASH").reduce((s, e) => s + e.amount, 0));
  const bankOut = paisa(items.filter((e) => e.paidFrom === "BANK").reduce((s, e) => s + e.amount, 0));

  const soldTotal = paisa(soldRows.reduce((s, r) => s + r.value, 0));
  const givenTotal = paisa(givenRows.reduce((s, r) => s + r.value, 0));
  const returnedTotal = paisa(returnedRows.reduce((s, r) => s + r.value, 0));

  const byProduct: DayProductLine[] = soldRows
    .map((r) => ({
      product: r.subType,
      category: r.category as ProductCategory,
      label: PRODUCT_CATEGORY_LABEL[r.category as ProductCategory],
      qty: r.qty,
      value: paisa(r.value),
      money: isMoneyProduct(r.category as ProductCategory),
    }))
    .sort(
      (a, b) =>
        PRODUCT_CATEGORIES.indexOf(a.category) - PRODUCT_CATEGORIES.indexOf(b.category) ||
        a.product.localeCompare(b.product),
    );

  const empty = !moves.length && !deposits.length && !expenses.length && !lifts._count;

  return {
    date,
    sold: { total: soldTotal, byCategory: byCategory(soldRows), byProduct },
    given: { total: givenTotal, byCategory: byCategory(givenRows) },
    returned: { total: returnedTotal },
    collected: { cash: cashIn, bank: bankIn, total: paisa(cashIn + bankIn), depositors },
    expenses: { cash: cashOut, bank: bankOut, total: paisa(cashOut + bankOut), items },
    net: {
      cash: paisa(cashIn - cashOut),
      bank: paisa(bankIn - bankOut),
      total: paisa(cashIn + bankIn - cashOut - bankOut),
    },
    lifted: { qty: lifts._sum.qty || 0, cost: paisa(Number(liftCost[0]?.v || 0)), lines: lifts._count },
    empty,
  };
}

/**
 * The day as plain text, for pasting into a message.
 *
 * This is how the report actually leaves the building — Accounts sends it to
 * the owner at closing — so it is written to be read on a phone: short lines,
 * the totals first, one item per line, no table that a messaging app would
 * mangle. The cost of what we bought is deliberately NOT in it: this text gets
 * forwarded, and the buying price stays with Accounts, IT and Admin.
 */
export function dailySummaryText(r: DailyReport): string {
  const L: string[] = [];
  L.push(`Daily report — ${r.date}`);
  L.push("");
  L.push(`Sales: ${fmtMoney(r.sold.total)}`);
  for (const c of r.sold.byCategory)
    L.push(c.money ? `  ${c.label}: ${fmtMoney(c.value)}` : `  ${c.label}: ${fmtNumber(c.qty)} · ${fmtMoney(c.value)}`);
  L.push("");
  L.push(`Collected: ${fmtMoney(r.collected.total)}`);
  L.push(`  Cash: ${fmtMoney(r.collected.cash)}`);
  L.push(`  Bank: ${fmtMoney(r.collected.bank)}`);
  L.push("");
  L.push(`Expenses: ${fmtMoney(r.expenses.total)}`);
  for (const e of r.expenses.items)
    L.push(`  ${e.label}${e.note ? ` (${e.note})` : ""}: ${fmtMoney(e.amount)} · ${PAID_FROM_LABEL[e.paidFrom]}`);
  L.push("");
  L.push(`Net cash: ${fmtMoney(r.net.cash)}`);
  L.push(`Net bank: ${fmtMoney(r.net.bank)}`);
  L.push(`Net total: ${fmtMoney(r.net.total)}`);
  return L.join("\n");
}

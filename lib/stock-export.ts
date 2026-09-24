/**
 * Spreadsheet rows for the stock module.
 *
 * Every builder here reads through the SAME functions the pages render from —
 * `holderDues`, `houseBooks`, `expensesIn`, `simCheckRows` — so a file and the
 * screen it came from cannot disagree about a figure. That is the rule
 * lib/report-builders.ts already follows for the Reporting Center, and it is
 * why the exports there have never drifted.
 *
 * ## Two rules this module must not break
 *
 * **The export is the whole report, never the page on screen.** No paging, no
 * search. Somebody on page one who exports sixty rows and believes they have
 * the report is the failure mode.
 *
 * **The export carries the page's scope, not the caller's URL.** A supervisor
 * asking for the holder file gets their team; asking for the margin file gets
 * a 401. The route enforces it by asking the same functions the page asks, and
 * `tests/stock-export.smoke.test.ts` fails if a builder ever takes a role or a
 * scope it was handed rather than one it resolved.
 */

import { PAID_FROM_LABEL, expenseLabel, marginPercent } from "./lifting";
import { HOLDER_TYPE_LABEL, dueTone, isMoneyProduct } from "./stock";
import { expensesIn, godown, houseBooks, simCheckRows, type SimCheckScope } from "./lifting-data";
import { holderDues, holderPosition, holderStatement, findHolder, type StockScope } from "./stock-data";
import type { ExportRow } from "./report-builders";
import type { ReportRange } from "./report-range";

export type StockExport = { rows: ExportRow[]; filename: string; sheet: string };

const stamp = (r?: ReportRange) => (r ? `-${r.from}-to-${r.to}` : "");

/* ------------------------------------------------------------------ *
 * Who owes what
 * ------------------------------------------------------------------ */

/**
 * One row per holder: what they took, what came back, what they deposited,
 * what they owe.
 *
 * All-time, like the screen, because a due is a running balance — a ranged due
 * would answer a different question under the same word.
 */
export async function holderLedgerExport(scope: StockScope): Promise<StockExport> {
  const rows = await holderDues(scope);
  rows.sort((a, b) => b.due - a.due || a.name.localeCompare(b.name));
  return {
    sheet: "Dues",
    filename: "stock-dues",
    rows: rows.map((r) => ({
      Person: r.name,
      Role: HOLDER_TYPE_LABEL[r.type],
      Code: r.code ?? "",
      Supervisor: r.supervisorName ?? "",
      Given: r.givenValue,
      Returned: r.returnedValue,
      Sold: r.soldValue,
      Deposited: r.deposited,
      "iTopup out": r.topupInHand,
      Due: r.due,
      Status: dueTone(r.due) === "owing" ? "Due" : dueTone(r.due) === "over" ? "Overpaid" : "Settled",
    })),
  };
}

/** One holder's stock, product by product — what the ledger page shows. */
export async function holderStockExport(
  scope: StockScope,
  type: "RSO" | "SUPERVISOR" | "BP",
  id: string,
): Promise<StockExport | null> {
  const holder = await findHolder(type, id);
  if (!holder) return null;
  const pos = await holderPosition(holder);
  return {
    sheet: "Stock",
    filename: `stock-${holder.name.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}`,
    rows: pos.lines.map((l) => ({
      Person: holder.name,
      Product: l.product.subType,
      Unit: isMoneyProduct(l.product.category) ? "Taka" : (l.product.unitLabel ?? "pc"),
      Opening: l.opening,
      Given: l.given,
      Sold: l.sold,
      Returned: l.returned,
      "In hand": l.inHand,
      /*
       * What they are CARRYING it at — what came in less what went out, each
       * at its own price. Not today's catalogue price: that is the one figure
       * a price change could still have moved (v193).
       */
      "Carried at": l.carryPrice,
      Value: l.inHandValue,
    })),
  };
}

/**
 * v203: one person's statement for a period — brought forward, a row per day,
 * carried forward. The same figures as /stock/[type]/[id]/statement.
 */
export async function holderStatementExport(
  type: "RSO" | "SUPERVISOR" | "BP",
  id: string,
  from: string,
  to: string,
): Promise<StockExport | null> {
  const holder = await findHolder(type, id);
  if (!holder) return null;
  const s = await holderStatement(holder, from, to);
  const list = (items: { name: string; qty: number; money: boolean }[]) =>
    items.map((i) => (i.money ? `${i.name} ৳${i.qty}` : `${i.name} x ${i.qty}`)).join("; ");
  const rows: ExportRow[] = [
    {
      Date: `Brought forward (${from})`,
      Given: "",
      "Given items": "",
      Returned: "",
      "Returned items": "",
      Sold: "",
      Cash: "",
      Bank: "",
      "Bank ref": "",
      "Due after": s.broughtForward,
    },
    ...s.days.map((d) => ({
      Date: d.date,
      Given: d.givenValue,
      "Given items": list(d.given),
      Returned: d.returnedValue,
      "Returned items": list(d.returned),
      Sold: d.soldValue,
      Cash: d.cash,
      Bank: d.bank,
      "Bank ref": d.bankRef ?? "",
      "Due after": d.due,
    })),
    {
      Date: `Carried forward (${to})`,
      Given: s.totals.given,
      "Given items": "",
      Returned: s.totals.returned,
      "Returned items": "",
      Sold: s.totals.sold,
      Cash: s.totals.cash,
      Bank: s.totals.bank,
      "Bank ref": "",
      "Due after": s.carriedForward,
    },
  ];
  return {
    sheet: "Statement",
    filename: `statement-${holder.name.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}-${from}-to-${to}`,
    rows: s.days.length ? rows : [],
  };
}

/* ------------------------------------------------------------------ *
 * The house's books
 * ------------------------------------------------------------------ */

/**
 * Margin by product.
 *
 * Carries the buying price, so the route admits only the three roles the owner
 * allows to see it.
 *
 * A product with no lifting recorded shows **blank** margin cells rather than
 * zero. v194 learned that the hard way: a missing cost read as a cost of zero
 * made an entire sale value look like profit. A blank cell in a spreadsheet is
 * a question; a 0 is an answer, and it would be the wrong one.
 */
export async function marginExport(range: ReportRange): Promise<StockExport> {
  /*
   * v200: the godown columns are ALL-TIME, as the screen shows them. The
   * ranged books' "in godown" is lifted-in-range less given-in-range — a
   * figure with no meaning — and an October with no purchases exported
   * "In godown −500, Godown value −৳90,000".
   */
  const [books, all] = await Promise.all([houseBooks(range), godown()]);
  const now = new Map(all.map((l) => [l.product.id, l]));
  return {
    sheet: "Margin",
    filename: `stock-margin${stamp(range)}`,
    rows: books.lines
      .filter((l) => l.liftedQty || l.issuedQty || l.soldQty)
      .map((l) => ({
        Product: l.product.subType,
        Lifted: l.liftedQty,
        "Lifting cost": l.liftedCost,
        "Avg cost": l.hasCost ? l.avgCost : "",
        Issued: l.issuedQty,
        "Issued value": l.issuedValue,
        "Margin issued": l.hasCost ? l.marginIssued : "",
        Sold: l.soldQty,
        "Sold value": l.soldValue,
        "Margin sold": l.hasCost ? l.marginSold : "",
        "Margin %": l.hasCost ? (marginPercent(l.marginSold, l.soldValue) ?? "") : "",
        ...(() => {
          const g = now.get(l.product.id) ?? l;
          return { "In godown now": g.inGodown, "Godown value now": g.hasCost ? g.godownValue : "" };
        })(),
      })),
  };
}

export async function expenseExport(range: ReportRange): Promise<StockExport> {
  const rows = await expensesIn(range);
  return {
    sheet: "Expenses",
    filename: `expenses${stamp(range)}`,
    rows: rows.map((r) => ({
      Date: r.date,
      "What for": expenseLabel(r),
      "Paid from": PAID_FROM_LABEL[r.paidFrom],
      "Paid to": r.payee ?? "",
      Note: r.note ?? "",
      Amount: r.amount,
    })),
  };
}

/* ------------------------------------------------------------------ *
 * The SIM check
 * ------------------------------------------------------------------ */

/**
 * Given, activated, sold — the whole scope, worst first.
 *
 * No purchase price on it, so this one reaches supervisors and managers.
 * The caveat that lives under the screen travels with the file as a column
 * heading nobody can crop off: the gap is a question, not a charge.
 */
export async function simCheckExport(scope: SimCheckScope, range: ReportRange): Promise<StockExport> {
  const rows = await simCheckRows(scope, range);
  return {
    sheet: "SIM check",
    filename: `sim-check${stamp(range)}`,
    rows: rows
      .filter((r) => r.given || r.activated || r.sold)
      .map((r) => ({
        RSO: r.name,
        Code: r.code ?? "",
        Supervisor: r.supervisorName ?? "",
        Given: r.given,
        Activated: r.activated,
        "Reported sold": r.sold,
        "Activated not reported": r.unreported,
        // Blank, not 0: an unknown worth is a question, not an answer.
        "Worth (at issue price)": r.unreportedValue ?? "",
        "Given not activated": r.notActivated,
      })),
  };
}

/* ------------------------------------------------------------------ *
 * The day
 * ------------------------------------------------------------------ */

/**
 * The daily report as one sheet of line items: Section · Item · Qty · Amount.
 *
 * One uniform shape rather than several sheets, because it is the shape that
 * survives being forwarded, filtered and pasted into somebody else's file. The
 * purchase cost is included here — unlike the copy-to-message text — because
 * this file only leaves the route for the three roles allowed to see it.
 */
export async function dailyReportExport(date: string): Promise<StockExport> {
  const { dailyReport } = await import("./daily-report");
  const r = await dailyReport(date);
  /*
   * Nothing recorded is not a day of zeros. Returning no rows makes the route
   * answer 204 rather than a file full of "Total 0" lines, which would read as
   * "the day happened and nothing sold" — the empty-state rule the screen
   * already follows.
   */
  if (r.empty) return { sheet: "Daily report", filename: `daily-report-${r.date}`, rows: [] };
  const rows: ExportRow[] = [];
  const add = (Section: string, Item: string, Qty: number | "", Amount: number | "") =>
    rows.push({ Date: r.date, Section, Item, Qty, Amount });

  for (const p of r.sold.byProduct) add("Sold", p.product, p.money ? "" : p.qty, p.value);
  add("Sold", "Total", "", r.sold.total);
  for (const c of r.given.byCategory) add("Given out", c.label, c.money ? "" : c.qty, c.value);
  if (r.returned.total) add("Returned", "Total", "", r.returned.total);
  for (const d of r.collected.depositors) add("Collected", `${d.name} (${d.role})`, "", paisaSum(d.cash, d.bank));
  add("Collected", "Cash", "", r.collected.cash);
  add("Collected", "Bank", "", r.collected.bank);
  add("Collected", "Total", "", r.collected.total);
  for (const e of r.expenses.items)
    add(
      "Expense",
      `${e.label}${e.note ? ` — ${e.note}` : ""} (${e.paidFrom === "BANK" ? "Bank" : "Cash"})`,
      "",
      e.amount,
    );
  add("Expense", "Total", "", r.expenses.total);
  if (r.lifted.lines) add("Lifted", "From the company", r.lifted.qty, r.lifted.cost);
  add("Net", "Cash", "", r.net.cash);
  add("Net", "Bank", "", r.net.bank);
  add("Net", "Total", "", r.net.total);

  return { sheet: "Daily report", filename: `daily-report-${r.date}`, rows };
}

const paisaSum = (a: number, b: number) => Math.round((a + b) * 100) / 100;

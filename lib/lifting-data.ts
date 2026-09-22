/**
 * Reading the house's books, and the SIM check.
 *
 * The arithmetic is in lib/lifting.ts. This fetches rows and answers "who may
 * see a purchase price", which is a narrower question than the rest of the
 * stock module: the owner's ruling is that the company's cost stays with
 * Accounts, IT and Admin — *"Sudhu Accounts, IT ar Admin"*.
 */

import { prisma } from "./prisma";
import { managerScope } from "./manager-scope";
import { paisa, type ProductRow } from "./stock";
import {
  CHECKED_CATEGORY,
  bySuspicion,
  costBasis,
  expenseTotals,
  houseLines,
  profitOf,
  simCheck,
  type ExpenseCategory,
  type HouseLine,
  type IssuedRow,
  type LiftRow,
  type PaidFrom,
  type ProfitSummary,
  type SimCheck,
} from "./lifting";

/**
 * Who may see what the company charged us.
 *
 * Deliberately shorter than STOCK_WRITE_ROLES' neighbours: a manager may read
 * every RSO's due and still have no business knowing the buying price. Written
 * out here once so the three screens cannot each decide for themselves.
 */
export const BOOKS_WRITE_ROLES = ["ACCOUNTS"];
export const BOOKS_READ_ROLES = ["ACCOUNTS", "ADMIN", "IT"];

/** The SIM check carries no purchase price, so it reaches the field too. */
export const SIM_CHECK_ROLES = ["ACCOUNTS", "ADMIN", "IT", "MANAGER", "SUPERVISOR"];

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const at = (s: string) => new Date(`${s}T00:00:00.000Z`);

/* ------------------------------------------------------------------ *
 * Liftings
 * ------------------------------------------------------------------ */

export type LiftingEntry = {
  id: string;
  date: string;
  kind: "PURCHASE" | "OPENING";
  productId: string;
  productName: string;
  qty: number;
  unitCost: number;
  value: number;
  invoiceRef: string | null;
  note: string | null;
};

export async function recentLiftings(limit = 60): Promise<LiftingEntry[]> {
  const rows = await prisma.lifting.findMany({
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      date: true,
      kind: true,
      qty: true,
      unitCost: true,
      invoiceRef: true,
      note: true,
      product: { select: { id: true, subType: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    date: ymd(r.date),
    kind: r.kind as LiftingEntry["kind"],
    productId: r.product.id,
    productName: r.product.subType,
    qty: r.qty,
    unitCost: Number(r.unitCost),
    value: paisa(r.qty * Number(r.unitCost)),
    invoiceRef: r.invoiceRef,
    note: r.note,
  }));
}

/* ------------------------------------------------------------------ *
 * The godown, and the margin
 * ------------------------------------------------------------------ */

export type HouseBooks = {
  lines: HouseLine[];
  profit: ProfitSummary;
  expenses: ReturnType<typeof expenseTotals>;
  /** Null when the range is the whole history. */
  range: { from: string; to: string } | null;
};

/**
 * Everything the profit screen shows.
 *
 * Note which parts take a date range and which cannot. **Godown stock is
 * all-time**, always: "what is in the godown between the 1st and the 14th" is
 * not a question with an answer. Cost, margin and expenses ARE range
 * questions, so the same screen shows a ranged margin beside an all-time
 * godown figure, and says so rather than implying the two share a period.
 */
export async function houseBooks(range?: { from: string; to: string }): Promise<HouseBooks> {
  const dateFilter = range ? { gte: at(range.from), lte: at(range.to) } : undefined;

  const [products, liftRows, costRows, issuedRows, expenseRows] = await Promise.all([
    prisma.product.findMany({ select: { id: true, category: true, subType: true, unitLabel: true } }),
    /*
     * v199: for a RANGE, "lifted" means bought from the company in it —
     * PURCHASE only. An opening count is where the godown started, not a
     * purchase, and counting it put the whole opening stock into go-live day's
     * "lifted". All time, the openings stay in: the godown count needs them.
     */
    prisma.lifting.findMany({
      where: dateFilter ? { date: dateFilter, kind: "PURCHASE" } : undefined,
      select: { productId: true, qty: true, unitCost: true },
    }),
    // What the average cost is taken from: every lifting up to the end of the range.
    range
      ? prisma.lifting.findMany({
          where: { date: { lte: at(range.to) } },
          select: { productId: true, qty: true, unitCost: true },
        })
      : Promise.resolve(null),
    /*
     * One shape of the query, with the range as a parameter. Two literal
     * queries diverge the first time somebody edits one of them.
     */
    prisma.$queryRaw<
      {
        productId: string;
        givenQty: string;
        givenValue: string;
        returnedQty: string;
        returnedValue: string;
        soldQty: string;
        soldValue: string;
        openingQty: string;
      }[]
    >`
      SELECT m."productId" AS "productId",
             COALESCE(SUM(CASE WHEN m."kind"='GIVEN'    THEN m."qty" END),0)::text AS "givenQty",
             COALESCE(SUM(CASE WHEN m."kind"='GIVEN'    THEN m."qty"*m."unitPrice" END),0)::text AS "givenValue",
             COALESCE(SUM(CASE WHEN m."kind"='RETURNED' THEN m."qty" END),0)::text AS "returnedQty",
             COALESCE(SUM(CASE WHEN m."kind"='RETURNED' THEN m."qty"*m."unitPrice" END),0)::text AS "returnedValue",
             COALESCE(SUM(CASE WHEN m."kind"='SOLD'     THEN m."qty" END),0)::text AS "soldQty",
             COALESCE(SUM(CASE WHEN m."kind"='SOLD'     THEN m."qty"*m."unitPrice" END),0)::text AS "soldValue",
             COALESCE(SUM(CASE WHEN m."kind"='OPENING'  THEN m."qty" END),0)::text AS "openingQty"
        FROM "StockMovement" m
       WHERE (${range ? at(range.from) : null}::date IS NULL OR m."date" >= ${range ? at(range.from) : null}::date)
         AND (${range ? at(range.to) : null}::date IS NULL OR m."date" <= ${range ? at(range.to) : null}::date)
       GROUP BY 1`,
    prisma.expense.findMany({
      where: dateFilter ? { date: dateFilter } : undefined,
      select: { category: true, amount: true, paidFrom: true },
    }),
  ]);

  const lifts: LiftRow[] = liftRows.map((l) => ({
    productId: l.productId,
    qty: l.qty,
    unitCost: Number(l.unitCost),
  }));
  const issued: IssuedRow[] = issuedRows.map((r) => ({
    productId: r.productId,
    givenQty: Number(r.givenQty),
    givenValue: Number(r.givenValue),
    returnedQty: Number(r.returnedQty),
    returnedValue: Number(r.returnedValue),
    soldQty: Number(r.soldQty),
    soldValue: Number(r.soldValue),
    openingQty: Number(r.openingQty),
  }));

  const lines = houseLines(
    products as ProductRow[],
    lifts,
    issued,
    costRows?.map((l) => ({ productId: l.productId, qty: l.qty, unitCost: Number(l.unitCost) })),
  );
  const expenses = expenseTotals(
    expenseRows.map((e) => ({
      category: e.category as ExpenseCategory,
      amount: Number(e.amount),
      paidFrom: e.paidFrom as PaidFrom,
    })),
  );

  return { lines, profit: profitOf(lines, expenses.total), expenses, range: range ?? null };
}

/**
 * Godown stock, always all-time, whatever period the screen is showing.
 *
 * Split out from `houseBooks` because a ranged margin and an all-time godown
 * figure genuinely are two questions, and computing both from one filtered set
 * is how a screen ends up claiming the godown emptied itself last Tuesday.
 */
export async function godown(): Promise<HouseLine[]> {
  const all = await houseBooks();
  return all.lines;
}

/** Per-product average cost, for a screen that needs it without the rest. */
export async function averageCosts() {
  const lifts = await prisma.lifting.findMany({ select: { productId: true, qty: true, unitCost: true } });
  return costBasis(lifts.map((l) => ({ productId: l.productId, qty: l.qty, unitCost: Number(l.unitCost) })));
}

/* ------------------------------------------------------------------ *
 * Expenses
 * ------------------------------------------------------------------ */

export type ExpenseEntry = {
  id: string;
  date: string;
  category: ExpenseCategory;
  amount: number;
  paidFrom: PaidFrom;
  payee: string | null;
  note: string | null;
};

export async function expensesIn(range: { from: string; to: string }): Promise<ExpenseEntry[]> {
  const rows = await prisma.expense.findMany({
    where: { date: { gte: at(range.from), lte: at(range.to) } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: { id: true, date: true, category: true, amount: true, paidFrom: true, payee: true, note: true },
  });
  return rows.map((r) => ({
    id: r.id,
    date: ymd(r.date),
    category: r.category as ExpenseCategory,
    amount: Number(r.amount),
    paidFrom: r.paidFrom as PaidFrom,
    payee: r.payee,
    note: r.note,
  }));
}

/* ------------------------------------------------------------------ *
 * The SIM check
 * ------------------------------------------------------------------ */

export type SimCheckScope = { employeeIds: string[] | null };

/** Which RSOs this viewer may check. Mirrors lib/feature-scope.ts. */
export async function simCheckScope(user: {
  id: string;
  role: string;
  employeeId?: string | null;
  supervisorId?: string | null;
}): Promise<SimCheckScope> {
  if (user.role === "ACCOUNTS" || user.role === "ADMIN" || user.role === "IT") return { employeeIds: null };
  if (user.role === "MANAGER") {
    const scope = await managerScope(user.id);
    return { employeeIds: scope.employeeIds };
  }
  if (user.role === "SUPERVISOR") {
    if (!user.supervisorId) return { employeeIds: [] };
    const rows = await prisma.employee.findMany({
      where: { supervisorId: user.supervisorId, active: true },
      select: { id: true },
    });
    return { employeeIds: rows.map((r) => r.id) };
  }
  return { employeeIds: [] };
}

/**
 * Given, activated, sold — per RSO, over a date range.
 *
 * ## What "activated" counts, and what it does not
 *
 * Every GaActivation on an outlet belonging to that RSO in the period —
 * including swaps, because a swap SIM is a product in the catalogue that the
 * RSO is charged for, so its activation is a SIM leaving their hands exactly
 * as a new connection is.
 *
 * It is NOT filtered to standard GA (`withStandardGa`), which the performance
 * screens use. That filter answers "what counts towards a GA target"; this
 * asks "how many SIMs physically went out", and those are different questions
 * that happen to share a table.
 *
 * ## The caveats, which the screen prints
 *
 * The two sides count slightly different things and always will:
 *
 *   - An activation can be of a SIM the retailer had before this module
 *     existed, so `activated` can exceed anything we ever handed over.
 *   - An outlet that changed hands mid-period is counted under whoever owns it
 *     now, because that is how every other RSO figure in this app is built.
 *
 * That is why this is a knowledge screen and never a charge. A gap is a
 * question to ask somebody, not a number to put on their account.
 */
export async function simCheckRows(scope: SimCheckScope, range: { from: string; to: string }): Promise<SimCheck[]> {
  const where = scope.employeeIds === null ? { active: true } : { active: true, id: { in: scope.employeeIds } };
  const employees = await prisma.employee.findMany({
    where,
    select: { id: true, name: true, employeeCode: true, rsoMsisdn: true, supervisor: { select: { name: true } } },
  });
  if (!employees.length) return [];
  const ids = employees.map((e) => e.id);

  const [stock, activations, allTime] = await Promise.all([
    /* SIM-category movements only. A scratch card has no activation to check. */
    prisma.$queryRaw<{ holderId: string; given: string; returned: string; sold: string; givenValue: string }[]>`
      SELECT m."holderId" AS "holderId",
             COALESCE(SUM(CASE WHEN m."kind"='GIVEN'    THEN m."qty" END),0)::text AS given,
             COALESCE(SUM(CASE WHEN m."kind"='RETURNED' THEN m."qty" END),0)::text AS returned,
             COALESCE(SUM(CASE WHEN m."kind"='SOLD'     THEN m."qty" END),0)::text AS sold,
             COALESCE(SUM(CASE WHEN m."kind"='GIVEN'    THEN m."qty"*m."unitPrice" END),0)::text AS "givenValue"
        FROM "StockMovement" m
        JOIN "Product" p ON p."id" = m."productId"
       WHERE m."holderType" = 'RSO'
         AND m."holderId" = ANY(${ids})
         AND p."category" = ${CHECKED_CATEGORY}::"ProductCategory"
         AND m."date" >= ${at(range.from)}::date AND m."date" <= ${at(range.to)}::date
       GROUP BY 1`,
    prisma.$queryRaw<{ employeeId: string; n: string }[]>`
      SELECT r."employeeId" AS "employeeId", COUNT(*)::text AS n
        FROM "GaActivation" g
        JOIN "Retailer" r ON r."id" = g."retailerId"
       WHERE r."employeeId" = ANY(${ids})
         AND g."activationDate" >= ${at(range.from)}
         AND g."activationDate" < ${at(range.to)}::date + INTERVAL '1 day'
       GROUP BY 1`,
    /*
     * The price fallback. An RSO handed no SIMs THIS period still has a known
     * price if they were handed SIMs at any time — the period is the question
     * being asked, not a reason to forget what their SIMs cost.
     */
    prisma.$queryRaw<{ holderId: string; qty: string; value: string }[]>`
      SELECT m."holderId" AS "holderId", SUM(m."qty")::text AS qty,
             SUM(m."qty" * m."unitPrice")::text AS value
        FROM "StockMovement" m
        JOIN "Product" p ON p."id" = m."productId"
       WHERE m."holderType" = 'RSO' AND m."kind" = 'GIVEN'
         AND m."holderId" = ANY(${ids})
         AND p."category" = ${CHECKED_CATEGORY}::"ProductCategory"
       GROUP BY 1`,
  ]);

  const byStock = new Map(stock.map((s) => [s.holderId, s]));
  const byActivation = new Map(activations.map((a) => [a.employeeId, Number(a.n)]));
  const byAllTime = new Map(
    allTime.map((a) => [a.holderId, Number(a.qty) > 0 ? paisa(Number(a.value) / Number(a.qty)) : null]),
  );

  const rows = employees.map((e) => {
    const s = byStock.get(e.id);
    const given = s ? Number(s.given) - Number(s.returned) : 0;
    const grossGiven = s ? Number(s.given) : 0;
    const givenValue = s ? Number(s.givenValue) : 0;
    /*
     * The period's own price where there is one — over what was GIVEN, not the
     * net after returns: somebody who returned everything still has a known
     * price. Then their all-time price. Then nothing, which is the honest
     * answer for an RSO the ledger never handed a SIM to.
     */
    const avgPrice = grossGiven > 0 ? paisa(givenValue / grossGiven) : (byAllTime.get(e.id) ?? null);
    return simCheck({
      employeeId: e.id,
      name: e.name,
      code: e.employeeCode || e.rsoMsisdn,
      supervisorName: e.supervisor?.name ?? null,
      given,
      activated: byActivation.get(e.id) || 0,
      sold: s ? Number(s.sold) : 0,
      avgPrice,
    });
  });

  return bySuspicion(rows);
}

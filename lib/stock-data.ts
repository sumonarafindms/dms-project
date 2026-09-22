/**
 * Reading stock and cash out of the database.
 *
 * The arithmetic is not here — it is in lib/stock.ts, which knows nothing
 * about Prisma so the entry screens can import it. This file fetches rows,
 * hands them to that module, and answers the question "who may see whom".
 */

import { prisma } from "./prisma";
import { managerScope } from "./manager-scope";
import { bpDisplayName } from "./bp-name";
import {
  dueOf,
  movementValue,
  paisa,
  priceOn,
  stockLines,
  type Due,
  type HolderType,
  type MovementRow,
  type PriceRow,
  type ProductRow,
  type StockLine,
} from "./stock";

export type Holder = {
  type: HolderType;
  id: string;
  name: string;
  /** Retailer code for a BP, employee code or mobile for an RSO. */
  code: string | null;
  /** The supervisor this holder sits under, for grouping. Null for a supervisor. */
  supervisorName: string | null;
  /** The supervisor's id, for team totals. Names can repeat; ids cannot (v181). */
  supervisorId?: string | null;
  /**
   * v199: no longer an active RSO, supervisor or BP — but still holding stock
   * or money in this ledger, so still listed. See `listHolders`.
   */
  inactive?: boolean;
};

/** A holder identified the way a URL and a form carry one. */
export const holderKey = (type: HolderType, id: string) => `${type}:${id}`;
export function parseHolderKey(key: string): { type: HolderType; id: string } | null {
  const [type, ...rest] = String(key || "").split(":");
  const id = rest.join(":");
  if (!id) return null;
  if (type !== "RSO" && type !== "SUPERVISOR" && type !== "BP") return null;
  return { type, id };
}

/* ------------------------------------------------------------------ *
 * Who may see whom
 * ------------------------------------------------------------------ */

export type StockScope = {
  /** null: every holder. Otherwise the exact holders this viewer may open. */
  holders: Set<string> | null;
  /** The viewer's own holder, when they are one. */
  self: { type: HolderType; id: string } | null;
  /** Only Accounts writes. Everybody else reads. */
  canWrite: boolean;
};

/** The one role that enters stock and cash. The owner's ruling: "Aita sudu accounts entry korbe". */
export const STOCK_WRITE_ROLES = ["ACCOUNTS"];
/** Roles that may open anybody's ledger without being scoped to a team. */
const SEE_EVERYONE = ["ADMIN", "IT", "ACCOUNTS"];

export async function stockScope(user: {
  id: string;
  role: string;
  employeeId?: string | null;
  supervisorId?: string | null;
  bpRetailerId?: string | null;
}): Promise<StockScope> {
  const canWrite = STOCK_WRITE_ROLES.includes(user.role);

  if (SEE_EVERYONE.includes(user.role)) return { holders: null, self: null, canWrite };

  if (user.role === "MANAGER") {
    /*
     * A manager is scoped to the supervisors assigned to them, exactly as
     * every other manager screen in this app is. The owner said managers may
     * see RSO and BP stock; he did not say a manager may see a team that is
     * not theirs, and no other screen lets them.
     */
    const scope = await managerScope(user.id);
    const holders = await teamHolders(scope.supervisorIds, scope.employeeIds);
    return { holders, self: null, canWrite };
  }

  if (user.role === "SUPERVISOR") {
    const supervisorId = user.supervisorId ?? null;
    if (!supervisorId) return { holders: new Set<string>(), self: null, canWrite };
    const rsos = await prisma.employee.findMany({ where: { supervisorId, active: true }, select: { id: true } });
    const holders = await teamHolders(
      [supervisorId],
      rsos.map((r) => r.id),
    );
    // A supervisor holds stock themselves, so their own row is in their list.
    return { holders, self: { type: "SUPERVISOR", id: supervisorId }, canWrite };
  }

  if (user.role === "RSO") {
    const id = user.employeeId ?? null;
    if (!id) return { holders: new Set<string>(), self: null, canWrite };
    return { holders: new Set([holderKey("RSO", id)]), self: { type: "RSO", id }, canWrite };
  }

  if (user.role === "BP") {
    const id = user.bpRetailerId ?? null;
    if (!id) return { holders: new Set<string>(), self: null, canWrite };
    return { holders: new Set([holderKey("BP", id)]), self: { type: "BP", id }, canWrite };
  }

  return { holders: new Set<string>(), self: null, canWrite };
}

/** Supervisors, their RSOs, and every BP outlet those RSOs hold. */
async function teamHolders(supervisorIds: string[], employeeIds: string[]) {
  const keys = new Set<string>();
  for (const id of supervisorIds) keys.add(holderKey("SUPERVISOR", id));
  for (const id of employeeIds) keys.add(holderKey("RSO", id));
  if (employeeIds.length) {
    const bps = await prisma.bpAssignment.findMany({
      where: { employeeId: { in: employeeIds } },
      select: { retailerId: true },
    });
    for (const b of bps) keys.add(holderKey("BP", b.retailerId));
  }
  return keys;
}

export const mayOpen = (scope: StockScope, type: HolderType, id: string) =>
  scope.holders === null || scope.holders.has(holderKey(type, id));

/* ------------------------------------------------------------------ *
 * Holders
 * ------------------------------------------------------------------ */

/**
 * Every holder a viewer may open, as one list.
 *
 * A BP is the OUTLET, not the RSO holding it — the owner's ruling, "jai code
 * gula bp code hisabe thik kora hoice". That matters because an outlet can
 * change hands (v142/v143) and its stock does not move with the assignment:
 * the boxes are in the shop.
 */
export async function listHolders(scope: StockScope): Promise<Holder[]> {
  const [supervisors, rsos, bpAssignments] = await Promise.all([
    prisma.supervisor.findMany({ where: { active: true }, select: { id: true, name: true } }),
    prisma.employee.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        employeeCode: true,
        rsoMsisdn: true,
        supervisorId: true,
        supervisor: { select: { name: true } },
      },
    }),
    prisma.bpAssignment.findMany({
      where: { active: true },
      select: {
        retailer: { select: { id: true, retailerCode: true, retailerName: true, bpName: true } },
        employee: { select: { supervisorId: true, supervisor: { select: { name: true } } } },
      },
    }),
  ]);

  const out: Holder[] = [];
  for (const s of supervisors)
    out.push({ type: "SUPERVISOR", id: s.id, name: s.name, code: null, supervisorName: null });
  for (const r of rsos)
    out.push({
      type: "RSO",
      id: r.id,
      name: r.name,
      code: r.employeeCode || r.rsoMsisdn,
      supervisorName: r.supervisor?.name ?? null,
      supervisorId: r.supervisorId ?? null,
    });

  // One outlet, one row, even when two RSOs hold it.
  const seen = new Set<string>();
  for (const a of bpAssignments) {
    if (seen.has(a.retailer.id)) continue;
    seen.add(a.retailer.id);
    out.push({
      type: "BP",
      id: a.retailer.id,
      name: bpDisplayName(a.retailer),
      code: a.retailer.retailerCode,
      supervisorName: a.employee.supervisor?.name ?? null,
      supervisorId: a.employee.supervisorId ?? null,
    });
  }

  /*
   * v199 — somebody who has left is still in the books.
   *
   * Deactivating an RSO, a supervisor or ending a BP assignment never checked
   * their stock or due, and every list here was built from the ACTIVE people
   * only. An RSO who left owing ৳85,000 vanished from Stock & Cash, from the
   * home's Outstanding total and from the dues export — and a ledger link to
   * them opened Daily Entry on somebody else, so money collected from them
   * could be saved against the wrong person.
   *
   * So anyone with a single line in the ledger — a movement, a deposit or an
   * opening — stays listed, marked inactive, until the office has settled
   * them. Only for viewers who see everyone; a team view is a team.
   */
  if (scope.holders === null) {
    const listed = new Set(out.map((h) => holderKey(h.type, h.id)));
    const inBooks = await prisma.$queryRaw<{ holderType: HolderType; holderId: string }[]>`
      SELECT DISTINCT "holderType"::text AS "holderType", "holderId" FROM (
        SELECT "holderType", "holderId" FROM "StockMovement"
        UNION SELECT "holderType", "holderId" FROM "CashDeposit"
        UNION SELECT "holderType", "holderId" FROM "StockOpening"
      ) k`;
    const missing = inBooks.filter((k) => !listed.has(holderKey(k.holderType, k.holderId)));
    if (missing.length) {
      const ids = (t: HolderType) => missing.filter((k) => k.holderType === t).map((k) => k.holderId);
      const [sups, emps, outlets] = await Promise.all([
        prisma.supervisor.findMany({ where: { id: { in: ids("SUPERVISOR") } }, select: { id: true, name: true } }),
        prisma.employee.findMany({
          where: { id: { in: ids("RSO") } },
          select: { id: true, name: true, employeeCode: true, rsoMsisdn: true, supervisor: { select: { name: true } } },
        }),
        prisma.retailer.findMany({
          where: { id: { in: ids("BP") } },
          select: { id: true, retailerCode: true, retailerName: true, bpName: true },
        }),
      ]);
      for (const x of sups)
        out.push({ type: "SUPERVISOR", id: x.id, name: x.name, code: null, supervisorName: null, inactive: true });
      for (const x of emps)
        out.push({
          type: "RSO",
          id: x.id,
          name: x.name,
          code: x.employeeCode || x.rsoMsisdn,
          supervisorName: x.supervisor?.name ?? null,
          inactive: true,
        });
      for (const x of outlets)
        out.push({
          type: "BP",
          id: x.id,
          name: bpDisplayName(x),
          code: x.retailerCode,
          supervisorName: null,
          inactive: true,
        });
    }
  }

  const visible = scope.holders === null ? out : out.filter((h) => scope.holders!.has(holderKey(h.type, h.id)));
  visible.sort(
    (a, b) =>
      a.type.localeCompare(b.type) || Number(!!a.inactive) - Number(!!b.inactive) || a.name.localeCompare(b.name),
  );
  return visible;
}

export async function findHolder(type: HolderType, id: string): Promise<Holder | null> {
  if (type === "SUPERVISOR") {
    const s = await prisma.supervisor.findUnique({ where: { id }, select: { id: true, name: true } });
    return s ? { type, id: s.id, name: s.name, code: null, supervisorName: null } : null;
  }
  if (type === "RSO") {
    const r = await prisma.employee.findUnique({
      where: { id },
      select: { id: true, name: true, employeeCode: true, rsoMsisdn: true, supervisor: { select: { name: true } } },
    });
    return r
      ? {
          type,
          id: r.id,
          name: r.name,
          code: r.employeeCode || r.rsoMsisdn,
          supervisorName: r.supervisor?.name ?? null,
        }
      : null;
  }
  const t = await prisma.retailer.findUnique({
    where: { id },
    select: { id: true, retailerCode: true, retailerName: true, bpName: true },
  });
  return t ? { type, id: t.id, name: bpDisplayName(t), code: t.retailerCode, supervisorName: null } : null;
}

/* ------------------------------------------------------------------ *
 * Products and their prices
 * ------------------------------------------------------------------ *
 * A ProductRow has no price. That is deliberate and it is enforced by the
 * type: a screen holding one cannot value a historical movement with today's
 * figure, because it has no figure to reach for. Where a price IS needed — the
 * entry screen, which has to propose one — `pricedProducts` asks for the DATE
 * it is needed for and answers with the price in force on that day. */

const toProduct = (p: { id: string; category: string; subType: string; unitLabel: string | null }): ProductRow => ({
  id: p.id,
  category: p.category as ProductRow["category"],
  subType: p.subType,
  unitLabel: p.unitLabel,
});

export async function activeProducts(): Promise<ProductRow[]> {
  const rows = await prisma.product.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ category: "asc" }, { subType: "asc" }],
    select: { id: true, category: true, subType: true, unitLabel: true },
  });
  return rows.map(toProduct);
}

export async function allProducts(): Promise<ProductRow[]> {
  const rows = await prisma.product.findMany({
    orderBy: [{ category: "asc" }, { subType: "asc" }],
    select: { id: true, category: true, subType: true, unitLabel: true },
  });
  return rows.map(toProduct);
}

/**
 * Active products with the price in force on `date`.
 *
 * A product with no price starting on or before that day is returned with
 * `price: null` and the entry screen refuses to record a line for it, rather
 * than treating it as free. A product added in October genuinely has no price
 * in September, and pretending otherwise is how a zero-value line gets saved.
 */
export type DatedProduct = ProductRow & { price: number | null; retired?: boolean };

export async function pricedProducts(date: string, alsoIds: string[] = []): Promise<DatedProduct[]> {
  /*
   * v199: `alsoIds` brings in RETIRED products a form already has lines for.
   * Listing active products only meant a retired product's saved lines were
   * invisible on the screen — left out of "Due after saving", uncorrectable,
   * and on the opening form silently DELETED by the next save, because that
   * route clears every opening line and rewrites only what the form sent.
   */
  const rows = await prisma.product.findMany({
    where: alsoIds.length ? { OR: [{ status: "ACTIVE" }, { id: { in: alsoIds } }] } : { status: "ACTIVE" },
    orderBy: [{ category: "asc" }, { subType: "asc" }],
    select: {
      id: true,
      category: true,
      subType: true,
      unitLabel: true,
      status: true,
      prices: { select: { price: true, effectiveFrom: true } },
    },
  });
  return rows.map((p) => ({
    ...toProduct(p),
    retired: p.status !== "ACTIVE",
    price: priceOn(
      p.prices.map((x) => ({ price: Number(x.price), effectiveFrom: x.effectiveFrom.toISOString().slice(0, 10) })),
      date,
    ),
  }));
}

export type ProductWithPrices = ProductRow & {
  status: "ACTIVE" | "INACTIVE";
  activationType: "GA_170" | "GA_300" | "SIM_SWAP" | null;
  prices: PriceRow[];
  movements: number;
  /** The price in force today, or null if it has none yet. */
  current: number | null;
};

/** The product master screen's whole dataset. */
export async function productCatalogue(today: string): Promise<ProductWithPrices[]> {
  const rows = await prisma.product.findMany({
    orderBy: [{ status: "asc" }, { category: "asc" }, { subType: "asc" }],
    select: {
      id: true,
      category: true,
      subType: true,
      unitLabel: true,
      status: true,
      activationType: true,
      prices: { orderBy: { effectiveFrom: "desc" }, select: { price: true, effectiveFrom: true } },
      _count: { select: { movements: true } },
    },
  });
  return rows.map((p) => {
    const prices: PriceRow[] = p.prices.map((x) => ({
      price: Number(x.price),
      effectiveFrom: x.effectiveFrom.toISOString().slice(0, 10),
    }));
    return {
      ...toProduct(p),
      status: p.status as "ACTIVE" | "INACTIVE",
      activationType: p.activationType,
      prices,
      movements: p._count.movements,
      current: priceOn(prices, today),
    };
  });
}

/* ------------------------------------------------------------------ *
 * One holder's position
 * ------------------------------------------------------------------ */

export type HolderPosition = {
  holder: Holder;
  lines: StockLine[];
  due: Due;
  soldValue: number;
  cash: number;
  bank: number;
  openingAsOf: string | null;
};

/**
 * Everything one holder is holding and owes, all time.
 *
 * All time, not a date range, because a due is a running balance: a range
 * would answer a different question and print it under the same word.
 * The history list below takes a range; this does not.
 */
export async function holderPosition(holder: Holder): Promise<HolderPosition> {
  const where = { holderType: holder.type, holderId: holder.id } as const;
  const [movements, deposits, opening, products] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      select: { kind: true, productId: true, qty: true, unitPrice: true, date: true },
    }),
    prisma.cashDeposit.aggregate({ where, _sum: { cash: true, bank: true } }),
    prisma.stockOpening.findUnique({
      where: { holderType_holderId: { holderType: holder.type, holderId: holder.id } },
      select: { openingDue: true, asOfDate: true },
    }),
    allProducts(),
  ]);

  const lines = stockLines(
    movements.map((m) => ({
      kind: m.kind,
      productId: m.productId,
      qty: m.qty,
      unitPrice: Number(m.unitPrice),
      date: m.date.toISOString().slice(0, 10),
    })) as MovementRow[],
    products,
  );
  const v = movementValue(lines);
  const cash = Number(deposits._sum.cash || 0);
  const bank = Number(deposits._sum.bank || 0);

  return {
    holder,
    lines,
    due: dueOf({
      openingDue: Number(opening?.openingDue || 0),
      givenValue: v.givenValue,
      returnedValue: v.returnedValue,
      cash,
      bank,
    }),
    soldValue: v.soldValue,
    cash: paisa(cash),
    bank: paisa(bank),
    openingAsOf: opening?.asOfDate ? opening.asOfDate.toISOString().slice(0, 10) : null,
  };
}

/* ------------------------------------------------------------------ *
 * Every holder's due, in two queries
 * ------------------------------------------------------------------ */

export type HolderDue = Holder & {
  due: number;
  givenValue: number;
  returnedValue: number;
  soldValue: number;
  deposited: number;
  /** Value of the iTopup float still out with this holder. */
  topupInHand: number;
};

type RawAgg = {
  holderType: string;
  holderId: string;
  kind: string;
  category: string;
  value: string | number;
  qty: string | number;
};

/**
 * The list screens need a due for every holder at once.
 *
 * `qty × price` crosses a join, which Prisma's groupBy cannot express, so
 * this is raw SQL — one pass over StockMovement rather than one query per
 * person. At the volumes this app already runs at (77k GaActivation rows) the
 * per-person version would be hundreds of round trips for one page.
 */
export async function holderDues(scope: StockScope, listed?: Holder[]): Promise<HolderDue[]> {
  const [holders, agg, deposits, openings] = await Promise.all([
    // A caller that already listed the holders passes them, rather than paying
    // for the same four queries twice on one page load.
    listed ? Promise.resolve(listed) : listHolders(scope),
    prisma.$queryRaw<RawAgg[]>`
      SELECT m."holderType"::text AS "holderType",
             m."holderId"         AS "holderId",
             m."kind"::text       AS "kind",
             p."category"::text   AS "category",
             SUM(m."qty" * m."unitPrice") AS "value",
             SUM(m."qty")                 AS "qty"
        FROM "StockMovement" m
        JOIN "Product" p ON p."id" = m."productId"
       GROUP BY 1, 2, 3, 4`,
    prisma.cashDeposit.groupBy({
      by: ["holderType", "holderId"],
      _sum: { cash: true, bank: true },
    }),
    prisma.stockOpening.findMany({ select: { holderType: true, holderId: true, openingDue: true } }),
  ]);

  const key = (t: string, i: string) => `${t}:${i}`;
  const moved = new Map<string, { given: number; returned: number; sold: number }>();
  const topup = new Map<string, number>();
  for (const r of agg) {
    const k = key(r.holderType, r.holderId);
    const row = moved.get(k) || { given: 0, returned: 0, sold: 0 };
    const value = Number(r.value) || 0;
    if (r.kind === "GIVEN") row.given += value;
    else if (r.kind === "RETURNED") row.returned += value;
    else if (r.kind === "SOLD") row.sold += value;
    moved.set(k, row);

    if (r.category === "ITOPUP") {
      const qty = Number(r.qty) || 0;
      const sign = r.kind === "GIVEN" || r.kind === "OPENING" ? 1 : -1;
      topup.set(k, (topup.get(k) || 0) + sign * qty);
    }
  }

  const paid = new Map<string, number>();
  for (const d of deposits)
    paid.set(key(d.holderType, d.holderId), Number(d._sum.cash || 0) + Number(d._sum.bank || 0));
  const open = new Map<string, number>();
  for (const o of openings) open.set(key(o.holderType, o.holderId), Number(o.openingDue || 0));

  return holders.map((h) => {
    const k = key(h.type, h.id);
    const m = moved.get(k) || { given: 0, returned: 0, sold: 0 };
    const cash = paid.get(k) || 0;
    const d = dueOf({
      openingDue: open.get(k) || 0,
      givenValue: m.given,
      returnedValue: m.returned,
      cash,
      bank: 0,
    });
    return {
      ...h,
      due: d.due,
      givenValue: d.givenValue,
      returnedValue: d.returnedValue,
      soldValue: paisa(m.sold),
      deposited: d.deposited,
      topupInHand: paisa(topup.get(k) || 0),
    };
  });
}

/* ------------------------------------------------------------------ *
 * One day, for the entry screen
 * ------------------------------------------------------------------ */

export type DayEntry = {
  given: Record<string, number>;
  sold: Record<string, number>;
  returned: Record<string, number>;
  /**
   * The price each RETURN line was recorded at.
   *
   * Re-opening a day must show the price that day was actually saved with, not
   * a freshly computed default — otherwise saving an untouched day again could
   * quietly reprice it.
   */
  returnPrice: Record<string, number>;
  /**
   * v199: the price each GIVEN and SOLD line was saved at. The server keeps
   * it on a re-save, so the screen's running due must use it too.
   */
  givenPrice: Record<string, number>;
  soldPrice: Record<string, number>;
  cash: number;
  bank: number;
  bankRef: string;
  notes: string;
};

/** What is already recorded for this holder on this day, so the form opens on it. */
export async function dayEntry(type: HolderType, id: string, date: string): Promise<DayEntry> {
  const at = new Date(`${date}T00:00:00.000Z`);
  const [movements, deposit] = await Promise.all([
    prisma.stockMovement.findMany({
      where: { holderType: type, holderId: id, date: at },
      select: { kind: true, productId: true, qty: true, unitPrice: true },
    }),
    prisma.cashDeposit.findUnique({
      where: { holderType_holderId_date: { holderType: type, holderId: id, date: at } },
      select: { cash: true, bank: true, bankRef: true, notes: true },
    }),
  ]);

  const out: DayEntry = {
    given: {},
    sold: {},
    returned: {},
    returnPrice: {},
    givenPrice: {},
    soldPrice: {},
    cash: 0,
    bank: 0,
    bankRef: "",
    notes: "",
  };
  for (const m of movements) {
    if (m.kind === "GIVEN") {
      out.given[m.productId] = m.qty;
      out.givenPrice[m.productId] = Number(m.unitPrice);
    } else if (m.kind === "SOLD") {
      out.sold[m.productId] = m.qty;
      out.soldPrice[m.productId] = Number(m.unitPrice);
    } else if (m.kind === "RETURNED") {
      out.returned[m.productId] = m.qty;
      out.returnPrice[m.productId] = Number(m.unitPrice);
    }
  }
  if (deposit) {
    out.cash = Number(deposit.cash || 0);
    out.bank = Number(deposit.bank || 0);
    out.bankRef = deposit.bankRef || "";
    out.notes = deposit.notes || "";
  }
  return out;
}

export type HistoryRow = {
  date: string;
  given: number;
  sold: number;
  returned: number;
  cash: number;
  bank: number;
};

/** A holder's recent days, newest first. A range question, so it takes a range. */
export async function holderHistory(type: HolderType, id: string, days = 30): Promise<HistoryRow[]> {
  const rows = await prisma.$queryRaw<
    { date: Date; given: string; sold: string; returned: string; cash: string; bank: string }[]
  >`
    WITH m AS (
      SELECT sm."date",
             SUM(CASE WHEN sm."kind" = 'GIVEN'    THEN sm."qty" * sm."unitPrice" ELSE 0 END) AS given,
             SUM(CASE WHEN sm."kind" = 'SOLD'     THEN sm."qty" * sm."unitPrice" ELSE 0 END) AS sold,
             SUM(CASE WHEN sm."kind" = 'RETURNED' THEN sm."qty" * sm."unitPrice" ELSE 0 END) AS returned
        FROM "StockMovement" sm
       WHERE sm."holderType" = ${type}::"StockHolderType" AND sm."holderId" = ${id}
       GROUP BY sm."date"
    ), c AS (
      SELECT "date", "cash", "bank" FROM "CashDeposit"
       WHERE "holderType" = ${type}::"StockHolderType" AND "holderId" = ${id}
    )
    SELECT COALESCE(m."date", c."date") AS date,
           COALESCE(m.given, 0) AS given, COALESCE(m.sold, 0) AS sold, COALESCE(m.returned, 0) AS returned,
           COALESCE(c."cash", 0) AS cash, COALESCE(c."bank", 0) AS bank
      FROM m FULL OUTER JOIN c ON c."date" = m."date"
     ORDER BY 1 DESC
     LIMIT ${days}`;

  return rows.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    given: paisa(Number(r.given)),
    sold: paisa(Number(r.sold)),
    returned: paisa(Number(r.returned)),
    cash: paisa(Number(r.cash)),
    bank: paisa(Number(r.bank)),
  }));
}

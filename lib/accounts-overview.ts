/**
 * The Accounts home, v198 — what moved, product by product, and who is holding it.
 *
 * The owner's words for the page:
 *
 *   *"Sim Company theke koto gula lifting hoice and Rso der kache koto gula dia
 *   hoice and RSO sell koto gula dekhaice and tara active koto gula korce ...
 *   normal sim, swap sim ar jono alada ... 150 takar sim koita, 300 takar sim
 *   koita ... card ar jono company lifting, rso lifting and rso sell ... monthly
 *   and yesterday ... Tar por niche RSO, bp and supervisor onu jai kar koto gula
 *   stock ace"*
 *
 * So two halves, and this file answers both in one pass:
 *
 *  1. **Per product, for this month and for yesterday**: what the company
 *     lifted to us, what we handed out, what the holders reported sold, and —
 *     for SIMs — what the company's own feed says was ACTIVATED. That last
 *     column is the point of putting SIMs beside each other: a SIM reported
 *     sold that never activates, or activated and never reported, is money
 *     somebody has to ask about.
 *
 *  2. **Per holder** — RSO, supervisor, BP: what is in their hands now, and
 *     what they took and reported sold this month and yesterday. Supervisors
 *     take stock too (*"supervisors o products ar stock niye thake"*), so they
 *     get the same row as everyone else, not a footnote.
 *
 * ## "Activated" is linked, never guessed
 *
 * A product in the box and an activation in the company's feed are different
 * things (see the note above the stock models in schema.prisma). What joins
 * them is `Product.activationType`, set on the Products page. A SIM with no
 * link shows "not linked", not 0 — v175's rule: a figure nobody set is not
 * zero. When two products share a link (two swap SIMs), the activations belong
 * to the pair, so each row says so instead of printing the same count twice as
 * if it were two.
 *
 * Every quantity here is units, except iTopup, whose unit is the Taka.
 */

import { prisma } from "./prisma";
import { withGa170, withGa300, withSimSwap, withStandardGa } from "./business-rules";
import { currentGa170Tariff } from "./ga-tariff";
import { businessDayBounds, dhakaTodayYmd, dhakaYesterdayYmd } from "./business-time";
import { holderDues, listHolders, type StockScope } from "./stock-data";
import { godown } from "./lifting-data";
import { HOLDER_TYPES, paisa, type HolderType, type ProductCategory } from "./stock";

import { QUIET_DAYS } from "./accounts-shelves";
import type {
  AccountsOverview,
  ActivationType,
  Attention,
  HolderLine,
  HolderStock,
  OverviewPeriod,
  OverviewProduct,
  PeriodKey,
  ProductFlow,
} from "./accounts-shelves";

export * from "./accounts-shelves";

const zeroBy = (): Record<HolderType, number> => ({ RSO: 0, SUPERVISOR: 0, BP: 0 });
const emptyFlow = (productId: string, linked: boolean): ProductFlow => ({
  productId,
  lifted: 0,
  given: 0,
  givenBy: zeroBy(),
  sold: 0,
  soldBy: zeroBy(),
  returned: 0,
  activated: linked ? 0 : null,
});

/** "1–23 Sep" style label for the month to date. */
function monthLabel(from: string, to: string) {
  const m = new Date(`${from}T00:00:00.000Z`).toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return `This month · ${Number(from.slice(8))}–${Number(to.slice(8))} ${m}`;
}

function periodRange(key: PeriodKey, today: string) {
  if (key === "yesterday") {
    const y = dhakaYesterdayYmd(new Date(`${today}T06:00:00.000Z`));
    return { from: y, to: y, label: "Yesterday" };
  }
  const from = `${today.slice(0, 7)}-01`;
  return { from, to: today, label: monthLabel(from, today) };
}

const asDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

export async function accountsOverview(scope: StockScope, today = dhakaTodayYmd()): Promise<AccountsOverview> {
  const ranges = { month: periodRange("month", today), yesterday: periodRange("yesterday", today) };
  const tariff = await currentGa170Tariff();

  /** The company feed's count of each activation kind over a period. */
  const activationCounts = async (from: string, to: string) => {
    const where = { activationDate: { gte: businessDayBounds(from).start, lt: businessDayBounds(to).end } };
    const [ga170, ga300, swap] = await Promise.all([
      prisma.gaActivation.count({ where: withGa170(tariff, where) }),
      prisma.gaActivation.count({ where: withGa300(tariff, where) }),
      prisma.gaActivation.count({ where: withSimSwap(where) }),
    ]);
    return { GA_170: ga170, GA_300: ga300, SIM_SWAP: swap } as Record<ActivationType, number>;
  };

  const movesIn = (from: string, to: string) =>
    prisma.stockMovement.groupBy({
      by: ["holderType", "holderId", "productId", "kind"],
      where: { date: { gte: asDate(from), lte: asDate(to) }, kind: { in: ["GIVEN", "SOLD", "RETURNED"] } },
      _sum: { qty: true },
    });
  const liftedIn = (from: string, to: string) =>
    prisma.lifting.groupBy({
      by: ["productId"],
      where: { kind: "PURCHASE", date: { gte: asDate(from), lte: asDate(to) } },
      _sum: { qty: true },
    });

  const holdersP = listHolders(scope);
  const [
    productRows,
    holders,
    dues,
    allTime,
    monthMoves,
    yMoves,
    monthLift,
    yLift,
    monthActs,
    yActs,
    house,
    newest,
    lastMoney,
    pricedToday,
    firstMove,
  ] = await Promise.all([
    prisma.product.findMany({
      orderBy: [{ category: "asc" }, { subType: "asc" }],
      select: { id: true, category: true, subType: true, kindName: true, activationType: true, status: true },
    }),
    holdersP,
    holdersP.then((h) => holderDues(scope, h)),
    prisma.stockMovement.groupBy({
      by: ["holderType", "holderId", "productId", "kind"],
      _sum: { qty: true },
    }),
    movesIn(ranges.month.from, ranges.month.to),
    movesIn(ranges.yesterday.from, ranges.yesterday.to),
    liftedIn(ranges.month.from, ranges.month.to),
    liftedIn(ranges.yesterday.from, ranges.yesterday.to),
    activationCounts(ranges.month.from, ranges.month.to),
    activationCounts(ranges.yesterday.from, ranges.yesterday.to),
    godown(),
    prisma.gaActivation.findFirst({
      where: withStandardGa(),
      orderBy: { activationDate: "desc" },
      select: { activationDate: true },
    }),
    // The last day real money came in from each person — a notes-only row is not money.
    prisma.cashDeposit.groupBy({
      by: ["holderType", "holderId"],
      where: { OR: [{ cash: { gt: 0 } }, { bank: { gt: 0 } }] },
      _max: { date: true },
    }),
    // Which products have a price in force today.
    prisma.productPrice.findMany({
      where: { effectiveFrom: { lte: asDate(today) } },
      distinct: ["productId"],
      select: { productId: true },
    }),
    // When each person first got anything — "never paid" only counts once they have had a week to (v200).
    prisma.stockMovement.groupBy({ by: ["holderType", "holderId"], _min: { date: true } }),
  ]);

  const products: OverviewProduct[] = productRows.map((p) => ({
    id: p.id,
    category: p.category as ProductCategory,
    subType: p.subType,
    kindName: p.kindName,
    activationType: (p.activationType as ActivationType | null) ?? null,
    active: p.status === "ACTIVE",
  }));
  const byId = new Map(products.map((p) => [p.id, p]));

  const sharedLinks: Record<ActivationType, string[]> = { GA_170: [], GA_300: [], SIM_SWAP: [] };
  for (const p of products) if (p.category === "SIM" && p.activationType) sharedLinks[p.activationType].push(p.id);

  const visible = scope.holders;
  const inScope = (type: string, id: string) => visible === null || visible.has(`${type}:${id}`);

  const buildPeriod = (
    key: PeriodKey,
    moves: typeof monthMoves,
    lifts: typeof monthLift,
    acts: Record<ActivationType, number>,
  ): OverviewPeriod => {
    const flows: Record<string, ProductFlow> = {};
    const flow = (id: string) => {
      const p = byId.get(id);
      return (flows[id] ||= emptyFlow(id, !!(p?.category === "SIM" && p.activationType)));
    };
    for (const p of products) flow(p.id);
    for (const l of lifts) flow(l.productId).lifted += Number(l._sum.qty || 0);
    for (const m of moves) {
      // House totals are the house's, whoever is looking — this page is Accounts'
      // and Accounts sees everyone. The scope still applies to the holder list.
      const f = flow(m.productId);
      const q = Number(m._sum.qty || 0);
      const t = m.holderType as HolderType;
      if (m.kind === "GIVEN") {
        f.given += q;
        f.givenBy[t] += q;
      } else if (m.kind === "SOLD") {
        f.sold += q;
        f.soldBy[t] += q;
      } else if (m.kind === "RETURNED") f.returned += q;
    }
    for (const p of products)
      if (p.category === "SIM" && p.activationType) flows[p.id].activated = acts[p.activationType];
    for (const f of Object.values(flows)) {
      f.lifted = paisa(f.lifted);
      f.given = paisa(f.given);
      f.sold = paisa(f.sold);
      f.returned = paisa(f.returned);
    }
    const r = ranges[key];
    return { key, label: r.label, from: r.from, to: r.to, flows, activations: acts };
  };

  /* ---------------- holders ---------------- */
  const key = (t: string, i: string) => `${t}:${i}`;
  const lineMap = new Map<string, Map<string, HolderLine>>();
  const lineOf = (t: string, i: string, productId: string) => {
    const k = key(t, i);
    let m = lineMap.get(k);
    if (!m) lineMap.set(k, (m = new Map()));
    let l = m.get(productId);
    if (!l)
      m.set(
        productId,
        (l = { productId, inHand: 0, took: { month: 0, yesterday: 0 }, sold: { month: 0, yesterday: 0 } }),
      );
    return l;
  };
  for (const r of allTime) {
    if (!inScope(r.holderType, r.holderId)) continue;
    const q = Number(r._sum.qty || 0);
    const sign = r.kind === "GIVEN" || r.kind === "OPENING" ? 1 : -1;
    lineOf(r.holderType, r.holderId, r.productId).inHand += sign * q;
  }
  for (const [period, moves] of [
    ["month", monthMoves],
    ["yesterday", yMoves],
  ] as const) {
    for (const r of moves) {
      if (!inScope(r.holderType, r.holderId)) continue;
      const q = Number(r._sum.qty || 0);
      if (r.kind === "GIVEN") lineOf(r.holderType, r.holderId, r.productId).took[period] += q;
      else if (r.kind === "SOLD") lineOf(r.holderType, r.holderId, r.productId).sold[period] += q;
    }
  }
  const dueOf = new Map(dues.map((d) => [key(d.type, d.id), d.due]));
  const order = new Map(products.map((p, i) => [p.id, i]));
  const lastOf = new Map(
    lastMoney.map((d) => [key(d.holderType, d.holderId), d._max.date ? d._max.date.toISOString().slice(0, 10) : null]),
  );
  const holderRows: HolderStock[] = holders.map((h) => ({
    ...h,
    due: dueOf.get(key(h.type, h.id)) ?? 0,
    lastDeposit: lastOf.get(key(h.type, h.id)) ?? null,
    lines: [...(lineMap.get(key(h.type, h.id))?.values() || [])]
      .map((l) => ({ ...l, inHand: paisa(l.inHand) }))
      .filter((l) => l.inHand || l.took.month || l.sold.month || l.took.yesterday || l.sold.yesterday)
      .sort((a, b) => (order.get(a.productId) ?? 0) - (order.get(b.productId) ?? 0)),
  }));
  holderRows.sort(
    (a, b) =>
      HOLDER_TYPES.indexOf(a.type) - HOLDER_TYPES.indexOf(b.type) || b.due - a.due || a.name.localeCompare(b.name),
  );

  const godownQty: Record<string, number> = {};
  for (const l of house) godownQty[l.product.id] = l.inGodown;

  /* ---------------- what needs attention (v199) ---------------- */
  const daysSince = (ymd: string) => Math.round((asDate(today).getTime() - asDate(ymd).getTime()) / 86400000);
  const priced = new Set(pricedToday.map((p) => p.productId));
  const nameOf = (id: string) => byId.get(id)?.subType || "A product";
  const firstOf = new Map(
    firstMove.map((m) => [key(m.holderType, m.holderId), m._min.date ? m._min.date.toISOString().slice(0, 10) : null]),
  );
  /*
   * v200: a due under one Taka is rounding, not money owed — returning three
   * units carried at ৳100.33 credits ৳300.99 and leaves a penny for ever. And
   * someone first given stock today has not "never paid"; they get the same
   * week anyone else gets before the list asks about them.
   */
  const OWING = 1;
  const quietSince = (h: HolderStock) => {
    if (h.lastDeposit) return daysSince(h.lastDeposit);
    const first = firstOf.get(key(h.type, h.id));
    return first ? daysSince(first) : null;
  };
  const attention: Attention = {
    quietDues: holderRows
      .filter((h) => h.due >= OWING && (quietSince(h) ?? QUIET_DAYS) >= QUIET_DAYS)
      .map((h) => ({
        type: h.type,
        id: h.id,
        name: h.name,
        due: h.due,
        lastDeposit: h.lastDeposit,
        days: h.lastDeposit ? daysSince(h.lastDeposit) : null,
      }))
      .sort((a, b) => b.due - a.due),
    negativeStock: holderRows
      .flatMap((h) =>
        h.lines
          .filter((l) => l.inHand < 0)
          .map((l) => ({ type: h.type, id: h.id, name: h.name, product: nameOf(l.productId), inHand: l.inHand })),
      )
      .sort((a, b) => a.inHand - b.inHand),
    negativeGodown: house
      .filter((l) => l.inGodown < 0 && l.liftedQty > 0)
      .map((l) => ({ product: l.product.subType, qty: l.inGodown }))
      .sort((a, b) => a.qty - b.qty),
    unpriced: products.filter((p) => p.active && !priced.has(p.id)).map((p) => p.subType),
    unlinkedSims: products.filter((p) => p.active && p.category === "SIM" && !p.activationType).map((p) => p.subType),
    leftWithBalance: holderRows
      .filter((h) => h.inactive && (Math.abs(h.due) >= OWING || h.lines.some((l) => l.inHand !== 0)))
      .map((h) => ({ type: h.type, id: h.id, name: h.name, due: h.due })),
  };

  return {
    today,
    products,
    periods: {
      month: buildPeriod("month", monthMoves, monthLift, monthActs),
      yesterday: buildPeriod("yesterday", yMoves, yLift, yActs),
    },
    godown: godownQty,
    holders: holderRows,
    attention,
    activationsThrough: newest?.activationDate ? newest.activationDate.toISOString().slice(0, 10) : null,
    sharedLinks,
  };
}

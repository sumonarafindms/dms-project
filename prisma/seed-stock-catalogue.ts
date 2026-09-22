/**
 * The owner's real catalogue, with a price history that exercises the module.
 *
 *   "Scratch card, sim (Sim ar type ace, jamon 150 takar sim, 300 takar sim,
 *    swap sim ace 142 taka, EV sim ace 100 taka.. abar ai sob sim ar dam kome
 *    bare abar new sim add hoi jamom E-sim), Recharge, Router, mobile ETC."
 *
 * Prices go up AND down, and E-SIM starts mid-month — so the catalogue itself
 * contains the two cases the entry screen has to get right: a back-dated day
 * priced by its own date, and a product that simply did not exist yet.
 *
 * Run it ONCE on a fresh database, then edit everything from the Products
 * screen — this file is a starting point, not the source of truth:
 *
 *     npx vite-node prisma/seed-stock-catalogue.ts
 *
 * Safe to re-run: products are matched by kind and name, and a price that is
 * already there is updated rather than duplicated. It never deletes anything,
 * and it never touches a recorded movement — those carry their own prices, so
 * running this after months of entry cannot move a single figure.
 *
 * The dates below are examples of the shape, not real history. Set each
 * product's real "from" date on the Products screen before entering days that
 * fall before it, or the entry screen will say the product has no price for
 * that day — which is the correct answer, not a bug.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const CATALOGUE: {
  category: "SIM" | "CARD" | "ROUTER" | "HANDSET" | "ITOPUP";
  subType: string;
  unitLabel: string;
  prices: [string, number][];
}[] = [
  // SIMs — the owner's four, plus E-SIM arriving later.
  { category: "SIM", subType: "Normal SIM 150", unitLabel: "pc", prices: [["2026-01-01", 150]] },
  { category: "SIM", subType: "Normal SIM 300", unitLabel: "pc", prices: [["2026-01-01", 300]] },
  {
    category: "SIM",
    subType: "Swap SIM",
    unitLabel: "pc",
    // Up, then down — the owner said "dam kome bare", both directions.
    prices: [
      ["2026-01-01", 142],
      ["2026-06-01", 148],
      ["2026-09-15", 138],
    ],
  },
  {
    category: "SIM",
    subType: "EV SIM",
    unitLabel: "pc",
    prices: [
      ["2026-01-01", 100],
      ["2026-08-01", 110],
    ],
  },
  { category: "SIM", subType: "E-SIM", unitLabel: "pc", prices: [["2026-09-10", 200]] },

  // Scratch cards.
  { category: "CARD", subType: "Scratch card 20", unitLabel: "card", prices: [["2026-01-01", 20]] },
  {
    category: "CARD",
    subType: "Scratch card 39",
    unitLabel: "card",
    prices: [
      ["2026-01-01", 39],
      ["2026-09-13", 40],
    ],
  },
  { category: "CARD", subType: "Scratch card 100", unitLabel: "card", prices: [["2026-01-01", 100]] },

  // Recharge float — a product whose unit is the Taka.
  { category: "ITOPUP", subType: "iTopup balance", unitLabel: "Tk", prices: [["2026-01-01", 1]] },

  // Devices.
  {
    category: "ROUTER",
    subType: "Router 4G",
    unitLabel: "pc",
    prices: [
      ["2026-01-01", 3200],
      ["2026-07-01", 2950],
    ],
  },
  { category: "ROUTER", subType: "Router 5G", unitLabel: "pc", prices: [["2026-05-01", 5400]] },
  { category: "HANDSET", subType: "Handset Basic", unitLabel: "pc", prices: [["2026-01-01", 1450]] },
  {
    category: "HANDSET",
    subType: "Handset Smart",
    unitLabel: "pc",
    prices: [
      ["2026-01-01", 8900],
      ["2026-08-15", 8500],
    ],
  },
];

for (const item of CATALOGUE) {
  const existing = await prisma.product.findFirst({
    where: { category: item.category, subType: item.subType },
    select: { id: true },
  });
  const id =
    existing?.id ??
    (
      await prisma.product.create({
        data: { category: item.category, subType: item.subType, unitLabel: item.unitLabel },
        select: { id: true },
      })
    ).id;
  for (const [from, price] of item.prices) {
    await prisma.productPrice.upsert({
      where: { productId_effectiveFrom: { productId: id, effectiveFrom: d(from) } },
      update: { price },
      create: { productId: id, price, effectiveFrom: d(from) },
    });
  }
}

const products = await prisma.product.count();
const prices = await prisma.productPrice.count();
console.log(`catalogue: ${products} products, ${prices} prices`);
for (const p of await prisma.product.findMany({
  orderBy: [{ category: "asc" }, { subType: "asc" }],
  select: {
    category: true,
    subType: true,
    prices: { orderBy: { effectiveFrom: "asc" }, select: { price: true, effectiveFrom: true } },
  },
}))
  console.log(
    `  ${p.category.padEnd(8)} ${p.subType.padEnd(20)} ${p.prices
      .map((x) => `${Number(x.price)}@${x.effectiveFrom.toISOString().slice(0, 10)}`)
      .join("  ")}`,
  );
await prisma.$disconnect();

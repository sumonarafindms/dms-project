/**
 * One day's Sim Support, per RSO and per BP.
 *
 * The arithmetic is in `lib/sim-support.ts` and is tested without a database.
 * This file decides WHICH SIMs the arithmetic is given, and that is where the
 * owner's rules live. There are two payments and they count different outlets —
 * which is the single most important thing in this file, because getting it
 * wrong pays the wrong money to the right-looking person.
 *
 * ## The slab: SELECTED codes only
 *
 * An RSO earns slab support on the retailer codes the office has marked
 * (`Retailer.supportEligible`) — usually two, but there is no cap, so a future
 * rule change needs no code change. SIMs on any other code are real GA and
 * count on every other screen; they are simply not what the slab is for.
 *
 * A **BP** earns its slab on the outlet it holds as a BP. The BP assignment
 * already says which outlet that is, so no marking is needed and none is read.
 *
 * A marked code that is ALSO held as a BP that day is counted for the BP and
 * NOT for the RSO who owns it. Otherwise one outlet's SIMs would be paid twice
 * over — and it is the same rule every other figure in this app follows: a day
 * an outlet is held as a BP belongs to the holder.
 *
 * ## The SSO offer: EVERY outlet under the RSO, and no BP
 *
 * The owner's ruling, and deliberately not the slab's rule: *"SSO ta rso under
 * ar jai retailer gula sim sell kore tader sobar, kono selection nai."* Any
 * outlet under an RSO that completes SSO on an offer day earns the rate on
 * every SIM it did that day, whether or not that code is marked for the slab.
 *
 * And the SSO offer is for **RSOs only** — a BP earns its slab and nothing
 * else here. So nothing is paid twice: the BP's outlet cannot draw an SSO bonus
 * for both the BP and the owning RSO, because the BP draws none at all.
 *
 * ## Completing, not being complete
 *
 * Both shapes the owner described are one rule — the month's count crosses the
 * threshold WITH today's SIMs:
 *
 *   - nothing before, two or more today  -> completes today
 *   - one before, one or more today      -> completes today
 *   - already at two or more yesterday   -> does NOT complete again
 *
 * `ssoMinSimsSameDay` is the separate condition the company sometimes adds
 * ("one would have completed it, but you must do two today to be paid"). It
 * defaults to 1, which is no condition at all.
 */

import { prisma } from "./prisma";
import {
  SSO_MIN_MONTHLY_STANDARD_GA,
  isSimSellerRetailer,
  withGa170,
  withGa300,
  withStandardGa,
} from "./business-rules";
import { currentGa170Tariff } from "./ga-tariff";
import {
  ssoBonusFor,
  ssoQualifies,
  supportEarning,
  type SlabBasis,
  type SupportEarning,
  type SupportSchemeRule,
  type SupportTier,
} from "./sim-support";

/** A scheme row with its slabs, as the rules want it. */
export function schemeRule(row: {
  ssoRatePerSim: unknown;
  ssoMinSimsSameDay: number | null;
  slabBasis?: SlabBasis | null;
  dailyTarget?: number | null;
  slabs: { minSims: number; ratePerSim: unknown; tier?: SupportTier | null }[];
}): SupportSchemeRule {
  return {
    slabs: row.slabs.map((s) => ({ minSims: s.minSims, ratePerSim: Number(s.ratePerSim), tier: s.tier ?? "ALL" })),
    ssoRatePerSim: row.ssoRatePerSim === null || row.ssoRatePerSim === undefined ? null : Number(row.ssoRatePerSim),
    ssoMinSimsSameDay: row.ssoMinSimsSameDay,
    // v203: read as OWN whatever an old row says (lib/sim-support.ts SlabBasis).
    basis: "OWN",
    dailyTarget: row.dailyTarget ?? null,
  };
}

/** The select every scheme reader uses, so a new column cannot be missed in one of them. */
export const SCHEME_SELECT = {
  id: true,
  date: true,
  name: true,
  note: true,
  active: true,
  ssoRatePerSim: true,
  ssoMinSimsSameDay: true,
  slabBasis: true,
  dailyTarget: true,
  slabs: {
    select: { id: true, tier: true, minSims: true, ratePerSim: true },
    orderBy: [{ tier: "asc" as const }, { minSims: "asc" as const }],
  },
};

export async function schemeForDate(dateYmd: string) {
  const date = new Date(`${dateYmd}T00:00:00.000Z`);
  return prisma.supportScheme.findFirst({ where: { date, active: true }, select: SCHEME_SELECT });
}

export type SupportOutletRow = {
  retailerId: string;
  retailerCode: string;
  retailerName: string | null;
  /** Standard GA on this outlet on this day. */
  sims: number;
  /** The same SIMs by type — the two ladders of a split offer pay on these. */
  ga170: number;
  ga300: number;
};

/** An outlet that completed SSO on this day, and what that is worth. */
export type SupportSsoRow = SupportOutletRow & {
  /** The month's count BEFORE today — what makes the completion a completion. */
  beforeToday: number;
  bonus: number;
};

export type SupportPersonRow = {
  /** The employee id for an RSO; the retailer id for a BP. */
  key: string;
  kind: "RSO" | "BP";
  name: string;
  code: string | null;
  supervisorId: string | null;
  supervisor: string;
  /** The marked codes the SLAB is counted on. A BP: the outlet it holds. */
  slabOutlets: SupportOutletRow[];
  /** Outlets that completed SSO today. Always empty for a BP — RSOs only. */
  ssoOutlets: SupportSsoRow[];
  earning: SupportEarning;
};

export type SupportDay = {
  date: string;
  scheme: SupportSchemeRule | null;
  schemeName: string | null;
  schemeNote: string | null;
  people: SupportPersonRow[];
  /** RSOs with no marked code — they can earn no slab, and should know. */
  rsosWithoutCodes: { employeeId: string; name: string; code: string | null }[];
  totalPayable: number;
  totalSlab: number;
  totalSso: number;
};

export async function supportDay(dateYmd: string, scopeTo?: (employeeId: string) => boolean): Promise<SupportDay> {
  const dayStart = new Date(`${dateYmd}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
  // The month this day sits in, for the SSO threshold.
  const monthStart = new Date(`${dateYmd.slice(0, 7)}-01T00:00:00.000Z`);

  const schemeRow = await schemeForDate(dateYmd);
  const scheme = schemeRow ? schemeRule(schemeRow) : null;
  const ssoRunning = !!scheme && (Number(scheme.ssoRatePerSim) || 0) > 0;

  const tariff = await currentGa170Tariff();
  const [retailers, employees, bpAssignments, today170, today300, monthGroups] = await Promise.all([
    /*
     * EVERY outlet with an RSO, not only the marked ones.
     *
     * The slab needs the marked codes and the SSO offer needs all of them, and
     * one query answers both — about two thousand narrow rows, the same read
     * the dashboard already does.
     */
    prisma.retailer.findMany({
      where: { employeeId: { not: null } },
      select: {
        id: true,
        retailerCode: true,
        retailerName: true,
        simSeller: true,
        supportEligible: true,
        employeeId: true,
      },
    }),
    prisma.employee.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        employeeCode: true,
        supervisorId: true,
        supervisor: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    }),
    // A BP earns on the outlet it holds, on the day it holds it.
    prisma.bpAssignment.findMany({
      where: { startDate: { lt: dayEnd }, OR: [{ endDate: null }, { endDate: { gte: dayStart } }] },
      select: {
        retailerId: true,
        employeeId: true,
        retailer: { select: { id: true, retailerCode: true, retailerName: true, bpName: true, simSeller: true } },
        employee: {
          select: { name: true, employeeCode: true, supervisorId: true, supervisor: { select: { name: true } } },
        },
      },
    }),
    /*
     * Today's SIMs, by type. The two tiers partition standard GA exactly (see
     * `gaTierFilters`), so their sum is the day's standard GA and the SSO rule
     * — which counts every standard SIM — reads the sum.
     */
    prisma.gaActivation.groupBy({
      by: ["retailerId"],
      where: withGa170(tariff, { activationDate: { gte: dayStart, lt: dayEnd } }),
      _count: { _all: true },
    }),
    prisma.gaActivation.groupBy({
      by: ["retailerId"],
      where: withGa300(tariff, { activationDate: { gte: dayStart, lt: dayEnd } }),
      _count: { _all: true },
    }),
    /*
     * The month UP TO BUT NOT INCLUDING this day. That is what decides whether
     * today's SIMs are the ones that completed SSO — an outlet already over the
     * threshold yesterday does not complete again, and the offer is for
     * completing.
     */
    prisma.gaActivation.groupBy({
      by: ["retailerId"],
      where: withStandardGa({ activationDate: { gte: monthStart, lt: dayStart } }),
      _count: { _all: true },
    }),
  ]);

  const t170 = new Map(today170.map((g) => [g.retailerId, g._count._all]));
  const t300 = new Map(today300.map((g) => [g.retailerId, g._count._all]));
  const before = new Map(monthGroups.map((g) => [g.retailerId, g._count._all]));
  const g170On = (retailerId: string) => t170.get(retailerId) || 0;
  const g300On = (retailerId: string) => t300.get(retailerId) || 0;
  const simsOn = (retailerId: string) => g170On(retailerId) + g300On(retailerId);
  /** An outlet's counted SIMs, as the rules want them. */
  const outletSims = (retailerId: string) => ({
    sims: simsOn(retailerId),
    ga170: g170On(retailerId),
    ga300: g300On(retailerId),
  });
  const sumOf = (rows: SupportOutletRow[]) => ({
    total: rows.reduce((a, o) => a + o.sims, 0),
    ga170: rows.reduce((a, o) => a + o.ga170, 0),
    ga300: rows.reduce((a, o) => a + o.ga300, 0),
  });

  /*
   * Outlets held as a BP today. The holder is paid for them, so the owner is
   * not — the same rule every other figure in this app follows.
   */
  const bpHeldToday = new Set(bpAssignments.map((a) => a.retailerId));

  const completedSsoToday = (retailer: { id: string; simSeller: string | null }) =>
    ssoRunning &&
    ssoQualifies({
      simSeller: isSimSellerRetailer(retailer.simSeller),
      threshold: SSO_MIN_MONTHLY_STANDARD_GA,
      beforeToday: before.get(retailer.id) || 0,
      today: simsOn(retailer.id),
      minSimsSameDay: scheme?.ssoMinSimsSameDay,
    });

  const inScope = scopeTo ?? (() => true);
  const people: SupportPersonRow[] = [];

  /* ---------------- RSOs ---------------- */
  const byEmployee = new Map<string, typeof retailers>();
  for (const r of retailers) {
    if (!r.employeeId || !inScope(r.employeeId)) continue;
    const list = byEmployee.get(r.employeeId);
    if (list) list.push(r);
    else byEmployee.set(r.employeeId, [r]);
  }
  const employeeById = new Map(employees.map((e) => [e.id, e]));

  for (const [employeeId, mine] of byEmployee) {
    const e = employeeById.get(employeeId);
    if (!e) continue;

    const slabOutlets: SupportOutletRow[] = mine
      .filter((r) => r.supportEligible && !bpHeldToday.has(r.id))
      .map((r) => ({
        retailerId: r.id,
        retailerCode: r.retailerCode,
        retailerName: r.retailerName,
        ...outletSims(r.id),
      }));

    const ssoOutlets: SupportSsoRow[] = mine.filter(completedSsoToday).map((r) => ({
      retailerId: r.id,
      retailerCode: r.retailerCode,
      retailerName: r.retailerName,
      ...outletSims(r.id),
      beforeToday: before.get(r.id) || 0,
      bonus: ssoBonusFor(scheme!, simsOn(r.id)),
    }));

    const sims = sumOf(slabOutlets);
    const bonus = ssoOutlets.reduce((a, o) => a + o.bonus, 0);
    people.push({
      key: employeeId,
      kind: "RSO",
      name: e.name,
      code: e.employeeCode,
      supervisorId: e.supervisorId,
      supervisor: e.supervisor?.name || "Unassigned",
      slabOutlets,
      ssoOutlets,
      earning: scheme ? supportEarning(scheme, sims, bonus) : supportEarning({ slabs: [] }, sims, 0),
    });
  }

  /* ---------------- BPs ---------------- */
  /*
   * v200: ONE row per outlet. A BP can be held by two RSOs at once (v142), and
   * a hand-over from one RSO to another puts both assignments on the same day
   * (the old one ends that day, the new one starts it). One row per
   * ASSIGNMENT paid the outlet's slab twice. The BP is the outlet; it is paid
   * once, shown under the first holder the viewer may see.
   */
  const bpPaid = new Set<string>();
  for (const a of bpAssignments) {
    if (!inScope(a.employeeId)) continue;
    if (bpPaid.has(a.retailerId)) continue;
    bpPaid.add(a.retailerId);
    const counted = outletSims(a.retailerId);
    const sims = { total: counted.sims, ga170: counted.ga170, ga300: counted.ga300 };
    people.push({
      key: a.retailerId,
      kind: "BP",
      name: a.retailer.bpName || a.retailer.retailerName || a.retailer.retailerCode,
      code: a.retailer.retailerCode,
      supervisorId: a.employee.supervisorId,
      supervisor: a.employee.supervisor?.name || "Unassigned",
      slabOutlets: [
        {
          retailerId: a.retailer.id,
          retailerCode: a.retailer.retailerCode,
          retailerName: a.retailer.bpName || a.retailer.retailerName,
          ...counted,
        },
      ],
      // The SSO offer is for RSOs. A BP earns its slab and nothing else here.
      ssoOutlets: [],
      earning: scheme ? supportEarning(scheme, sims, 0) : supportEarning({ slabs: [] }, sims, 0),
    });
  }

  /*
   * An RSO with no marked code earns no SLAB, however many SIMs they sell.
   * Silence there reads as "you earned nothing today"; naming them makes it a
   * setup problem somebody can fix. They may still earn the SSO offer, which is
   * why this is not "cannot earn anything".
   */
  const marked = new Set(retailers.filter((r) => r.supportEligible).map((r) => r.employeeId));
  const rsosWithoutCodes = employees
    .filter((e) => !marked.has(e.id) && inScope(e.id))
    .map((e) => ({ employeeId: e.id, name: e.name, code: e.employeeCode }));

  people.sort((a, b) => b.earning.total - a.earning.total || a.name.localeCompare(b.name));

  return {
    date: dateYmd,
    scheme,
    schemeName: schemeRow?.name ?? null,
    schemeNote: schemeRow?.note ?? null,
    people,
    rsosWithoutCodes,
    totalPayable: people.reduce((a, p) => a + p.earning.total, 0),
    totalSlab: people.reduce((a, p) => a + p.earning.slabAmount, 0),
    totalSso: people.reduce((a, p) => a + p.earning.ssoBonus, 0),
  };
}

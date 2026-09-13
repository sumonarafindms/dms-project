import { prisma } from "./prisma";
import { ImportType } from "@prisma/client";
import { withStandardGa } from "./business-rules";
import { standardGaByAssignment } from "./bp-activations";
import { managerScope } from "./manager-scope";

/**
 * One day's GA, for whoever is looking at it.
 *
 * ## What this is for
 *
 * Every other GA view in this app is a period: a month, a range, a target.
 * This one answers a single question an RSO asks at four in the afternoon —
 * *how many have I done today?* — and the same question for the people above
 * them, each at their own level.
 *
 * ## The rules, as the owner set them
 *
 * - **Today**, in Dhaka. Not "the last day with data": if nobody has activated
 *   a SIM yet, or today's file has not been uploaded, the honest answer is
 *   **0**, and that is what every level shows. A page that quietly fell back to
 *   yesterday would be worse than an empty one — it would look like today.
 * - **Standard GA only.** SIMWAP and EV-SWAP are replacements, excluded here
 *   exactly as they are excluded from Total GA everywhere else, and not shown
 *   as a separate column either: this screen answers one question.
 * - **Only who did something.** At the retailer level the list is the outlets
 *   that actually activated today. A list of two thousand shops with a zero
 *   beside each is not a live view.
 * - **When the data was last refreshed**, because a number with no timestamp
 *   invites the reader to assume it is current, and on the day nobody uploads
 *   the file that assumption is wrong.
 *
 * ## Why the counting goes through `standardGaByAssignment`
 *
 * A BP is a retailer, so its activations are that retailer's. But a BP can be
 * served by more than one RSO and assignments start and end mid-period (v139,
 * v142), so "GA at this retailer today" is not automatically "GA this BP did
 * today". `standardGaByAssignment` already applies each assignment's own window
 * in one query; using it here keeps this screen agreeing with BP Performance
 * rather than inventing a second answer.
 */

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

/** The activation date a GA row carries for a given Dhaka day. */
export function gaDayBounds(ymd: string) {
  /*
   * `GaActivation.activationDate` is stored by the importer as UTC midnight of
   * the date printed in the file (`dateOnlyUtc`), NOT as an instant. So a day
   * is an exact range over that midnight, and must not be shifted by the Dhaka
   * offset a second time — doing that would return the previous day's rows all
   * morning, which is precisely the kind of error nobody notices until month
   * end.
   */
  const start = new Date(`${ymd}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** Today in Dhaka, as the app's other screens compute it. */
export function dhakaToday(now = new Date()) {
  const d = new Date(now.getTime() + DHAKA_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export type LiveViewer = {
  role: string;
  /** Set for an RSO. */
  employeeId?: string | null;
  /** Set for a SUPERVISOR. */
  supervisorId?: string | null;
  /** Set for a BP. */
  bpRetailerId?: string | null;
  /** The user's own id, used to resolve a MANAGER's supervisors. */
  userId: string;
};

export type LiveRow = {
  id: string;
  name: string;
  /** A code, a mobile number — whatever identifies this row to a human. */
  meta: string | null;
  count: number;
  /** Set when this row can be opened to see the level below it. */
  href?: string;
};

export type LiveSection = {
  key: string;
  title: string;
  /** Shown when the section has no rows at all. */
  empty: string;
  rows: LiveRow[];
};

export type LiveGa = {
  date: string;
  /** What this viewer's own total is — the headline number. */
  total: number;
  /** "Supervisors", "RSOs", "Retailers" … whatever the headline counts over. */
  scope: string;
  sections: LiveSection[];
  lastUpload: { at: Date; fileName: string } | null;
  /** Set when a supervisor's name is being drilled into. */
  focus: string | null;
};

/** When the GA file was last brought in, whatever day it covered. */
export async function lastGaUpload() {
  const batch = await prisma.importBatch.findFirst({
    where: { type: ImportType.GA, status: { in: ["COMPLETED", "COMPLETED_WITH_ERRORS"] } },
    orderBy: { uploadedAt: "desc" },
    select: { uploadedAt: true, fileName: true },
  });
  return batch ? { at: batch.uploadedAt, fileName: batch.fileName } : null;
}

/**
 * Standard-GA counts for one day, grouped by retailer, in one query.
 *
 * Everything below is built from this. Counting per employee or per supervisor
 * with its own query would be one round trip per row — the defect this project
 * has already fixed twice (v120's BP list, v163's monthly summaries).
 */
async function gaByRetailer(ymd: string, retailerWhere: Record<string, unknown> = {}) {
  const { start, end } = gaDayBounds(ymd);
  const groups = await prisma.gaActivation.groupBy({
    by: ["retailerId"],
    where: withStandardGa({ activationDate: { gte: start, lt: end }, retailer: retailerWhere }),
    _count: { _all: true },
  });
  return new Map(groups.map((g) => [g.retailerId, g._count._all]));
}

/** The BP assignments in scope, with each one's count for the day. */
async function bpRows(ymd: string, where: Record<string, unknown>): Promise<LiveRow[]> {
  const { start, end } = gaDayBounds(ymd);
  const assignments = await prisma.bpAssignment.findMany({
    where: { active: true, ...where },
    select: {
      id: true,
      retailerId: true,
      startDate: true,
      endDate: true,
      retailer: { select: { retailerCode: true, retailerName: true } },
      employee: { select: { name: true } },
    },
  });
  if (!assignments.length) return [];
  const counts = await standardGaByAssignment(assignments, start, end);
  return assignments
    .map((a) => ({
      id: a.id,
      name: a.retailer.retailerName || a.retailer.retailerCode,
      meta: `${a.retailer.retailerCode}${a.employee?.name ? ` · ${a.employee.name}` : ""}`,
      count: counts.get(a.id) ?? 0,
    }))
    .sort((x, y) => y.count - x.count || x.name.localeCompare(y.name));
}

/**
 * Sums a per-retailer map over a set of retailers grouped by some owner.
 * Retailers with no activation today simply are not in the map.
 */
function totalFor(counts: Map<string, number>, retailerIds: string[]) {
  return retailerIds.reduce((n, id) => n + (counts.get(id) ?? 0), 0);
}

export async function buildLiveGa(viewer: LiveViewer, ymd: string, supervisorFocus?: string | null): Promise<LiveGa> {
  const lastUpload = await lastGaUpload();
  const base = { date: ymd, lastUpload, focus: null as string | null };

  /* ---------------------------------------------------------------- BP */
  if (viewer.role === "BP") {
    if (!viewer.bpRetailerId) return { ...base, total: 0, scope: "Today", sections: [] };
    const rows = await bpRows(ymd, { retailerId: viewer.bpRetailerId });
    return { ...base, total: rows.reduce((n, r) => n + r.count, 0), scope: "Your activations today", sections: [] };
  }

  /* --------------------------------------------------------------- RSO */
  if (viewer.role === "RSO") {
    const employeeId = viewer.employeeId;
    if (!employeeId) return { ...base, total: 0, scope: "Today", sections: [] };

    const retailers = await prisma.retailer.findMany({
      where: { employeeId, active: true },
      select: { id: true, retailerCode: true, retailerName: true, iTopUpNumber: true },
    });
    const counts = await gaByRetailer(ymd, { employeeId, active: true });

    /*
     * Only the outlets that did something. The owner asked for this
     * specifically, and it is what makes the screen readable on a phone: the
     * list is the day's work, not the territory.
     */
    const active = retailers
      .filter((r) => (counts.get(r.id) ?? 0) > 0)
      .map((r) => ({
        id: r.id,
        name: r.retailerName || r.retailerCode,
        meta: [r.retailerCode, r.iTopUpNumber].filter(Boolean).join(" · "),
        count: counts.get(r.id) ?? 0,
      }))
      .sort((x, y) => y.count - x.count || x.name.localeCompare(y.name));

    const bps = await bpRows(ymd, { employeeId });
    return {
      ...base,
      total: totalFor(
        counts,
        retailers.map((r) => r.id),
      ),
      scope: "Your activations today",
      sections: [
        { key: "retailers", title: "Retailers", empty: "No retailer has activated a SIM yet today.", rows: active },
        { key: "bps", title: "BPs", empty: "No BP is assigned to you.", rows: bps },
      ],
    };
  }

  /* -------------------------------------------------- SUPERVISOR level */
  if (viewer.role === "SUPERVISOR") {
    const supervisorId = viewer.supervisorId;
    if (!supervisorId) return { ...base, total: 0, scope: "Today", sections: [] };
    return teamView(ymd, { supervisorId, active: true }, { employee: { supervisorId } }, base, "Your team today");
  }

  /* --------------------------------------- ADMIN / IT / MANAGER level */
  const supervisorWhere =
    viewer.role === "MANAGER"
      ? { id: { in: (await managerScope(viewer.userId)).supervisorIds }, active: true }
      : { active: true };

  if (supervisorFocus) {
    const supervisor = await prisma.supervisor.findFirst({
      where: { ...supervisorWhere, name: supervisorFocus },
      select: { id: true, name: true },
    });
    if (supervisor)
      return {
        ...(await teamView(
          ymd,
          { supervisorId: supervisor.id, active: true },
          { employee: { supervisorId: supervisor.id } },
          base,
          `${supervisor.name}'s team today`,
        )),
        focus: supervisor.name,
      };
  }

  const supervisors = await prisma.supervisor.findMany({
    where: supervisorWhere,
    select: { id: true, name: true, employees: { where: { active: true }, select: { id: true } } },
  });
  const employeeIds = supervisors.flatMap((s) => s.employees.map((e) => e.id));
  const retailers = employeeIds.length
    ? await prisma.retailer.findMany({
        where: { employeeId: { in: employeeIds }, active: true },
        select: { id: true, employeeId: true },
      })
    : [];
  const counts = await gaByRetailer(ymd, { employeeId: { in: employeeIds }, active: true });

  const byEmployee = new Map<string, string[]>();
  for (const r of retailers) {
    if (!r.employeeId) continue;
    const list = byEmployee.get(r.employeeId) ?? [];
    list.push(r.id);
    byEmployee.set(r.employeeId, list);
  }

  const rows = supervisors
    .map((s) => ({
      id: s.id,
      name: s.name,
      meta: `${s.employees.length} RSO${s.employees.length === 1 ? "" : "s"}`,
      count: s.employees.reduce((n, e) => n + totalFor(counts, byEmployee.get(e.id) ?? []), 0),
      href: `/live-ga?supervisor=${encodeURIComponent(s.name)}`,
    }))
    .sort((x, y) => y.count - x.count || x.name.localeCompare(y.name));

  return {
    ...base,
    total: rows.reduce((n, r) => n + r.count, 0),
    scope: "Everyone today",
    sections: [{ key: "supervisors", title: "Supervisors", empty: "No supervisor is active.", rows }],
  };
}

/** The RSO-and-BP breakdown under one supervisor, used at two levels. */
async function teamView(
  ymd: string,
  employeeWhere: Record<string, unknown>,
  bpWhere: Record<string, unknown>,
  base: { date: string; lastUpload: LiveGa["lastUpload"]; focus: string | null },
  scope: string,
): Promise<LiveGa> {
  const employees = await prisma.employee.findMany({
    where: employeeWhere,
    select: { id: true, name: true, employeeCode: true, rsoMsisdn: true },
  });
  const employeeIds = employees.map((e) => e.id);
  const retailers = employeeIds.length
    ? await prisma.retailer.findMany({
        where: { employeeId: { in: employeeIds }, active: true },
        select: { id: true, employeeId: true },
      })
    : [];
  const counts = await gaByRetailer(ymd, { employeeId: { in: employeeIds }, active: true });

  const byEmployee = new Map<string, string[]>();
  for (const r of retailers) {
    if (!r.employeeId) continue;
    const list = byEmployee.get(r.employeeId) ?? [];
    list.push(r.id);
    byEmployee.set(r.employeeId, list);
  }

  const rsoRows = employees
    .map((e) => ({
      id: e.id,
      name: e.name,
      meta: [e.employeeCode, e.rsoMsisdn].filter(Boolean).join(" · ") || null,
      count: totalFor(counts, byEmployee.get(e.id) ?? []),
    }))
    .sort((x, y) => y.count - x.count || x.name.localeCompare(y.name));

  const bps = await bpRows(ymd, bpWhere);

  /*
   * The headline is the RSO total, and the BP list is a breakdown inside it —
   * a BP's retailer is one of its RSO's retailers, so adding the two would
   * count the same activation twice. That is the kind of double count nobody
   * spots until a target looks met.
   */
  return {
    ...base,
    total: rsoRows.reduce((n, r) => n + r.count, 0),
    scope,
    sections: [
      { key: "rsos", title: "RSOs", empty: "No RSO is active in this team.", rows: rsoRows },
      { key: "bps", title: "BPs", empty: "No BP is assigned in this team.", rows: bps },
    ],
  };
}

/**
 * What a campaign has actually achieved, at every level.
 *
 * The rules live in `lib/campaign.ts` and are tested without a database. This
 * file is the queries, and it reuses two things deliberately rather than
 * writing a third copy:
 *
 *   - `withStandardGa` from lib/business-rules — a campaign counts SIMs, and
 *     "a SIM" means exactly what it means on every other screen: standard GA,
 *     swaps excluded. A campaign that counted swaps would report numbers the
 *     dashboard disagrees with.
 *
 *   - `bpLedger` from lib/bp-ledger — a day an outlet is held as a BP belongs
 *     to the holder, not to the RSO who services it. Every other aggregation
 *     path in this app applies that rule; a campaign that ignored it would
 *     credit an RSO for SIMs their BP sold, which is the flattering error v136
 *     set out to remove.
 */

import { prisma } from "./prisma";
import { withStandardGa } from "./business-rules";
import { bpLedger } from "./bp-ledger";
import {
  campaignDaysLeft,
  campaignPhase,
  groupTotal,
  progressOf,
  targetFor,
  type CampaignProgress,
  type CampaignRule,
  type CampaignScope,
} from "./campaign";
import { dhakaTodayYmd } from "./business-time";

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** The stored row, as the rules want it. */
export function campaignRule(row: {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  scope: CampaignScope;
  totalTarget: number | null;
  perEmployeeTarget: number | null;
  active: boolean;
}): CampaignRule {
  return {
    id: row.id,
    name: row.name,
    startDate: ymd(row.startDate),
    endDate: ymd(row.endDate),
    scope: row.scope,
    totalTarget: row.totalTarget,
    perEmployeeTarget: row.perEmployeeTarget,
    active: row.active,
  };
}

export type CampaignEmployeeRow = {
  employeeId: string;
  employeeCode: string | null;
  name: string;
  supervisorId: string | null;
  supervisor: string;
  /** Their own outlets' SIMs — BP-held days removed, as everywhere else. */
  own: number;
  /** SIMs from outlets they hold as a BP, counted once per holder. */
  bpHeld: number;
  /**
   * Those SIMs keyed on retailer id, which is what a TEAM total needs.
   *
   * An outlet held by two RSOs appears in both their rows with the same
   * figure — correctly, since each is measured on the whole outlet. Adding the
   * rows would count it twice, so `groupTotal` unions this map instead. The
   * v189 audit found exactly that: 67,409 against SQL's 67,398.
   */
  bpByRetailer: Record<string, number>;
  achieved: number;
  target: number | null;
  progress: CampaignProgress;
};

export type CampaignSupervisorRow = {
  supervisorId: string | null;
  supervisor: string;
  rsos: number;
  /** RSOs in this campaign — a supervisor may have people it does not cover. */
  inCampaign: number;
  target: number;
  achieved: number;
  progress: CampaignProgress;
};

export type CampaignReport = {
  campaign: CampaignRule;
  phase: ReturnType<typeof campaignPhase>;
  daysLeft: number;
  /** The whole distribution. For DISTRIBUTION scope this is the only figure. */
  company: CampaignProgress;
  /** Empty on a DISTRIBUTION campaign: no per-person number was set. */
  employees: CampaignEmployeeRow[];
  supervisors: CampaignSupervisorRow[];
  /** SIMs in the window that no in-scope employee could be credited with. */
  unattributed: number;
};

/**
 * One campaign, rolled up.
 *
 * `scopeTo` narrows the PEOPLE a caller may see — a supervisor's page passes
 * their own RSOs. The company figure is deliberately NOT narrowed: a supervisor
 * looking at a distribution-wide campaign should see the distribution's number,
 * because that is the number the campaign is about.
 */
export async function campaignReport(
  campaignRow: Parameters<typeof campaignRule>[0] & { targets: { employeeId: string; target: number }[] },
  scopeTo?: (employeeId: string) => boolean,
  todayYmd = dhakaTodayYmd(),
): Promise<CampaignReport> {
  const campaign = campaignRule(campaignRow);
  /*
   * The window, as instants.
   *
   * `endDate` is an inclusive calendar date, so the query runs to the START of
   * the following day. Using the end date itself as `lt` loses the last day of
   * every campaign, and using `lte` on a DateTime column would keep only
   * activations at exactly midnight.
   */
  const start = new Date(`${campaign.startDate}T00:00:00.000Z`);
  const end = new Date(`${campaign.endDate}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);

  const [employees, retailers, gaGroups, assignments] = await Promise.all([
    prisma.employee.findMany({
      where: { active: true },
      select: {
        id: true,
        employeeCode: true,
        name: true,
        supervisorId: true,
        supervisor: { select: { name: true } },
      },
      orderBy: [{ supervisor: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.retailer.findMany({
      where: { employeeId: { not: null } },
      select: { id: true, employeeId: true },
    }),
    /*
     * Grouped by DAY as well as retailer, because a BP assignment starts and
     * ends on a date: without the day there is no way to give the 11th to the
     * RSO and the 13th to the BP.
     */
    prisma.gaActivation.groupBy({
      by: ["retailerId", "activationDate"],
      where: withStandardGa({ activationDate: { gte: start, lt: end } }),
      _count: { _all: true },
    }),
    prisma.bpAssignment.findMany({
      where: { startDate: { lt: end }, OR: [{ endDate: null }, { endDate: { gte: start } }] },
      select: {
        retailerId: true,
        employeeId: true,
        startDate: true,
        endDate: true,
        gaTarget: true,
        monthlyTargets: { select: { month: true, gaTarget: true } },
      },
    }),
  ]);

  const ownerOf = new Map(retailers.map((r) => [r.id, r.employeeId]));
  const inScope = scopeTo ?? (() => true);
  const ledger = bpLedger(assignments, start, end, inScope);

  const ownByEmployee = new Map<string, number>();
  let companyTotal = 0;
  let unattributed = 0;

  for (const group of gaGroups) {
    const count = group._count._all;
    companyTotal += count;
    const employeeId = ownerOf.get(group.retailerId);
    const day = group.activationDate.getTime();
    if (ledger.ownsDay(group.retailerId, day)) {
      // Held as a BP that day: the holder is credited, the owner is not.
      ledger.credit(group.retailerId, day, employeeId, (f) => {
        f.gaAchieved += count;
      });
      continue;
    }
    if (!employeeId) {
      // An outlet with no RSO. Its SIMs are real and belong in the company
      // total; they simply cannot be put under anybody's name.
      unattributed += count;
      continue;
    }
    ownByEmployee.set(employeeId, (ownByEmployee.get(employeeId) || 0) + count);
  }

  const overrides = new Map(campaignRow.targets.map((t) => [t.employeeId, t.target]));
  const visible = employees.filter((e) => inScope(e.id));

  const employeeRows: CampaignEmployeeRow[] =
    campaign.scope === "PER_EMPLOYEE"
      ? visible.map((e) => {
          const own = ownByEmployee.get(e.id) || 0;
          const portion = ledger.portionFor(e.id);
          const bpHeld = portion.gaAchieved;
          const bpByRetailer = Object.fromEntries(
            Object.entries(portion.byRetailer).map(([retailerId, f]) => [retailerId, f.gaAchieved]),
          );
          const achieved = own + bpHeld;
          const target = targetFor(campaign, e.id, overrides);
          return {
            employeeId: e.id,
            employeeCode: e.employeeCode,
            name: e.name,
            supervisorId: e.supervisorId,
            supervisor: e.supervisor?.name || "Unassigned",
            own,
            bpHeld,
            bpByRetailer,
            achieved,
            target,
            progress: progressOf(target, achieved),
          };
        })
      : [];

  /*
   * Supervisor rows are grouped on the supervisor's ID, never on their name:
   * two supervisors can share a name and a name-keyed roll-up merges their
   * teams into one row without saying so — the defect v181 found.
   */
  const bySupervisor = new Map<string, CampaignEmployeeRow[]>();
  for (const row of employeeRows) {
    const key = row.supervisorId ?? "unassigned";
    const list = bySupervisor.get(key);
    if (list) list.push(row);
    else bySupervisor.set(key, [row]);
  }
  const supervisors: CampaignSupervisorRow[] = [...bySupervisor.entries()].map(([key, rows]) => {
    const total = groupTotal(rows);
    return {
      supervisorId: key === "unassigned" ? null : key,
      supervisor: rows[0]?.supervisor || "Unassigned",
      rsos: total.members,
      inCampaign: total.withTarget,
      target: total.target,
      achieved: total.achieved,
      // A team where nobody carries a target has no percentage, not 0%.
      progress: progressOf(total.withTarget ? total.target : null, total.achieved),
    };
  });

  const company =
    campaign.scope === "DISTRIBUTION"
      ? progressOf(campaign.totalTarget, companyTotal)
      : (() => {
          /*
           * v200: the WHOLE distribution's target against the whole
           * distribution's SIMs. Summing only the rows this viewer may see put
           * a supervisor's 10 × 25 = 250 over the company's 3,000 — "3,000 of
           * 250 · complete". Both sides of the fraction are now company-wide.
           */
          let target = 0;
          let withTarget = 0;
          for (const e of employees) {
            const t = targetFor(campaign, e.id, overrides);
            if (t === null) continue;
            target += t;
            withTarget += 1;
          }
          return progressOf(withTarget ? target : null, companyTotal);
        })();

  return {
    campaign,
    phase: campaignPhase(campaign, todayYmd),
    daysLeft: campaignDaysLeft(campaign, todayYmd),
    company,
    employees: employeeRows,
    supervisors,
    unattributed,
  };
}

/**
 * One employee's line for a campaign, for their own screen.
 *
 * Built from the same `campaignReport` rather than a second query, so an RSO's
 * own page and the manager's list of RSOs can never disagree about that RSO.
 */
export function campaignLineFor(report: CampaignReport, employeeId: string): CampaignEmployeeRow | null {
  return report.employees.find((e) => e.employeeId === employeeId) ?? null;
}

/**
 * A BP's own line (v200).
 *
 * A BP is an outlet, not an employee, so `campaignLineFor` never found one: the
 * BP's page said the campaign "has no number for you" and its list card led
 * with the holder RSO's target against the distribution total. The outlet's
 * figure is already in the report — each holder carries the WHOLE outlet in
 * `bpByRetailer` — so it is read from there once (max, not sum: two holders
 * carry the same SIMs). A campaign's targets are per RSO, so the BP has none.
 */
export function campaignOutletLine(report: CampaignReport, retailerId: string): CampaignEmployeeRow | null {
  let achieved: number | null = null;
  for (const e of report.employees) {
    const v = e.bpByRetailer[retailerId];
    if (v !== undefined) achieved = Math.max(achieved ?? 0, v);
  }
  if (achieved === null) return null;
  return {
    employeeId: retailerId,
    employeeCode: null,
    name: "Your outlet",
    supervisorId: null,
    supervisor: "",
    own: achieved,
    bpHeld: 0,
    bpByRetailer: {},
    achieved,
    target: null,
    progress: progressOf(null, achieved),
  };
}

/**
 * Campaigns — a target with a start and an end, which is what makes them
 * different from everything else in this app.
 *
 * Every other target here is MONTHLY: `MonthlyTarget`, `SupervisorMonthlyTarget`,
 * `BpMonthlyTarget` are all keyed on a month. A campaign is "500 SIMs between
 * the 1st and the 10th" or "25 SIMs each, this fortnight", so its window is its
 * own and nothing about it can be derived from a month.
 *
 * ## Two scopes, and they answer different questions
 *
 *   DISTRIBUTION   one number for the whole distribution. The only questions
 *                  are how many SIMs are needed and how many are done, so that
 *                  is all the screen shows. No per-RSO breakdown exists,
 *                  because none was set.
 *
 *   PER_EMPLOYEE   a number each. Everyone above an RSO then has a real total —
 *                  a supervisor's is their own RSOs' targets added up, the
 *                  company's is all of them — and everyone can see what is
 *                  still needed at their own level.
 *
 * Reading a DISTRIBUTION campaign as if it had per-RSO targets would invent
 * numbers nobody set, so `targetFor` returns null for it and every caller has
 * to decide what to say. That is v175's rule ("not set is not zero") applied to
 * a whole scope rather than to one field.
 *
 * ## The per-employee number
 *
 * One number is typed for the campaign and every employee in scope gets it.
 * An override row changes it for one person — a new RSO given 10 where everyone
 * else has 25 — and `targetFor` prefers the override. An override of ZERO is
 * meaningful ("this person is out of this campaign") and must not be read as
 * "no override", which is why the lookup tests for presence rather than
 * truthiness.
 *
 * Prisma-free on purpose: the arithmetic is tested without a database and the
 * same functions run on both sides of the RSC boundary.
 */

export type CampaignScope = "DISTRIBUTION" | "PER_EMPLOYEE";

export const CAMPAIGN_SCOPES: CampaignScope[] = ["DISTRIBUTION", "PER_EMPLOYEE"];

export const CAMPAIGN_SCOPE_LABEL: Record<CampaignScope, string> = {
  DISTRIBUTION: "Whole distribution",
  PER_EMPLOYEE: "Per RSO / BP",
};

export const CAMPAIGN_SCOPE_HINT: Record<CampaignScope, string> = {
  DISTRIBUTION: "One total for everyone together. The screens show how many SIMs are needed and how many are done.",
  PER_EMPLOYEE:
    "A number each. Supervisors and managers also see what their own level still needs, added up from the people under them.",
};

export type CampaignRule = {
  id: string;
  name: string;
  /** YYYY-MM-DD, inclusive. */
  startDate: string;
  /** YYYY-MM-DD, inclusive. */
  endDate: string;
  scope: CampaignScope;
  /** DISTRIBUTION only. */
  totalTarget: number | null;
  /** PER_EMPLOYEE only — the number everyone gets unless overridden. */
  perEmployeeTarget: number | null;
  active: boolean;
};

/* ------------------------------------------------------------------ *
 * Where a campaign is in time
 * ------------------------------------------------------------------ */

export type CampaignPhase = "UPCOMING" | "RUNNING" | "ENDED";

export const CAMPAIGN_PHASE_LABEL: Record<CampaignPhase, string> = {
  UPCOMING: "Upcoming",
  RUNNING: "Running",
  ENDED: "Ended",
};

/**
 * Compared as YYYY-MM-DD strings against the Dhaka business day, never as
 * Date objects. The dates a campaign carries are calendar dates the owner
 * typed; turning them into instants to compare them is how a campaign ends a
 * day early for everyone six hours west of Dhaka.
 */
export function campaignPhase(campaign: Pick<CampaignRule, "startDate" | "endDate">, todayYmd: string): CampaignPhase {
  if (todayYmd < campaign.startDate) return "UPCOMING";
  if (todayYmd > campaign.endDate) return "ENDED";
  return "RUNNING";
}

/** Inclusive day count. A one-day campaign is 1, not 0. */
export function campaignDays(campaign: Pick<CampaignRule, "startDate" | "endDate">) {
  const a = Date.parse(`${campaign.startDate}T00:00:00Z`);
  const b = Date.parse(`${campaign.endDate}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

/** Days still to run, counting today. 0 once it has ended. */
export function campaignDaysLeft(campaign: Pick<CampaignRule, "startDate" | "endDate">, todayYmd: string) {
  if (todayYmd > campaign.endDate) return 0;
  const from = todayYmd < campaign.startDate ? campaign.startDate : todayYmd;
  return campaignDays({ startDate: from, endDate: campaign.endDate });
}

/* ------------------------------------------------------------------ *
 * Targets
 * ------------------------------------------------------------------ */

/**
 * One person's campaign target, or null when the campaign does not set one.
 *
 * `overrides` is keyed on employee id, never on name — two employees can share
 * a name and v181 found what that costs.
 */
export function targetFor(
  campaign: Pick<CampaignRule, "scope" | "perEmployeeTarget">,
  employeeId: string,
  overrides: ReadonlyMap<string, number> | Record<string, number> = {},
): number | null {
  if (campaign.scope !== "PER_EMPLOYEE") return null;
  const has =
    overrides instanceof Map ? overrides.has(employeeId) : Object.prototype.hasOwnProperty.call(overrides, employeeId);
  if (has) {
    const value =
      overrides instanceof Map ? overrides.get(employeeId) : (overrides as Record<string, number>)[employeeId];
    // Zero is a decision, not an absence.
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  }
  const base = campaign.perEmployeeTarget;
  return typeof base === "number" && Number.isFinite(base) ? Math.max(0, Math.round(base)) : null;
}

export type CampaignProgress = {
  /** null when nobody set one — the screens print "No target", never 0%. */
  target: number | null;
  achieved: number;
  /** Still to sell. null when there is no target to be short of. */
  remaining: number | null;
  /** 0-100+, or null with no target. Not clamped: over-achievement is real. */
  percent: number | null;
  complete: boolean;
};

export function progressOf(target: number | null, achieved: number): CampaignProgress {
  const done = Math.max(0, Math.round(achieved));
  if (target === null || !(target > 0))
    return { target: target === null ? null : target, achieved: done, remaining: null, percent: null, complete: false };
  return {
    target,
    achieved: done,
    remaining: Math.max(0, target - done),
    percent: Math.round((done / target) * 100),
    complete: done >= target,
  };
}

/**
 * A team's campaign figures.
 *
 * ## The targets
 *
 * Only the people who HAVE a target contribute. An RSO left out of a
 * PER_EMPLOYEE campaign — override 0, or no base target at all — must not pull
 * the team's target down, and must not be counted as a member who is behind.
 * `withTarget` is returned so a screen can say "6 of 8 RSOs are in this
 * campaign" instead of implying all eight are.
 *
 * ## The achievement, and why it is not a sum
 *
 * An RSO's row carries the WHOLE of every outlet they hold as a BP, because
 * each holder is measured on the whole outlet. Since v142 an outlet may be held
 * by SEVERAL RSOs at once, so adding their rows counts that outlet once per
 * holder. The v189 audit walked into it immediately: a team total read 67,409
 * against SQL's 67,398 — eleven SIMs from one outlet held by two RSOs.
 *
 * `teamTotals()` in lib/bp-rollup.ts solves this for the performance screens by
 * unioning each BP retailer before adding. A campaign row is not a RollupRow,
 * so the same rule is applied here to the same shape of data: the RSOs' OWN
 * figures add up, and the BP-held ones are collected by retailer id first.
 */
export type CampaignGroupTotal = {
  target: number;
  achieved: number;
  members: number;
  withTarget: number;
};

export type CampaignGroupRow = {
  target: number | null;
  /** The RSO's own outlets. These add up. */
  own: number;
  /**
   * SIMs from outlets held as a BP, keyed on retailer id. These are UNIONED —
   * see the note above. A plain `achieved` cannot be used for a team, because
   * it has already lost which outlet the figure came from.
   */
  bpByRetailer: Readonly<Record<string, number>>;
};

export function groupTotal(rows: readonly CampaignGroupRow[]): CampaignGroupTotal {
  let target = 0;
  let own = 0;
  let withTarget = 0;
  const bp = new Map<string, number>();
  for (const r of rows) {
    own += Math.max(0, Math.round(r.own));
    // The same retailer from a second holder carries the same figure, so the
    // first entry already says everything. Overwrite rather than add.
    for (const [retailerId, sims] of Object.entries(r.bpByRetailer)) bp.set(retailerId, sims);
    if (r.target !== null && r.target > 0) {
      target += r.target;
      withTarget++;
    }
  }
  let achieved = own;
  for (const sims of bp.values()) achieved += Math.max(0, Math.round(sims));
  return { target, achieved, members: rows.length, withTarget };
}

/**
 * "12 of 25 · 13 to go" — the one line every level shows.
 *
 * With no target it says so rather than printing a percentage of nothing.
 */
export function progressLabel(p: CampaignProgress, noun = "SIM") {
  if (p.target === null || !(p.target > 0))
    return `${p.achieved.toLocaleString("en-US")} ${noun}${p.achieved === 1 ? "" : "s"} · no target set`;
  if (p.complete) return `${p.achieved.toLocaleString("en-US")} of ${p.target.toLocaleString("en-US")} · complete`;
  return `${p.achieved.toLocaleString("en-US")} of ${p.target.toLocaleString("en-US")} · ${(p.remaining ?? 0).toLocaleString("en-US")} to go`;
}

/**
 * The pace line, and the reason it is a separate function.
 *
 * A campaign that is 40% done on its last day is in trouble; the same 40% on
 * day one is fine. `perDay` is what the remaining days must average, and it is
 * null when there is nothing to average — no target, already complete, or no
 * days left, and those three are different sentences on screen.
 */
export function campaignPace(p: CampaignProgress, daysLeft: number): { perDay: number | null; daysLeft: number } {
  if (p.target === null || !(p.target > 0) || p.complete || daysLeft <= 0) return { perDay: null, daysLeft };
  return { perDay: Math.ceil((p.remaining ?? 0) / daysLeft), daysLeft };
}

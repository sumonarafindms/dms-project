/**
 * Achievement and pace bands.
 *
 * Split out of lib/business-rules.ts and kept dependency-free on purpose:
 * business-rules.ts imports `@prisma/client` for its Prisma.* where-input
 * types, and the admin dashboard is a client component. Importing the rules
 * module there would drag Prisma into the browser bundle. Everything in this
 * file is plain arithmetic, so it is safe on both sides.
 *
 * business-rules.ts re-exports all of it, so server code can keep importing
 * business rules from the one place it always has.
 */

/* ------------------------------------------------------------------ *
 * Achievement bands
 * ------------------------------------------------------------------ *
 * How an achievement percentage is labelled for the user. Before this file
 * the same question was answered with three different numbers in four
 * different places: the admin dashboard called anything >= 70 "on track",
 * while the manager and supervisor pages used >= 80 with a second "Watch"
 * step at 50. Same employee, same month, two different answers.
 *
 * The dashboard now uses the 80 cutoff like everywhere else, so its
 * "on track" count reads slightly lower than it did before — that is the
 * correction, not a regression.
 *
 * These are the numbers a distributor may want to tune; keep them here
 * rather than inline so there is one place to change them.
 */

/** At or above this percent of target, an entity is on track. */
export const ACHIEVEMENT_ON_TRACK_PERCENT = 80;
/** At or above this percent (but below on-track), an entity needs watching. */
export const ACHIEVEMENT_WATCH_PERCENT = 50;

export type AchievementBand = "On track" | "Watch" | "Behind";

/** Labels a raw achievement percentage. */
export function achievementBand(percent: number): AchievementBand {
  if (percent >= ACHIEVEMENT_ON_TRACK_PERCENT) return "On track";
  if (percent >= ACHIEVEMENT_WATCH_PERCENT) return "Watch";
  return "Behind";
}

/** Short token for styling hooks, matching achievementBand(). */
export function achievementTone(percent: number): "good" | "mid" | "low" {
  if (percent >= ACHIEVEMENT_ON_TRACK_PERCENT) return "good";
  if (percent >= ACHIEVEMENT_WATCH_PERCENT) return "mid";
  return "low";
}

/* ------------------------------------------------------------------ *
 * Pace bands
 * ------------------------------------------------------------------ *
 * A different question from the band above: not "how much of the target is
 * done" but "is that enough for how far into the month we are". An RSO at
 * 40% on the 12th is ahead; the same 40% on the 28th is behind. Compared
 * against expected pace, so the margins below are percentage points either
 * side of it, not absolute percentages.
 *
 * Values are unchanged from the inline copies these replaced in ManagerUI
 * and PerformanceIntelligence — this only gives them a name.
 */

/** Percentage points above expected pace that count as ahead. */
export const PACE_AHEAD_MARGIN = 8;
/** Percentage points below expected pace still counted as on track. */
export const PACE_BEHIND_MARGIN = 5;

export type PaceBand = "Ahead" | "On track" | "Behind";

/** Labels actual progress against the pace expected by this point in the month. */
export function paceBand(actualPercent: number, expectedPercent: number): PaceBand {
  const gap = actualPercent - expectedPercent;
  if (gap >= PACE_AHEAD_MARGIN) return "Ahead";
  if (gap >= -PACE_BEHIND_MARGIN) return "On track";
  return "Behind";
}

/* ------------------------------------------------------------------ *
 * Target bands (the role-UI scheme)
 * ------------------------------------------------------------------ *
 * The six role demos label a percentage with three states and two cut
 * points: 100 and 80.
 *
 *     >= 100  "Target Achieved"   80-99  "Near Target"   < 80  "Behind Target"
 *
 * That is a different question from achievementBand() above, which asks
 * how much management attention a row needs and answers in three bands
 * at 80/50. Both agree on 80 as the line between acceptable and not, so
 * they share ACHIEVEMENT_ON_TRACK_PERCENT rather than each owning a copy.
 *
 * Every ring, progress bar and status badge in the role UI is coloured
 * from this function, so a percentage is classified once in TypeScript
 * and reaches CSS as a class name.
 */

export type TargetBand = "achieved" | "near" | "behind";

/** Labels a percentage the way the role UI does. */
export function targetBand(percent: number): TargetBand {
  if (percent >= 100) return "achieved";
  if (percent >= ACHIEVEMENT_ON_TRACK_PERCENT) return "near";
  return "behind";
}

export const TARGET_BAND_LABEL: Record<TargetBand, string> = {
  achieved: "Target Achieved",
  near: "Near Target",
  behind: "Behind Target",
};

/** Percentage of target, rounded, guarding division by a zero target. */
export function targetPercent(achieved: number, target: number) {
  return target ? Math.round((achieved / target) * 100) : 0;
}

/* ------------------------------------------------------------------ *
 * Counting a list, when some of it has no target
 * ------------------------------------------------------------------ */

/**
 * Split a list into on track, behind, and not measured at all.
 *
 * The third bucket is the point. Every list that summarised itself counted
 * "Below Target" as *everything that was not on track*, so a team where no
 * recharge target had been uploaded read "Below Target 7" — seven people
 * failing a number that did not exist. The cards underneath had already
 * stopped saying that (v175 for KpiCard, v183 for EntityCard and MetricBar);
 * the strip above them had not, so the same screen disagreed with itself.
 *
 * `targetPercent` returns 0 for a zero target by design — there is no honest
 * percentage of nothing — which is exactly why a caller must not compare its
 * result against a cut-off without asking whether a target exists first. This
 * asks, once, so nine callers cannot each forget.
 */
export function splitByTarget<T>(
  rows: readonly T[],
  achieved: (row: T) => number,
  target: (row: T) => number,
): { onTrack: number; behind: number; untargeted: number } {
  let onTrack = 0,
    behind = 0,
    untargeted = 0;
  for (const row of rows) {
    const t = target(row);
    if (!(t > 0)) untargeted++;
    else if (targetPercent(achieved(row), t) >= ACHIEVEMENT_ON_TRACK_PERCENT) onTrack++;
    else behind++;
  }
  return { onTrack, behind, untargeted };
}

/* ------------------------------------------------------------------ *
 * Printing an achievement against its target
 * ------------------------------------------------------------------ */

/** What a pair prints in place of a target nobody set. */
export const NO_TARGET_MARK = "—";

/**
 * "289 / 300", or "289 / —" when no target exists.
 *
 * The percentage columns learned this in v175 and the cards in v183, but the
 * raw pair beside them had not: the target report printed "289 / 0" and
 * "0 / 0", which reads as 289 against a target of zero — a number nobody set,
 * shown as if it had been missed. `targetPercent` already returns 0 for a
 * zero target on purpose; this is the same honesty one column to the left, so
 * a row cannot say "—" in its GA % cell and "0" in its GA cell at once.
 *
 * `fmt` exists for the callers that group thousands or prefix a currency.
 */
export function againstTarget(achieved: number, target: number, fmt: (n: number) => string = (n) => String(n)) {
  return `${fmt(achieved)} / ${target > 0 ? fmt(target) : NO_TARGET_MARK}`;
}

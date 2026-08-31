/**
 * Data readiness, day by day.
 *
 * Prisma-free like `achievement.ts`, `pacing.ts` and `comparison.ts`: this file
 * owns the rules, `readiness-data.ts` owns the queries.
 *
 * ## The bug this exists to fix
 *
 * `dataReadiness()` in `lib/report-data.ts` asks whether there is ONE completed
 * batch of each type whose business date falls anywhere in the selected range.
 * For the default range — yesterday — that is exactly right. For any longer
 * range it is close to meaningless: a 31-day month with a single GA import on
 * the 3rd reports "Ready", in green, and the totals underneath it are then
 * quietly missing thirty days of activations.
 *
 * That is the same shape of failure as the search bug and the silent row caps:
 * output that looks correct and is not the whole answer. Readiness is a
 * per-day question, so this file answers it per day.
 *
 * ## Why both batches and rows
 *
 * `report-data.ts` carries a deliberate note that readiness is read from
 * `ImportBatch` and "never guessed at from whether rows happen to exist". That
 * reasoning is kept, not overruled — but the two sources answer different
 * questions, and the interesting information is where they disagree:
 *
 *   - A batch says **someone ran the import**, and whether it failed.
 *   - Rows say **data actually landed** for that business day.
 *
 * A completed batch with no rows is a file that parsed to nothing — the single
 * most misleading state there is, because the Upload Center shows it as a
 * success. Rows with no batch means data reached the tables by some route this
 * system did not record. Both are worth a person's attention, and neither is
 * visible if you look at only one of the two.
 */

export type FeedKey = "GA" | "C2C" | "C2S" | "OB";

export const READINESS_FEEDS: readonly FeedKey[] = ["GA", "C2C", "C2S", "OB"];

export const FEED_LABEL: Record<FeedKey, string> = {
  GA: "GA Activation",
  C2C: "C2C",
  C2S: "C2S",
  OB: "Opening Balance",
};

/**
 * What one feed did on one day.
 *
 * Ordered worst-to-best nowhere in particular — `DAY_STATE_RANK` below is the
 * only place severity is decided, so a screen never invents its own order.
 */
export type DayState =
  | "imported" // batch completed and rows landed — the normal case
  | "unrecorded" // rows exist but no batch recorded the import
  | "empty" // batch completed but produced no rows for that day
  | "failed" // the import was attempted and failed
  | "missing" // nothing at all
  | "not-due"; // the day has not happened yet, in business terms

export const DAY_STATE_LABEL: Record<DayState, string> = {
  imported: "Imported",
  unrecorded: "Rows only",
  empty: "Empty file",
  failed: "Import failed",
  missing: "Missing",
  "not-due": "Not due yet",
};

/**
 * How loudly each state should read. Higher is more urgent.
 *
 * `unrecorded` sits below `empty` on purpose: the data IS there, so reports are
 * correct — it is a provenance question, not a missing-data one. `empty` and
 * `failed` outrank `missing` because they mean somebody believes the upload was
 * done.
 */
export const DAY_STATE_RANK: Record<DayState, number> = {
  "not-due": 0,
  imported: 1,
  unrecorded: 2,
  missing: 3,
  empty: 4,
  failed: 5,
};

/**
 * Styling hook — one of the kit's EXISTING badge tones, never a new colour.
 *
 * `Badge` already owns teal/amber/rose/grey through `styles/kit.css`, so the
 * readiness grid borrows that vocabulary rather than introducing a fifth set of
 * status colours for the same four meanings.
 */
export function dayStateTone(state: DayState): "complete" | "pending" | "failed" | "inactive" {
  if (state === "imported") return "complete";
  if (state === "failed" || state === "empty") return "failed";
  if (state === "missing" || state === "unrecorded") return "pending";
  return "inactive";
}

/** What one feed did on one day, plus the evidence behind the verdict. */
export type DayReadiness = {
  date: string;
  state: DayState;
  rows: number;
  /** True when a batch of any status carries this business date. */
  batch: boolean;
};

/** One feed across the whole range. */
export type FeedReadinessRange = {
  feed: FeedKey;
  label: string;
  days: DayReadiness[];
  /** Days that a person should act on, worst first. */
  problems: DayReadiness[];
  /** Days imported, out of the days that were due. */
  covered: number;
  due: number;
  /** Whole percent. 100 only when every due day is imported. */
  coveragePercent: number;
};

/** Every day in an inclusive range, as YYYY-MM-DD. */
export function daysInRange(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00.000Z`);
  for (let t = Date.parse(`${from}T00:00:00.000Z`); t <= end; t += 86400000)
    out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/**
 * Classify one day.
 *
 * `lastDue` is the newest business day whose data can reasonably be expected.
 * The feeds are uploaded for the PREVIOUS day, so that is normally yesterday in
 * Dhaka; anything after it is "not due" rather than "missing". Without this,
 * every range that includes today would show a red square that nobody can fix,
 * and a person who sees a red square they cannot fix soon stops reading the
 * grid at all.
 */
export function classifyDay(
  date: string,
  { rows, batch, failed }: { rows: number; batch: boolean; failed: boolean },
  lastDue: string,
): DayState {
  if (date > lastDue) return "not-due";
  // Checked before `rows`: a failed import that partially wrote rows is still
  // a failed import, and saying "Imported" would hide it.
  if (failed) return "failed";
  if (rows > 0) return batch ? "imported" : "unrecorded";
  return batch ? "empty" : "missing";
}

export function summariseFeed(feed: FeedKey, days: DayReadiness[]): FeedReadinessRange {
  const due = days.filter((d) => d.state !== "not-due");
  const covered = due.filter((d) => d.state === "imported").length;
  const problems = due
    .filter((d) => DAY_STATE_RANK[d.state] >= DAY_STATE_RANK.missing)
    .sort((a, b) => DAY_STATE_RANK[b.state] - DAY_STATE_RANK[a.state] || a.date.localeCompare(b.date));
  return {
    feed,
    label: FEED_LABEL[feed],
    days,
    problems,
    covered,
    due: due.length,
    // No due days is 100%, not 0% — a range entirely in the future is not a
    // failure, and showing it as one would be the same lie in reverse.
    coveragePercent: due.length ? Math.round((covered / due.length) * 100) : 100,
  };
}

/** "27 of 31 days" — always both numbers, never a bare percentage. */
export function coverageLabel(f: FeedReadinessRange) {
  if (!f.due) return "Not due yet";
  return `${f.covered} of ${f.due} day${f.due === 1 ? "" : "s"}`;
}

/**
 * The worst state present in a feed's range — what a single badge should say.
 *
 * A feed is only "Imported" when every due day is. This is the whole point:
 * the old boolean went green on one good day out of thirty-one.
 */
export function worstState(f: FeedReadinessRange): DayState {
  let worst: DayState = f.due ? "imported" : "not-due";
  for (const d of f.days) if (DAY_STATE_RANK[d.state] > DAY_STATE_RANK[worst]) worst = d.state;
  return worst;
}

/** One line a person can act on, or null when the range is clean. */
export function readinessWarning(feeds: FeedReadinessRange[]): string | null {
  const broken = feeds.filter((f) => f.due && f.covered < f.due);
  if (!broken.length) return null;
  const parts = broken.map((f) => `${f.label} (${f.due - f.covered} day${f.due - f.covered === 1 ? "" : "s"})`);
  return `Reports for this period are incomplete — missing or unusable imports for ${parts.join(", ")}.`;
}

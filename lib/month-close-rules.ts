/**
 * v206 — the closed-month rules, with no database in them, so the entry
 * screens can say "this month is closed" before anybody types, and the tests
 * can pin the wording.
 *
 * The owner picked "Month close / lock": *"Mash close korle purono entry ar
 * keu bodlate parbe na (Admin chhara)"*. So a closed month is closed for
 * everyone, Accounts included; Admin can reopen it (with a reason, audited),
 * and it is then closed again.
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export { isYm } from "./business-time";

/** "2026-09-14" → "2026-09". */
export const monthOfYmd = (ymd: string) => ymd.slice(0, 7);

/** "2026-09" → "September 2026". */
export function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[m - 1] ?? ym} ${y}`;
}

export function prevMonthOf(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function nextMonthOf(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** First and last day of a month, as YYYY-MM-DD. */
export function monthDays(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}

/** A month can be closed once its last day is over — never the month still running. */
export const monthHasEnded = (ym: string, today: string) => ym < monthOfYmd(today);

/** The one sentence every refused write says, so it reads the same on every screen. */
export const closedMessage = (ym: string) =>
  `${monthLabel(ym)} is closed — nothing dated in it can be changed. Admin can reopen it.`;

export const isClosedDate = (closed: readonly string[], ymd: string) => closed.includes(monthOfYmd(ymd));

/**
 * An opening position is folded into every figure after its date, so it
 * cannot move once any month from its own onward is closed.
 */
export function closedOnOrAfter(closed: readonly string[], ymd: string) {
  const ym = monthOfYmd(ymd);
  return [...closed].filter((c) => c >= ym).sort()[0] ?? null;
}

export const MONTH_CLOSE_ROLES = ["ACCOUNTS"];
export const MONTH_REOPEN_ROLES = ["ADMIN"];

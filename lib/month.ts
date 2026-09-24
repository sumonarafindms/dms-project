import { dhakaMonth } from "./business-time";

/**
 * The first instant of a month and of the month after it.
 *
 * v202: an impossible month — "2026-13", "2026-00", "abc" from a hand-edited
 * URL — made an Invalid Date here, and every query built on it threw, so about
 * thirty pages answered with the error screen. It now falls back to the
 * current business month, which is what every page already shows when no
 * month is given. Callers that must REFUSE a bad month (an import) check with
 * `isYm` first.
 */
export function monthBounds(input: string | Date) {
  let d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1900 || d.getUTCFullYear() > 2999)
    d = new Date(`${dhakaMonth()}-01T00:00:00.000Z`);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return { start, end };
}

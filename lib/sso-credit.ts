/**
 * Who is credited with a retailer's SSO for a month (v200).
 *
 * SSO is ONE fact per retailer-month: a SIM-seller outlet reached
 * `SSO_MIN_MONTHLY_STANDARD_GA` standard GA in the month. Before this file the
 * month was split into an RSO part and a BP part and each part was tested on
 * its own, so an outlet that became a BP on the 12th could count as SSO twice
 * (3 GA before, 3 after → one for the RSO AND one for the BP — two SSOs for
 * one outlet in the company total), or not at all (1 and 1 → neither side
 * reached 2, while the SSO Pending report correctly said it was complete).
 *
 * Now the month is tested WHOLE and credited once, to whoever sold the SIM
 * that completed it — the same "completing" rule Sim Support pays on. If that
 * day was held as a BP, the holder is credited; otherwise the owner.
 *
 * Pure: no database, no clock. The callers group their rows by day.
 */

export type SsoDay = {
  /** UTC-midnight timestamp of the business day. */
  dayMs: number;
  /** Standard GA on that day. */
  count: number;
  /** Was the outlet held as a BP on that day? */
  bp: boolean;
};

export function ssoCompletion(
  days: readonly SsoDay[],
  simSeller: boolean,
  threshold: number,
): { dayMs: number; bp: boolean } | null {
  if (!simSeller) return null;
  // Same-day rows (several product codes) are merged; BP-ness is per day.
  const byDay = new Map<number, SsoDay>();
  for (const d of days) {
    const cur = byDay.get(d.dayMs);
    if (cur) cur.count += d.count;
    else byDay.set(d.dayMs, { ...d });
  }
  let running = 0;
  for (const d of [...byDay.values()].sort((a, b) => a.dayMs - b.dayMs)) {
    running += d.count;
    if (running >= threshold) return { dayMs: d.dayMs, bp: d.bp };
  }
  return null;
}

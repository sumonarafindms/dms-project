const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
export function dhakaTodayYmd(now = new Date()) {
  const d = new Date(now.getTime() + DHAKA_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
export function dhakaMonth(now = new Date()) {
  return dhakaTodayYmd(now).slice(0, 7);
}
export function dhakaYesterdayYmd(now = new Date()) {
  const today = dhakaTodayYmd(now),
    d = new Date(`${today}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
export function dhakaDayStartUtc(now = new Date()) {
  const ymd = dhakaTodayYmd(now);
  return new Date(new Date(`${ymd}T00:00:00.000Z`).getTime() - DHAKA_OFFSET_MS);
}

/**
 * The exact range covering one business day, as the fact tables store it.
 *
 * `GaActivation.activationDate`, `C2cRecord.date`, `C2sRecord.date` and
 * `ObRecord.date` are all written as **UTC midnight of the date printed in the
 * source file** — a date, not an instant. So a day is a plain range over that
 * midnight and must NOT be shifted by the Dhaka offset a second time: doing
 * that returns the previous day's rows all morning, which is precisely the kind
 * of error nobody notices until month end.
 *
 * It lives here, beside the rest of the day arithmetic, because three modules
 * were about to want it. `lib/live-ga.ts` re-exports it as `gaDayBounds`, the
 * name its callers already use.
 */
export function businessDayBounds(ymd: string) {
  const start = new Date(`${ymd}T00:00:00.000Z`);
  return { start, end: new Date(start.getTime() + 86400000) };
}

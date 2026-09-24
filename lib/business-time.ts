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

/*
 * v202: years are 1900–2999. "9999-12" is a real-looking month whose END is
 * the year 10000, which the database driver cannot even express — every page
 * given it answered with the error screen.
 */
const YEAR = "(19|2\\d)\\d{2}";

/**
 * A real calendar day as "YYYY-MM-DD" (v199).
 *
 * The shape test the write routes used let "2026-13-01" through to an Invalid
 * Date and a 500, and "2026-02-31" through as 3 March. A day is real only if it
 * survives the round trip.
 */
export function isYmd(value: unknown): value is string {
  if (typeof value !== "string" || !new RegExp(`^${YEAR}-\\d{2}-\\d{2}$`).test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** The largest quantity one line may carry — well inside a 32-bit column. */
export const MAX_LINE_QTY = 100_000_000;

/**
 * v202: the largest amount of money one field may carry — ৳1 lakh crore, far
 * past any real figure and well inside the Decimal(18,2) columns. Past this the
 * database refused the value and the route answered with a 500.
 */
export const MAX_MONEY = 1_000_000_000_000;

/** A real month as "YYYY-MM" (v200) — "2026-13" is not one. */
export function isYm(value: unknown): value is string {
  return typeof value === "string" && new RegExp(`^${YEAR}-(0[1-9]|1[0-2])$`).test(value);
}

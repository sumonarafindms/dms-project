/**
 * The one strict YYYY-MM-DD parser. Returns null for anything that is not a
 * real calendar date.
 *
 * Neither `new Date("2026-02-31T00:00:00Z")` nor `Date.UTC(2026, 1, 31)`
 * rejects an impossible day — both roll forward to 3 March. A report or an
 * import silently answering for the wrong date is worse than one that refuses
 * the input, so the parsed date is read back and compared field by field.
 */
export function parseYmd(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getUTCFullYear() !== y || date.getUTCMonth() + 1 !== m || date.getUTCDate() !== d) return null;
  return date;
}
export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86400000);
}
export function monthStartUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}
export function nextMonthUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}
export function monthStartsInRange(start: Date, endExclusive: Date) {
  const result: Date[] = [];
  let m = monthStartUtc(start);
  while (m < endExclusive) {
    result.push(m);
    m = nextMonthUtc(m);
  }
  return result;
}
export function fullyCoveredMonths(start: Date, endExclusive: Date) {
  return monthStartsInRange(start, endExclusive).filter((m) => start <= m && endExclusive >= nextMonthUtc(m));
}

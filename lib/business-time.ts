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

/** v206 — the Collection dashboard's two small sums, with no database in them. */

/** Money in ÷ goods out (net of returns), %. Null when nothing net went out. */
export const collectionRate = (collected: number, netGiven: number) =>
  netGiven > 0 ? Math.round((collected / netGiven) * 100) : null;

/** A clean top for a chart axis: 1, 2 or 5 × a power of ten, at or above the peak. */
export function niceMax(v: number) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

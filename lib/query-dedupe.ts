/**
 * v202 — one value per query parameter.
 *
 * Every page here reads its query as strings: `?q=`, `?month=`, `?from=`. When
 * a key appears twice (`?q=a&q=b` — a shared link that was edited, a bookmark
 * with a filter added twice) Next.js hands the page an ARRAY, and `.trim()` on
 * an array threw: every report and the audit log answered with a 500.
 *
 * Rather than guard every page, the middleware sends such a request to the
 * same address with the FIRST value of each key — what `searchParams.get()`
 * already answers on the API side — so a page only ever sees strings.
 *
 * Returns the cleaned query, or null when nothing repeats.
 */
export function dedupeQuery(params: URLSearchParams): URLSearchParams | null {
  const seen = new Set<string>();
  let repeated = false;
  const out = new URLSearchParams();
  for (const [k, v] of params) {
    if (seen.has(k)) {
      repeated = true;
      continue;
    }
    seen.add(k);
    out.append(k, v);
  }
  return repeated ? out : null;
}

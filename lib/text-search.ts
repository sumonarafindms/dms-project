/**
 * Token matching for the instant filters.
 *
 * A plain `includes()` only matches text the user typed in the same order it
 * appears: searching "rahim mobile" finds "Rahim Mobile Store", but "mobile
 * rahim" finds nothing, and "rahim RET-004" — a name plus a code, which is how
 * people actually narrow a list — never matches at all because the two never
 * sit next to each other.
 *
 * So every whitespace-separated token must appear somewhere in the haystack,
 * in any order. Tokens are already lowercased by the caller.
 */
export function matchesTokens(haystack: string, query: string) {
  if (!query) return true;
  const tokens = query.split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  for (const t of tokens) if (!haystack.includes(t)) return false;
  return true;
}

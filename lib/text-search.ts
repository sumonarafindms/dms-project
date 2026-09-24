import { foldDigits } from "./format";
import { phoneKey } from "./phone";

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
 *
 * `numbers` (v201) are phone numbers to find the row by that are NOT part of
 * the text people read: an RSO's wallet, an outlet's iTopUp number, a login.
 * Only a token of four or more digits looks there. Otherwise "RSO 1" — which
 * used to find RSO 1, RSO 10 and RSO 11 — would find everybody, because
 * nearly every phone number has a 1 in it.
 */
export function matchesTokens(haystack: string, query: string, numbers = "") {
  if (!query) return true;
  const tokens = searchTokens(query);
  if (!tokens.length) return true;
  const hay = foldDigits(haystack);
  const nums = numbers ? foldDigits(numbers) : "";
  for (const t of tokens) {
    if (hay.includes(t)) continue;
    if (nums && /^\d{4,}$/.test(t) && nums.includes(t)) continue;
    return false;
  }
  return true;
}

/**
 * v201 — a typed phone number matches however it is written.
 *
 * "+8801700000001", "8801700000001", "01700000001", "1700000001" and
 * "01700-000001" are one number. Each is reduced to its national digits
 * without the leading zero ("1700000001"), which is a substring of every way
 * the number is stored here — with or without 0, with or without 880 — so a
 * number read off somebody's phone finds them. Bengali digits fold first.
 *
 * Only tokens that look like a phone (seven or more digits, optionally with a
 * + and dashes) are touched; a code like "R341946" or a short number is left
 * exactly as typed.
 */
export function searchTokens(query: string) {
  return foldDigits(String(query ?? ""))
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (/^\+?\d[\d-]{6,}$/.test(w) ? phoneKey(w) || w : w));
}

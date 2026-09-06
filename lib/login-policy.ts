/**
 * How many failed sign-ins are tolerated, and in which bucket.
 *
 * ## Why there are two buckets
 *
 * The throttle used to be keyed on `identifier + client IP`. That is the right
 * bucket for stopping one noisy source, and it is the wrong bucket for stopping
 * an attack, because **the attacker chooses the IP and the defender does not**.
 *
 * Reproduced against this app before the fix: eight wrong PINs from one address
 * locked the account after four (401 401 401 401 429 429 429 429); the same
 * eight with a different `X-Forwarded-For` on each request were all answered
 * 401 and never locked anything. Field logins are four-digit PINs, so
 * "unlimited guesses" means any RSO or BP account falls in at most ten thousand
 * requests. Rotating real addresses through proxies gets the same result more
 * slowly, so this is not only a header-spoofing problem.
 *
 * The account bucket cannot be evaded, because an attacker who wants a
 * particular account must name it. Whatever address the request arrives from,
 * the guesses against that identifier land in the same counter.
 *
 * ## Why the account limit is higher, and why the lock escalates
 *
 * An account-scoped lock is also a way to lock a real person out on purpose, so
 * the threshold has to sit above ordinary human error: twenty failures in a
 * quarter of an hour is far more than someone mistyping their own PIN.
 *
 * A flat twenty-per-quarter-hour is NOT enough on its own, and the first draft
 * of this file claimed otherwise. Eighty guesses an hour is nineteen hundred a
 * day, which walks a four-digit space in about five days — the unit test does
 * that arithmetic rather than trusting the comment, and it failed the claim.
 *
 * So the account lock doubles each time the threshold is passed again, from a
 * quarter of an hour up to a day. Someone who mistypes twenty times waits
 * fifteen minutes; a machine grinding away reaches the daily cap within a day
 * and then gets twenty guesses per day, which is centuries rather than a
 * weekend. The source bucket is deliberately NOT escalated — locking one
 * address for a day is cheap for an attacker to route around and expensive for
 * an office behind one NAT.
 *
 * Both buckets are consulted on every attempt and the stricter lock wins.
 */

/** Failures from one source against one identifier before that source is locked out. */
export const MAX_LOGIN_FAILURES = 5;
export const LOGIN_LOCK_MINUTES = 15;

/** Failures against one identifier from ANY source before the account is locked. */
export const MAX_ACCOUNT_FAILURES = 20;
export const ACCOUNT_LOCK_MINUTES = 15;

/** However long an attack runs, one account never locks for longer than this. */
export const ACCOUNT_LOCK_CAP_MINUTES = 24 * 60;

export type FailureOutcome = { failedCount: number; lockedUntil: Date | null };

/** One source's next state after a failed attempt. Flat, not escalating. */
export function nextLoginFailure(currentFailures: number, nowMs = Date.now()): FailureOutcome {
  const failedCount = Math.max(0, currentFailures) + 1;
  return {
    failedCount,
    lockedUntil: failedCount >= MAX_LOGIN_FAILURES ? new Date(nowMs + LOGIN_LOCK_MINUTES * 60_000) : null,
  };
}

/**
 * One account's next state after a failed attempt, whatever the source.
 *
 * The lock doubles on each further threshold crossing: 15m, 30m, 1h, 2h … to a
 * one-day ceiling.
 */
export function nextAccountFailure(currentFailures: number, nowMs = Date.now()): FailureOutcome {
  const failedCount = Math.max(0, currentFailures) + 1;
  if (failedCount < MAX_ACCOUNT_FAILURES) return { failedCount, lockedUntil: null };
  const crossings = Math.floor(failedCount / MAX_ACCOUNT_FAILURES);
  const minutes = Math.min(ACCOUNT_LOCK_CAP_MINUTES, ACCOUNT_LOCK_MINUTES * 2 ** Math.max(0, crossings - 1));
  return { failedCount, lockedUntil: new Date(nowMs + minutes * 60_000) };
}

/** Guesses an attacker gets in `days`, given the escalation above. Used by the tests. */
export function guessesWithin(days: number): number {
  let guesses = 0;
  let minutesElapsed = 0;
  let failed = 0;
  const budget = days * 24 * 60;
  while (minutesElapsed < budget) {
    // They burn one threshold's worth of guesses, then wait out the lock.
    guesses += MAX_ACCOUNT_FAILURES;
    failed += MAX_ACCOUNT_FAILURES;
    const crossings = Math.floor(failed / MAX_ACCOUNT_FAILURES);
    minutesElapsed += Math.min(ACCOUNT_LOCK_CAP_MINUTES, ACCOUNT_LOCK_MINUTES * 2 ** Math.max(0, crossings - 1));
  }
  return guesses;
}

/** A lock that is still in force, or null. The later of the two wins. */
export function activeLock(locks: (Date | null | undefined)[], now = new Date()): Date | null {
  const live = locks.filter((d): d is Date => Boolean(d) && (d as Date) > now);
  return live.length ? new Date(Math.max(...live.map((d) => d.getTime()))) : null;
}

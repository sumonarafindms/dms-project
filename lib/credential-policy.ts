/**
 * What a PIN or password must be, and when an account stops accepting guesses.
 *
 * One module, because these rules are checked in four places — creating a
 * login, editing one, creating an employee, editing an employee — and four
 * copies of "at least 4 characters" is how a screen ends up quietly accepting
 * something the others reject.
 *
 * ## Six digits, and why not four
 *
 * Field logins were four-digit PINs: ten thousand possibilities. Six digits is
 * a million — a hundredfold — and it costs the person two more taps on a
 * number pad they are already holding.
 *
 * Digits only, deliberately. These are typed one-handed, in the field, often in
 * sunlight, by people who are not going to enjoy hunting for a symbol key. A
 * six-digit numeric PIN behind a five-attempt lock is stronger in practice than
 * a "complex" password that gets written on the inside of a SIM folder.
 *
 * ## Existing PINs keep working
 *
 * This is enforced when a credential is SET, not when it is used. Every field
 * user's four-digit PIN keeps working until an admin resets it. The alternative
 * — invalidating every PIN on deploy — locks out the whole distribution team on
 * the same morning, which trades a slow risk for an immediate outage. The
 * owner's call, recorded here so nobody "fixes" it later by accident.
 *
 * ## Five strikes, then a person
 *
 * At five consecutive failures the login locks and stays locked. No timer: an
 * administrator clears it. A timed lock lets an attacker keep guessing forever
 * at a slower rate; this one stops, and puts a human in the loop who can ask
 * why the account was being guessed at.
 */

/** Digits in a field PIN. Six, not four — see above. */
export const PIN_LENGTH = 6;

/** Minimum characters in an admin password (not a numeric PIN). */
export const MIN_PASSWORD_LENGTH = 8;

/** Consecutive failures before the login locks and needs an administrator. */
export const MAX_FAILURES_BEFORE_LOCK = 5;

/** The message shown when a PIN is rejected. One wording, everywhere. */
export const PIN_REQUIREMENT = `PIN must be exactly ${PIN_LENGTH} digits.`;

/**
 * Check a PIN being set. Returns an error message, or null when acceptable.
 *
 * `allowEmpty` is for edit forms, where leaving the field blank means "keep the
 * current PIN" rather than "set an empty one".
 */
export function validatePin(value: string, { allowEmpty = false } = {}): string | null {
  const pin = value.trim();
  if (!pin) return allowEmpty ? null : PIN_REQUIREMENT;
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) return PIN_REQUIREMENT;
  /*
   * Rejecting the obvious ones is worth two lines: a lock at five attempts
   * makes brute force impractical, but it does nothing against someone who
   * simply tries 123456 on every account they can name.
   */
  if (/^(\d)\1*$/.test(pin)) return "PIN cannot be the same digit repeated.";
  const ascending = Array.from({ length: 10 }, (_, i) => String(i)).join("").repeat(2);
  const descending = [...ascending].reverse().join("");
  if (ascending.includes(pin) || descending.includes(pin)) return "PIN cannot be a run of consecutive digits.";
  return null;
}

/** Check an admin password being set. Returns an error message, or null. */
export function validatePassword(value: string, { allowEmpty = false } = {}): string | null {
  const password = value.trim();
  if (!password) return allowEmpty ? null : `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  return null;
}

/** The account's next state after a failed sign-in. */
export function nextAccountState(currentFailures: number, nowMs = Date.now()) {
  const failedLoginCount = Math.max(0, currentFailures) + 1;
  return {
    failedLoginCount,
    lockedAt: failedLoginCount >= MAX_FAILURES_BEFORE_LOCK ? new Date(nowMs) : null,
  };
}

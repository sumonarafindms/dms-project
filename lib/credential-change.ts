import { MIN_PASSWORD_LENGTH, PIN_LENGTH, validatePassword, validatePin } from "./credential-policy";

/**
 * Changing your own PIN — the rules, without the database.
 *
 * ## Why this exists at all
 *
 * There was no way to change your own credential. An RSO who thought someone
 * had watched them type their PIN had to find an administrator, and the
 * administrator's reset is the only lever the app had. On a phone — which is
 * what nine in ten of these users are holding — there was not even a sign-out:
 * the sidebar carrying it is `display: none` below 900px.
 *
 * ## Why the rules are here rather than in the route
 *
 * Every one of them is a decision that can be got wrong quietly, and a route
 * handler needs a session, a database and a request to test. Pure input,
 * string out.
 */

/** ADMIN signs in at /sacool with a username and password; everyone else with a mobile and a PIN. */
export const usesPassword = (role: string) => role === "ADMIN";

export function credentialNoun(role: string) {
  return usesPassword(role) ? "password" : "PIN";
}

export type CredentialChange = {
  role: string;
  current: string;
  next: string;
  confirm: string;
  /** Whether `current` actually matched the stored hash. Checked by the caller. */
  currentMatches: boolean;
};

/**
 * The error to show, or null when the change may go ahead.
 *
 * Order matters. "Current PIN is incorrect" is reported before anything about
 * the new one, so somebody who has mistyped the field they know is not sent
 * looking at the two they have just invented.
 */
export function validateCredentialChange(input: CredentialChange): string | null {
  const noun = credentialNoun(input.role);
  const current = input.current.trim();
  const next = input.next.trim();
  const confirm = input.confirm.trim();

  if (!current) return `Enter your current ${noun}.`;
  if (!next) return `Enter a new ${noun}.`;
  if (!input.currentMatches) return `Your current ${noun} is incorrect.`;

  /*
   * Checked before the format rules. Telling someone their new PIN "must be 6
   * digits" when the real problem is that they typed it differently in the two
   * boxes sends them to rewrite a PIN that was fine.
   */
  if (next !== confirm) return `The two new ${noun}s do not match.`;

  const formatError = usesPassword(input.role) ? validatePassword(next) : validatePin(next);
  if (formatError) return formatError;

  /*
   * A "change" that changes nothing is almost always a misunderstanding of the
   * form, and accepting it would log a security event that did not happen.
   */
  if (next === current) return `The new ${noun} is the same as your current one.`;

  return null;
}

/** What the form asks for, so the screen and the route cannot disagree. */
export function credentialRules(role: string) {
  return usesPassword(role)
    ? { noun: "password", minLength: MIN_PASSWORD_LENGTH, digitsOnly: false, length: null as number | null }
    : { noun: "PIN", minLength: PIN_LENGTH, digitsOnly: true, length: PIN_LENGTH };
}

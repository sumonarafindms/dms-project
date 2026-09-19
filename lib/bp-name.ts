/**
 * What to call a Business Partner.
 *
 * ## The bug this exists to end
 *
 * The admin BP screen has a field labelled "BP Display Name" and has had one
 * for a long time. Typing in it appeared to do nothing: every list, card,
 * report, export and Live GA row went on showing the name from the master
 * retailer file. The reason was not that the name failed to save — it saved —
 * but that exactly ONE place in the whole application read it back, the edit
 * form's own prefill, which is why the name looked right when you reopened the
 * form and wrong everywhere a person would actually look.
 *
 * There was a second half to it. The name was written only to the BP login's
 * `User.displayName`, and a login is only created when a mobile number and PIN
 * are supplied. A BP without a phone therefore had nowhere to keep a name at
 * all, and the typed value was dropped on the floor in silence.
 *
 * ## The rule
 *
 * A BP's name is `Retailer.bpName` if one has been given, otherwise the master
 * file's `retailerName`, otherwise the retailer code — which always exists.
 * `retailerName` cannot itself hold the BP name because the master import owns
 * that column and re-asserts the vendor's value on every upload.
 *
 * Every screen that labels a BP goes through this function. It is deliberately
 * free of Prisma and of React so the same rule can be applied in a server page,
 * a client component, a report builder and an Excel export without three
 * copies of `a || b || c` drifting apart — which is how this started.
 */

/** The fields any BP label needs. Widen your `select` to include all three. */
export type BpNameSource = {
  bpName?: string | null;
  retailerName?: string | null;
  retailerCode: string;
};

const clean = (value: string | null | undefined) => (value || "").trim();

/**
 * The BP's display name.
 *
 * Never empty: a retailer always has a code, and a row labelled with nothing is
 * a row nobody can act on.
 */
export function bpDisplayName(source: BpNameSource): string {
  return clean(source.bpName) || clean(source.retailerName) || source.retailerCode;
}

/**
 * True when a BP name was actually given, rather than fallen back to.
 *
 * Used by the admin screens to show the master file's name alongside the BP's
 * own, so an operator can see that the two differ and that it is deliberate.
 */
export const hasBpName = (source: BpNameSource) => clean(source.bpName).length > 0;

/**
 * The name to store from a form field.
 *
 * Blank means blank. The previous write path fell back to `retailerName` when
 * the field was empty, which made the name impossible to CLEAR once set: an
 * operator who wanted the master file's name back had no way to ask for it.
 * Null restores the fallback, which is what an empty box should mean.
 */
export const bpNameToStore = (input: string | null | undefined) => clean(input) || null;

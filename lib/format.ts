/**
 * How numbers and dates are written on screen.
 *
 * ## Why this file exists
 *
 * `(1234).toLocaleString("en-US")` with no locale uses whatever locale the *runtime*
 * defaults to. On the server that is Node's ICU default — `en-US` — and in the
 * browser it is the reader's own setting. For most of the world the two agree
 * closely enough that nothing shows. For this app's actual users they do not
 * agree at all:
 *
 *     en-US  →  2,190          bn-BD  →  ২,১৯০
 *
 * Not one character matches, and it is not only the grouping separator: every
 * digit changes, so even a single-digit number differs. Roughly nine in ten of
 * this app's users are in Bangladesh.
 *
 * In a client component that is a hydration mismatch on every page load. React
 * throws away the server's HTML and re-renders the tree, which was reproduced
 * on `/it/reports/sso` — **3 loads out of 3 under a `bn-BD` browser, 0 out of
 * 30 under `en-US`**:
 *
 *     Minified React error #418 … args[]=text
 *
 * It is also simply wrong to look at: a page built from both server and client
 * components showed Bengali digits in one figure and Latin in the one beside
 * it.
 *
 * ## The decision
 *
 * Every figure the app renders is Latin, pinned, everywhere. That is not a
 * judgement about Bengali; it is consistency with everything a figure has to be
 * reconciled against — the carrier's spreadsheets, the exported workbooks,
 * wallet numbers, retailer codes — all of which are Latin. v155 made the same
 * call from the other direction: Bengali digits are folded when SEARCHING so a
 * Bengali keyboard finds a Latin wallet number, and nothing displayed or
 * exported is rewritten.
 *
 * The grouping stays `en-US` (1,23,456 is the local convention, but changing
 * how every figure in the product is grouped is a product decision, not a bug
 * fix, and this is a bug fix).
 *
 * Guarded by tests/number-locale.smoke.test.ts, which fails on a bare
 * `toLocaleString()` anywhere in `app/` or `lib/`.
 */

/** The one locale every figure in this app is written in. */
export const DISPLAY_LOCALE = "en-US";

/** Dhaka, so every role reads the same clock whatever their device is set to. */
export const DISPLAY_TIME_ZONE = "Asia/Dhaka";

export function fmtNumber(value: number | null | undefined) {
  return (value ?? 0).toLocaleString(DISPLAY_LOCALE);
}

/** Taka, rounded — the app never shows poisha. */
export function fmtMoney(value: number | null | undefined) {
  return `৳${Math.round(Number(value ?? 0)).toLocaleString(DISPLAY_LOCALE)}`;
}

function asDate(value: Date | string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `14 Sep 2026`. */
export function fmtDate(value: Date | string | number | null | undefined, fallback = "—") {
  const d = asDate(value);
  if (!d) return fallback;
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: DISPLAY_TIME_ZONE,
  }).format(d);
}

/** `10:15 AM`. */
export function fmtTime(value: Date | string | number | null | undefined, fallback = "—") {
  const d = asDate(value);
  if (!d) return fallback;
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: DISPLAY_TIME_ZONE,
  }).format(d);
}

/** `14 Sep 2026, 10:15 AM`. */
export function fmtDateTime(value: Date | string | number | null | undefined, fallback = "—") {
  const d = asDate(value);
  if (!d) return fallback;
  return `${fmtDate(d)}, ${fmtTime(d)}`;
}

/**
 * Bengali digits folded to Latin, for MATCHING only.
 *
 * A wallet number is stored exactly as the carrier's spreadsheet wrote it —
 * `01700000001`. Someone typing on a Bengali keyboard produces `০১৭০০০০০০০১`,
 * the same number with not one character in common, so an unfolded search finds
 * nothing and looks broken (v155).
 *
 * Only the comparison is folded; nothing displayed or exported is rewritten,
 * and Bengali *letters* are untouched — folding one character more would break
 * every name search instead.
 *
 * It lives here rather than in lib/report-builders.ts, which is where it was
 * written, because a client component needs it too and that module reaches the
 * database. report-builders re-exports it so nothing that imports it had to
 * change.
 */
export const foldDigits = (s: string) => s.replace(/[\u09e6-\u09ef]/g, (d) => String(d.charCodeAt(0) - 0x09e6));

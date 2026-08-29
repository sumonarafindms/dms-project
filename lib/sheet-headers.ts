/**
 * Spreadsheet header normalisation — pure, no Prisma, no xlsx.
 *
 * Uploaded sheets arrive with inconsistent casing, spacing and punctuation, so
 * every header is folded to one canonical form before it is matched.
 *
 * This also happens to be a security control. The retailer import is the only
 * place in the app that reads a sheet as OBJECTS (`sheet_to_json` without
 * `header: 1`), which is the path CVE-2023-30533 exploits in the pinned xlsx
 * build: a workbook column literally named `__proto__` becomes an object key.
 * Uppercasing and stripping punctuation turns that key into `__PROTO__`, which
 * is inert. Do not "simplify" this to a pass-through. See SECURITY.md.
 */
export const normalizeHeader = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[^A-Z0-9_ ]/g, "");

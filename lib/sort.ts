/**
 * Shared list ordering.
 *
 * Every ranked list in the app used to be sorted one way, hard-coded in the
 * page ("Ranked by recharge achievement"), with no way for the user to ask for
 * anything else. The filter bar carried a filter icon and nothing to click.
 *
 * A page declares the orders that make sense for its rows; the selected one
 * arrives as `?sort=` and is applied here. Sorting is presentation only — it
 * never changes which rows are included, so it cannot affect any business
 * figure on the page.
 */

export type SortSpec<T> = {
  /** URL value, e.g. "recharge-desc". */
  value: string;
  /** What the select shows, e.g. "Recharge % — high to low". */
  label: string;
  compare: (a: T, b: T) => number;
};

/** Options as the filter bar needs them — value and label only. */
export function sortOptions<T>(specs: SortSpec<T>[]) {
  return specs.map((s) => ({ value: s.value, label: s.label }));
}

/**
 * Sort a copy of `rows` by the spec named in `value`, falling back to the
 * first spec when the parameter is missing or unknown (a hand-edited URL must
 * not produce an unordered list).
 */
export function applySort<T>(rows: T[], specs: SortSpec<T>[], value?: string): T[] {
  const spec = specs.find((s) => s.value === value) || specs[0];
  if (!spec) return rows;
  return [...rows].sort(spec.compare);
}

/** The spec actually in force, for a "Ranked by …" caption. */
export function activeSort<T>(specs: SortSpec<T>[], value?: string) {
  return specs.find((s) => s.value === value) || specs[0];
}

/** Case-insensitive name ordering that keeps Bengali and Latin names together. */
export const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });

/** Descending numeric, with a stable tiebreak so equal values keep a fixed order. */
export const byNumberDesc =
  <T>(pick: (row: T) => number, tiebreak: (row: T) => string = () => "") =>
  (a: T, b: T) =>
    pick(b) - pick(a) || byText(tiebreak(a), tiebreak(b));

export const byNumberAsc =
  <T>(pick: (row: T) => number, tiebreak: (row: T) => string = () => "") =>
  (a: T, b: T) =>
    pick(a) - pick(b) || byText(tiebreak(a), tiebreak(b));

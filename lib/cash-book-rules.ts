/**
 * v206 — the cash box, as arithmetic with no database in it.
 *
 * The owner picked "Cash Book & Day Close": at the end of the day, how much
 * cash SHOULD be in hand, how much IS (counted note by note), and the
 * difference.
 *
 *   expected = opening
 *            + cash deposited by RSOs, BPs and supervisors   (CashDeposit.cash)
 *            + other cash in                                (CashMove: owner added, other)
 *            − expenses paid from cash                       (Expense, paidFrom CASH)
 *            − other cash out                               (CashMove: to bank, to company, owner took, other)
 *
 *   variance = counted − expected        (negative: short; positive: over)
 *
 * Bank deposits and bank-paid expenses never touch the cash box, so they are
 * shown beside it for reference and are not in the sum.
 *
 * Opening is the last count carried forward: the most recent closed day's
 * COUNTED cash (not its expected — what was actually there), plus every day's
 * net movement since. The first close has nothing to carry, so its opening is
 * typed.
 */

import { paisa } from "./stock";

/** Bangladeshi notes and coins, largest first. */
export const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1] as const;
export type Denominations = Partial<Record<string, number>>;

/** Tidies a count from the form: whole, non-negative pieces of known notes only. */
export function cleanDenominations(raw: unknown): Denominations | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Denominations = {};
  for (const d of DENOMINATIONS) {
    const v = (raw as Record<string, unknown>)[String(d)];
    if (v === undefined || v === null || v === "") continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n) || n > 10_000_000) return null;
    if (n > 0) out[String(d)] = n;
  }
  return out;
}

export function countedCash(d: Denominations) {
  let sum = 0;
  for (const n of DENOMINATIONS) sum += n * (Number(d[String(n)]) || 0);
  return paisa(sum);
}

export type CashMoveKind =
  "BANK_DEPOSIT" | "COMPANY_PAYMENT" | "OWNER_TAKEN" | "OTHER_OUT" | "OWNER_ADDED" | "OTHER_IN";

export const CASH_MOVE_KINDS: readonly { key: CashMoveKind; label: string; dir: "in" | "out" }[] = [
  { key: "BANK_DEPOSIT", label: "Taken to the bank", dir: "out" },
  { key: "COMPANY_PAYMENT", label: "Paid to the company", dir: "out" },
  { key: "OWNER_TAKEN", label: "Owner took", dir: "out" },
  { key: "OTHER_OUT", label: "Other cash out", dir: "out" },
  { key: "OWNER_ADDED", label: "Owner added", dir: "in" },
  { key: "OTHER_IN", label: "Other cash in", dir: "in" },
];
export const CASH_MOVE_LABEL = Object.fromEntries(CASH_MOVE_KINDS.map((k) => [k.key, k.label])) as Record<
  CashMoveKind,
  string
>;
export const isCashMoveKind = (v: unknown): v is CashMoveKind => CASH_MOVE_KINDS.some((k) => k.key === v);
export const cashMoveDir = (k: CashMoveKind) => CASH_MOVE_KINDS.find((x) => x.key === k)!.dir;

/** One day's cash-box movement, already summed. */
export type DayFlow = { date: string; deposits: number; movesIn: number; expenses: number; movesOut: number };
export const flowIn = (f: DayFlow) => paisa(f.deposits + f.movesIn);
export const flowOut = (f: DayFlow) => paisa(f.expenses + f.movesOut);
export const flowNet = (f: DayFlow) => paisa(flowIn(f) - flowOut(f));

export type StoredClose = {
  date: string;
  openingCash: number;
  openingTyped: boolean;
  cashIn: number;
  cashOut: number;
  expected: number;
  counted: number;
};

export type LedgerDay = {
  date: string;
  /** null: no count has ever been closed before this day, so there is nothing to start from. */
  opening: number | null;
  /**
   * What the earlier counts carry INTO this day, whatever this day's own
   * close says. Null before the first close. Re-closing a day starts from it.
   */
  carriedIn: number | null;
  cashIn: number;
  cashOut: number;
  expected: number | null;
  close: StoredClose | null;
  variance: number | null;
  /**
   * The day was closed, and something in it — or the count it started from —
   * has changed since. What the books say NOW is `expected`; what was signed
   * off is `close.expected`.
   */
  changed: boolean;
};

/**
 * Walks the days in order and carries the count forward. `seed` is the
 * last close BEFORE the first day (or null), so a window of 30 days does not
 * have to read the cash box's whole history.
 */
export function cashLedger(
  days: readonly string[],
  flows: ReadonlyMap<string, DayFlow>,
  closes: ReadonlyMap<string, StoredClose>,
  seed: StoredClose | null,
): LedgerDay[] {
  let carried: number | null = seed ? seed.counted : null;
  const out: LedgerDay[] = [];
  for (const date of days) {
    const f = flows.get(date) ?? { date, deposits: 0, movesIn: 0, expenses: 0, movesOut: 0 };
    const cashIn = flowIn(f),
      cashOut = flowOut(f);
    const close = closes.get(date) ?? null;
    if (close) {
      const expected = paisa(close.openingCash + cashIn - cashOut);
      const openingMoved = carried !== null && paisa(carried) !== paisa(close.openingCash);
      out.push({
        date,
        opening: close.openingCash,
        carriedIn: carried,
        cashIn,
        cashOut,
        expected,
        close,
        variance: paisa(close.counted - close.expected),
        changed: openingMoved || expected !== paisa(close.expected),
      });
      carried = close.counted;
    } else {
      const expected = carried === null ? null : paisa(carried + cashIn - cashOut);
      out.push({
        date,
        opening: carried,
        carriedIn: carried,
        cashIn,
        cashOut,
        expected,
        close: null,
        variance: null,
        changed: false,
      });
      carried = expected;
    }
  }
  return out;
}

/** A difference this small is a rounding coin, not a shortfall. */
export const VARIANCE_TOLERANCE = 0.5;
export const varianceTone = (v: number) =>
  Math.abs(v) <= VARIANCE_TOLERANCE ? "even" : v < 0 ? "short" : ("over" as "even" | "short" | "over");
export const VARIANCE_LABEL = { even: "Matches", short: "Short", over: "Over" } as const;

export const CASH_BOOK_WRITE_ROLES = ["ACCOUNTS"];
export const CASH_BOOK_READ_ROLES = ["ACCOUNTS", "ADMIN", "IT"];

/** v206 — the Month close screen's shapes, safe for a client component. */

export type MonthSnapshot = {
  given: number;
  returned: number;
  cash: number;
  bank: number;
  expensesCash: number;
  expensesBank: number;
  lifting: number;
  /** Everybody's due at the end of the month, company-wide. */
  outstanding: number;
  daysClosed: number;
  variance: number;
};

export type MonthCloseItem = {
  month: string;
  entries: number;
  /** The month still running — it cannot be closed yet. */
  running: boolean;
  closed: { byName: string; at: string; note: string | null; snapshot: MonthSnapshot } | null;
  /** For a month that has ended and is still open: what to look at before closing it. */
  checks: MonthChecks | null;
};

export type MonthChecks = { openCashDays: string[]; changedCashDays: string[] };

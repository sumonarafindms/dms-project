/** v206 — the Cash Book's shapes, safe for a client component (no Prisma). */

import type { CashMoveKind, Denominations, LedgerDay } from "./cash-book-rules";

export type CashBookLine = { id?: string; label: string; sub?: string | null; amount: number };

export type CashBookDay = LedgerDay & {
  /** Cash deposited by each person, largest first. */
  deposits: CashBookLine[];
  expenses: CashBookLine[];
  movesIn: (CashBookLine & { kind: CashMoveKind })[];
  movesOut: (CashBookLine & { kind: CashMoveKind })[];
  /** For reference only — money that went straight to the bank. */
  bankDeposits: number;
  bankExpenses: number;
  detail: {
    denominations: Denominations;
    note: string | null;
    closedByName: string;
    closedAt: string;
  } | null;
};

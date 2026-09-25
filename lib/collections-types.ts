/** v206 — the Collection dashboard's shapes, safe for a client component (no Prisma). */

import type { HolderType } from "./stock";

export type CollectionRow = {
  key: string;
  type: HolderType;
  id: string;
  name: string;
  code: string | null;
  supervisorName: string | null;
  /** The running due on the first morning of the month. */
  broughtForward: number;
  given: number;
  returned: number;
  cash: number;
  bank: number;
  collected: number;
  /** The due at the end of the period: brought forward + given − returned − collected. */
  closing: number;
  /** Collected ÷ (given − returned), %. Null when nothing net went out. */
  rate: number | null;
  lastPaid: string | null;
};

export type CollectionDay = { date: string; given: number; returned: number; collected: number };

export type Collections = {
  month: string;
  from: string;
  /** The last day counted: the month's end, or today while it is running. */
  to: string;
  /** True when the viewer sees every holder — the only case a due total is shown. */
  companyWide: boolean;
  rows: CollectionRow[];
  days: CollectionDay[];
  totals: {
    given: number;
    returned: number;
    cash: number;
    bank: number;
    collected: number;
    broughtForward: number | null;
    closing: number | null;
  };
  rate: number | null;
};

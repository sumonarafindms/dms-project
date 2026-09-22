/**
 * Stock and cash lives at /stock for everybody.
 *
 * Not under /accounts, even though Accounts is the only role that writes here.
 * Six roles read these screens, and a URL that says "accounts" in front of an
 * RSO's own ledger reads like somebody else's page. Who may do WHAT is decided
 * by `stockScope`, in one place; who may be here at all is decided once, here.
 *
 * The three entry routes narrow this to ACCOUNTS in their own `requireUser`.
 */

import { requireUser } from "../../lib/auth";

export const STOCK_ROLES = ["ACCOUNTS", "ADMIN", "BP", "IT", "MANAGER", "RSO", "SUPERVISOR"];

export default async function StockLayout({ children }: { children: React.ReactNode }) {
  await requireUser(["ACCOUNTS", "ADMIN", "BP", "IT", "MANAGER", "RSO", "SUPERVISOR"]);
  return children;
}

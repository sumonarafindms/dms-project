/**
 * v206 — Month close / lock. The owner picked it from the Accounts list:
 * *"Mash close korle purono entry ar keu bodlate parbe na (Admin chhara)"*.
 */

import { requireUser } from "../../../lib/auth";
import { dhakaTodayYmd } from "../../../lib/business-time";
import { monthCloseChecks, monthRows } from "../../../lib/month-close";
import { MONTH_CLOSE_ROLES, MONTH_REOPEN_ROLES, monthHasEnded, monthOfYmd } from "../../../lib/month-close-rules";
import type { MonthCloseItem } from "../../../lib/month-close-types";
import { LinkBtn, PageHeader } from "../../components/Kit";
import { Icon } from "../../components/icons";
import { MonthCloseView } from "../../components/MonthCloseView";

export const dynamic = "force-dynamic";

export default async function MonthClosePage() {
  // The literal, for tests/route-guards; tests/v206 asserts it matches the roles below.
  const me = await requireUser(["ACCOUNTS", "ADMIN", "IT"]);
  const today = dhakaTodayYmd();
  const running = monthOfYmd(today);

  const rows = await monthRows();
  if (!rows.some((r) => r.month === running)) rows.unshift({ month: running, entries: 0, closed: null });
  const months: MonthCloseItem[] = await Promise.all(
    rows.map(async (r) => ({
      ...r,
      running: !monthHasEnded(r.month, today),
      checks: !r.closed && monthHasEnded(r.month, today) ? await monthCloseChecks(r.month) : null,
    })),
  );

  return (
    <main className="page">
      <PageHeader
        title="Month close"
        subtitle="Close a month once it is over. Its figures are kept, and nothing dated in it can change — only Admin can reopen it."
        action={
          <LinkBtn href="/stock/cash-book" variant="ghost">
            <Icon name="wallet" /> Cash Book
          </LinkBtn>
        }
      />
      <MonthCloseView
        months={months}
        canClose={MONTH_CLOSE_ROLES.includes(me.role)}
        canReopen={MONTH_REOPEN_ROLES.includes(me.role)}
      />
    </main>
  );
}

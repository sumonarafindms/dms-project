/**
 * v206 — Cash Book & Day Close. The owner picked it from the Accounts list:
 * at the end of each day, how much cash should be in hand, how much is, and
 * the difference — counted note by note and signed off.
 */

import { requireUser } from "../../../lib/auth";
import { dhakaTodayYmd, isYmd } from "../../../lib/business-time";
import { cashBookDay, cashBookLedger } from "../../../lib/cash-book";
import { CASH_BOOK_WRITE_ROLES } from "../../../lib/cash-book-rules";
import { lockedFor } from "../../../lib/month-close";
import { LinkBtn, PageHeader } from "../../components/Kit";
import { Icon } from "../../components/icons";
import { CashBookView } from "../../components/CashBookView";

export const dynamic = "force-dynamic";

const shift = (ymd: string, days: number) =>
  new Date(new Date(`${ymd}T00:00:00.000Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);

export default async function CashBookPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  /*
   * The literal, not CASH_BOOK_READ_ROLES, because tests/route-guards reads
   * this call as source text. tests/v206 asserts the two agree.
   */
  const me = await requireUser(["ACCOUNTS", "ADMIN", "IT"]);
  const sp = await searchParams;
  const today = dhakaTodayYmd();
  // A day that has not begun has no cash to count.
  const date = isYmd(sp.date) && sp.date <= today ? sp.date : today;

  const [day, ledger, locked] = await Promise.all([
    cashBookDay(date),
    cashBookLedger(shift(today, -13), today),
    lockedFor([date]),
  ]);
  // Newest first; a quiet day with nothing to count is left out unless it is today.
  const history = ledger.filter((d) => d.close || d.cashIn || d.cashOut || d.date === today).reverse();

  return (
    <main className="page">
      <PageHeader
        title="Cash Book"
        subtitle="The cash box, day by day: what came in, what went out, and the count that closes the day."
        action={
          <LinkBtn href="/stock/month-close" variant="ghost">
            <Icon name="shield" /> Month close
          </LinkBtn>
        }
      />
      <CashBookView
        key={date}
        day={day}
        history={history}
        today={today}
        canWrite={CASH_BOOK_WRITE_ROLES.includes(me.role)}
        locked={locked}
      />
    </main>
  );
}

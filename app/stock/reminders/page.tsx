/**
 * v205 — Due reminders: everyone in scope who owes, and a WhatsApp reminder
 * one tap away. Scoped like every Stock & Cash screen (`stockScope`).
 */

import { requireUser } from "../../../lib/auth";
import { dhakaTodayYmd } from "../../../lib/business-time";
import { fmtMoney } from "../../../lib/format";
import { dueReminders } from "../../../lib/reminders";
import { daysBetween } from "../../../lib/reminder-text";
import { stockScope } from "../../../lib/stock-data";
import { PageHeader, SummaryStrip } from "../../components/Kit";
import { ReminderList } from "../../components/ReminderList";

export const dynamic = "force-dynamic";

export default async function RemindersPage() {
  const u = await requireUser(["ACCOUNTS", "ADMIN", "IT", "MANAGER", "SUPERVISOR"]);
  const scope = await stockScope(u);
  const today = dhakaTodayYmd();
  const rows = await dueReminders(scope);

  const quiet = rows.filter((r) => !r.lastDeposit || daysBetween(r.lastDeposit, today) >= 7).length;
  const remindedToday = rows.filter((r) => r.lastReminded && dhakaTodayYmd(new Date(r.lastReminded)) === today).length;

  return (
    <main className="page">
      <PageHeader
        title="Due reminders"
        subtitle="Everyone who owes money, how long since they last paid, and a polite WhatsApp reminder one tap away."
      />
      <SummaryStrip
        items={[
          { label: "People owing", value: rows.length.toLocaleString("en-US") },
          // A company figure is a real question; a team's "total" is not money anybody owes (lib/stock.ts).
          ...(scope.holders === null
            ? [{ label: "Outstanding", value: fmtMoney(rows.reduce((s, r) => s + r.due, 0)), tone: "brand" as const }]
            : []),
          {
            // Includes anyone who never paid; four tiles fit a phone as 2 × 2.
            label: "Nothing paid 7+ days",
            value: quiet.toLocaleString("en-US"),
            tone: quiet ? ("amber" as const) : undefined,
          },
          { label: "Reminded today", value: remindedToday.toLocaleString("en-US") },
        ]}
      />
      <ReminderList rows={rows} today={today} />
    </main>
  );
}

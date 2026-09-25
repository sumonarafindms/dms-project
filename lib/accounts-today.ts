/**
 * v206 — "Ajker kaj": what is waiting for Accounts today, at the top of their
 * home screen. The owner picked it: *"Accounts home-er upore 'Ajke ja baki'"*.
 *
 * Each item is a count read from the same functions its own page uses, and
 * each one opens that page — so the list can never say "3 people" while the
 * page it links to shows 4. An item appears only when there is something to
 * do; what is in order is listed underneath as done, so an empty list reads
 * as "all caught up" rather than "did it load?".
 */

import { dhakaTodayYmd } from "./business-time";
import { cashBookGaps } from "./cash-book";
import { monthRows } from "./month-close";
import { monthLabel, monthOfYmd, prevMonthOf } from "./month-close-rules";
import { dueReminders } from "./reminders";
import { daysBetween } from "./reminder-text";
import { productCatalogue, type StockScope } from "./stock-data";
import { simCheckRows } from "./lifting-data";
import { fmtDate } from "./format";
import type { TodayTask, TodayList } from "./accounts-today-types";

export type { TodayTask, TodayList } from "./accounts-today-types";

const shift = (ymd: string, days: number) =>
  new Date(new Date(`${ymd}T00:00:00.000Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);

/** How long a person can go without paying before they are on the list. */
export const QUIET_DAYS = 7;
/** A reminder sent this recently still counts — nobody should be chased twice in a row. */
export const REMINDED_WITHIN = 3;

export async function accountsToday(scope: StockScope, today = dhakaTodayYmd()): Promise<TodayList> {
  const yesterday = shift(today, -1);
  const month = monthOfYmd(today);
  const prev = prevMonthOf(month);

  const [cash, months, reminders, products, sims] = await Promise.all([
    cashBookGaps(shift(today, -13), yesterday),
    monthRows(),
    dueReminders(scope),
    productCatalogue(today),
    simCheckRows({ employeeIds: null }, { from: `${month}-01`, to: today }),
  ]);

  const tasks: TodayTask[] = [];
  const done: string[] = [];

  // 1. Cash counts changed after they were signed off — a figure someone approved is now wrong.
  if (cash.changed.length)
    tasks.push({
      key: "cash-changed",
      tone: "bad",
      count: cash.changed.length,
      title: `${cash.changed.length === 1 ? "A cash count" : `${cash.changed.length} cash counts`} changed after closing`,
      detail: `An entry on ${fmtDate(cash.changed[0])} moved after the notes were counted. Count it again.`,
      href: `/stock/cash-book?date=${cash.changed[0]}`,
      cta: "Re-check",
    });

  // 2. Products with no price today: the entry screen cannot record them.
  const unpriced = products.filter((p) => p.status === "ACTIVE" && p.current === null);
  if (unpriced.length)
    tasks.push({
      key: "unpriced",
      tone: "bad",
      count: unpriced.length,
      title: `${unpriced.length} product${unpriced.length === 1 ? " has" : "s have"} no price today`,
      detail: `${unpriced
        .slice(0, 3)
        .map((p) => p.subType)
        .join(", ")}${unpriced.length > 3 ? "…" : ""} — Daily Entry refuses a line with no price.`,
      href: "/stock/products",
      cta: "Set prices",
    });

  // 3. Days whose cash moved and was never counted.
  if (cash.open.length)
    tasks.push({
      key: "cash-open",
      tone: "warn",
      count: cash.open.length,
      title: `Close the cash for ${cash.open.length} day${cash.open.length === 1 ? "" : "s"}`,
      detail: `Oldest: ${fmtDate(cash.open[0])}. Count the notes and sign the day off.`,
      href: `/stock/cash-book?date=${cash.open[0]}`,
      cta: "Count cash",
    });
  else done.push("Cash counted for every day of the last two weeks");

  // 4. Last month still open.
  const prevRow = months.find((m) => m.month === prev);
  if (prevRow && !prevRow.closed && prevRow.entries > 0)
    tasks.push({
      key: "month-open",
      tone: "warn",
      title: `Close ${monthLabel(prev)}`,
      detail: "Lock last month's books so nothing in them can change by mistake.",
      href: "/stock/month-close",
      cta: "Close month",
    });
  else if (prevRow?.closed) done.push(`${monthLabel(prev)} is closed`);

  // 5. People who owe and have gone quiet, and were not chased lately.
  const quiet = reminders.filter(
    (r) =>
      (!r.lastDeposit || daysBetween(r.lastDeposit, today) >= QUIET_DAYS) &&
      (!r.lastReminded || daysBetween(r.lastReminded.slice(0, 10), today) >= REMINDED_WITHIN),
  );
  if (quiet.length)
    tasks.push({
      key: "quiet",
      tone: "warn",
      count: quiet.length,
      title: `${quiet.length} ${quiet.length === 1 ? "person has" : "people have"} paid nothing for ${QUIET_DAYS}+ days`,
      detail: "They owe money and have not been reminded in the last few days.",
      href: "/stock/reminders",
      cta: "Remind",
    });
  else if (reminders.length) done.push("Everyone who owes has paid or been reminded lately");

  // 6. SIMs activated but not reported sold — a question to ask, never a charge (lib/lifting.ts).
  const gaps = sims.filter((s) => s.unreported > 0);
  if (gaps.length)
    tasks.push({
      key: "sim-gap",
      tone: "info",
      count: gaps.length,
      title: `${gaps.length} RSO${gaps.length === 1 ? "" : "s"} activated more SIMs than they reported`,
      detail: "This month. Worth a question at the next deposit — it is not added to anybody's due.",
      href: "/stock/sim-check",
      cta: "Look",
    });

  return { today, yesterday, tasks, done };
}

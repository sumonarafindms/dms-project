/**
 * Accounts home — what moved, and who is holding it.
 *
 * v198, the owner's brief: *"Accounts ar dashboard ta o onk ta clean rakho...
 * Ja ja thakbe.."* — and then exactly two things. Per product, for this month
 * and for yesterday: the company lifting, what went out to the field, what
 * they reported sold, and for SIMs what actually activated — normal and swap
 * apart, each price apart, cards each apart. Then underneath: every RSO,
 * supervisor and BP, and what is in their hands.
 *
 * So that is the page. v197's tile grid, largest-dues card, godown list and
 * reference tiles are gone: every one of them is a menu item already, the
 * godown figure now sits on each product's own card, and a person's due sits
 * on their own row below. The one strip kept at the top is the four money
 * figures Accounts is answerable for, because a stock page with no money on it
 * would answer half the job.
 *
 * v206, the owner's pick from the Accounts list — "Ajker kaj" and a premium
 * home: a greeting and the day's date; the four money figures (collected
 * today and the cash box added); TODAY'S WORK, each item one tap from the
 * page that does it; this month's goods-out vs money-in; then v198's two
 * sections, unchanged, underneath. Still no tile grid: the few shortcuts are
 * one row of buttons, because on a phone the bottom bar has room for four.
 */

import { requirePagePermission } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { fmtMoney, fmtWeekdayDate } from "../../lib/format";
import { dhakaTodayYmd } from "../../lib/business-time";
import { stockScope } from "../../lib/stock-data";
import { accountsOverview } from "../../lib/accounts-overview";
import { accountsToday } from "../../lib/accounts-today";
import { cashBookLedger } from "../../lib/cash-book";
import { collections } from "../../lib/collections";
import { paisa } from "../../lib/stock";
import { LinkBtn, SectionHead } from "../components/Kit";
import { Icon } from "../components/icons";
import { AppLink } from "../components/AppLink";
import { AccountsOverview } from "../components/AccountsOverview";
import { TodayChecklist } from "../components/TodayChecklist";
import { CollectionChart } from "../components/CollectionChart";

export const dynamic = "force-dynamic";

/** Good morning / afternoon / evening, by the clock in Dhaka. */
function greeting(now = new Date()) {
  const h = new Date(now.getTime() + 6 * 3600e3).getUTCHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function Accounts() {
  const u = await requirePagePermission(["ACCOUNTS"], "dashboard");

  /*
   * "Entered today" counts holders with ANY line for today, from the same two
   * tables the entry screen writes. A count of people, not a percentage:
   * nobody is required to move stock every day, so a percentage of all
   * holders would read as a shortfall on every quiet day.
   */
  const today = dhakaTodayYmd();
  const todayAt = new Date(`${today}T00:00:00.000Z`);
  const scope = await stockScope(u);
  const [data, enteredMoves, enteredDeposits, work, [cashToday], month] = await Promise.all([
    accountsOverview(scope, today),
    prisma.stockMovement.findMany({
      where: { date: todayAt },
      distinct: ["holderType", "holderId"],
      select: { holderType: true, holderId: true },
    }),
    prisma.cashDeposit.findMany({
      where: { date: todayAt },
      select: { holderType: true, holderId: true, cash: true, bank: true },
    }),
    accountsToday(scope, today),
    cashBookLedger(today, today),
    collections(scope, today.slice(0, 7), today),
  ]);
  const enteredToday = new Set([
    ...enteredMoves.map((m) => `${m.holderType}:${m.holderId}`),
    ...enteredDeposits.map((d) => `${d.holderType}:${d.holderId}`),
  ]).size;
  const collectedToday = paisa(enteredDeposits.reduce((s, d) => s + Number(d.cash) + Number(d.bank), 0));
  const owing = data.holders.filter((h) => h.due > 0);
  const outstanding = paisa(owing.reduce((sum, h) => sum + h.due, 0));
  const topupId = new Set(data.products.filter((p) => p.category === "ITOPUP").map((p) => p.id));
  const topupOut = paisa(
    data.holders.reduce(
      (sum, h) => sum + h.lines.reduce((a, l) => a + (topupId.has(l.productId) ? Math.max(0, l.inHand) : 0), 0),
      0,
    ),
  );
  const kpis: { label: string; value: string; note: string; tone?: "brand"; href: string }[] = [
    {
      label: "Outstanding",
      value: fmtMoney(outstanding),
      note: `${owing.length} of ${data.holders.length} people owe · iTopup out ${fmtMoney(topupOut)}`,
      tone: owing.length ? "brand" : undefined,
      href: "/stock/reminders",
    },
    {
      label: "Collected today",
      value: fmtMoney(collectedToday),
      note: `${enteredToday} ${enteredToday === 1 ? "person" : "people"} entered today`,
      href: "/stock/day-report",
    },
    {
      label: "Cash in hand",
      value: cashToday.expected === null ? "Not counted yet" : fmtMoney(cashToday.expected),
      note: cashToday.close ? "Today is counted and closed" : "What the cash box should hold now",
      href: "/stock/cash-book",
    },
    {
      label: "Collection rate",
      value: month.rate === null ? "—" : `${month.rate}%`,
      note: `This month: ${fmtMoney(month.totals.collected)} in for ${fmtMoney(month.totals.given - month.totals.returned)} out`,
      href: "/stock/collections",
    },
  ];

  return (
    <main className="page acc-home">
      <section className="acc-hero">
        <div className="acc-hero-text">
          <span className="acc-hero-date">{fmtWeekdayDate(today)}</span>
          <h1>
            {greeting()}, {u.displayName}
          </h1>
          <p>
            {work.tasks.length
              ? `${work.tasks.length} thing${work.tasks.length === 1 ? "" : "s"} waiting for you today.`
              : "Everything is in order. Nothing is waiting for you."}
          </p>
        </div>
        <div className="acc-hero-acts">
          <LinkBtn href="/stock/daily">
            <Icon name="upload" /> Daily Entry
          </LinkBtn>
          <LinkBtn href="/stock/cash-book" variant="secondary">
            <Icon name="wallet" /> Cash Book
          </LinkBtn>
          <LinkBtn href="/stock/reminders" variant="secondary">
            <Icon name="alert" /> Due reminders
          </LinkBtn>
        </div>
      </section>

      <div className="acc-kpis">
        {kpis.map((k) => (
          <AppLink key={k.label} href={k.href} className="kit-card is-clickable acc-kpi">
            <span className="kit-label">{k.label}</span>
            <strong className={k.tone ? `tone-${k.tone}` : undefined}>{k.value}</strong>
            <span className="acc-kpi-note">{k.note}</span>
          </AppLink>
        ))}
      </div>

      <div className="acc-split">
        <TodayChecklist list={work} />
        <div className="kit-card kit-card-p acc-month">
          <SectionHead
            title="This month"
            sub="Goods given out against money collected, day by day."
            link={
              <LinkBtn href="/stock/collections" variant="ghost" size="sm">
                Collections <Icon name="arrow" />
              </LinkBtn>
            }
          />
          <CollectionChart days={month.days} />
        </div>
      </div>

      <AccountsOverview data={data} />
    </main>
  );
}

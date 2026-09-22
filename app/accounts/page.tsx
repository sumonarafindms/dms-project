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
 */

import { requirePagePermission } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { fmtMoney } from "../../lib/format";
import { dhakaTodayYmd } from "../../lib/business-time";
import { stockScope } from "../../lib/stock-data";
import { accountsOverview } from "../../lib/accounts-overview";
import { paisa } from "../../lib/stock";
import { LinkBtn, PageHeader, SummaryStrip } from "../components/Kit";
import { Icon } from "../components/icons";
import { AccountsOverview } from "../components/AccountsOverview";

export const dynamic = "force-dynamic";

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
  const [data, enteredMoves, enteredDeposits] = await Promise.all([
    accountsOverview(await stockScope(u), today),
    prisma.stockMovement.findMany({
      where: { date: todayAt },
      distinct: ["holderType", "holderId"],
      select: { holderType: true, holderId: true },
    }),
    prisma.cashDeposit.findMany({ where: { date: todayAt }, select: { holderType: true, holderId: true } }),
  ]);
  const enteredToday = new Set([
    ...enteredMoves.map((m) => `${m.holderType}:${m.holderId}`),
    ...enteredDeposits.map((d) => `${d.holderType}:${d.holderId}`),
  ]).size;
  const owing = data.holders.filter((h) => h.due > 0);
  const outstanding = paisa(owing.reduce((sum, h) => sum + h.due, 0));
  const topupId = new Set(data.products.filter((p) => p.category === "ITOPUP").map((p) => p.id));
  const topupOut = paisa(
    data.holders.reduce(
      (sum, h) => sum + h.lines.reduce((a, l) => a + (topupId.has(l.productId) ? Math.max(0, l.inHand) : 0), 0),
      0,
    ),
  );

  return (
    <main className="page acc-home">
      <PageHeader
        title="Accounts"
        subtitle={`${u.displayName} · Stock and money`}
        action={
          <span className="cmp-head-actions">
            <LinkBtn href="/stock/daily">
              <Icon name="upload" /> Daily Entry
            </LinkBtn>
            <LinkBtn href="/stock/day-report" variant="secondary">
              <Icon name="file" /> Daily Report
            </LinkBtn>
          </span>
        }
      />

      <SummaryStrip
        items={[
          { label: "Outstanding", value: fmtMoney(outstanding), tone: owing.length ? "brand" : undefined },
          { label: "With a due", value: `${owing.length} of ${data.holders.length}` },
          { label: "Entered today", value: String(enteredToday) },
          { label: "iTopup out", value: fmtMoney(topupOut) },
        ]}
      />

      <AccountsOverview data={data} />
    </main>
  );
}

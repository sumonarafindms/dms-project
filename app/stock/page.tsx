/**
 * Stock & Cash — the landing screen.
 *
 * Answers the two questions the owner named as the ones Accounts cares about
 * most: who owes money, and who is holding the recharge float. Both are shown
 * worst-first, because a list sorted by name buries the one row somebody
 * needed to see.
 *
 * A person who holds stock themselves — an RSO, a BP, a supervisor — lands on
 * their own position instead, because that is the whole of what they came for.
 */

import { redirect } from "next/navigation";
import { requireUser } from "../../lib/auth";
import { fmtMoney } from "../../lib/format";
import { holderDues, stockScope } from "../../lib/stock-data";
import { paisa } from "../../lib/stock";
import { Card, EmptyState, LinkBtn, PageHeader, SectionHead, SummaryStrip } from "../components/Kit";
import { Icon } from "../components/icons";
import { StockHolderTable } from "../components/StockViews";

export const dynamic = "force-dynamic";

export default async function StockHome() {
  const u = await requireUser();
  const scope = await stockScope(u);

  // One holder and nothing else to compare against: send them to their page.
  if (scope.self && scope.holders && scope.holders.size === 1) redirect(`/stock/${scope.self.type}/${scope.self.id}`);

  const rows = await holderDues(scope);

  if (!rows.length)
    return (
      <main className="page">
        <PageHeader title="Stock & Cash" subtitle="Stock handed out, money collected, and what is still owed." />
        <EmptyState
          title="Nobody in scope yet"
          hint={
            scope.canWrite
              ? "Add products, then set each person's opening position to start the ledger."
              : "No team is mapped to this login, so there is nobody to show."
          }
          icon={<Icon name="wallet" />}
        />
      </main>
    );

  const owing = rows.filter((r) => r.due > 0);
  const totalDue = paisa(owing.reduce((s, r) => s + r.due, 0));
  const topup = paisa(rows.reduce((s, r) => s + Math.max(0, r.topupInHand), 0));

  return (
    <main className="page">
      <PageHeader
        title="Stock & Cash"
        subtitle="Stock handed out, money collected, and what is still owed."
        action={
          scope.canWrite ? (
            <LinkBtn href="/stock/daily">
              <Icon name="upload" /> Daily entry
            </LinkBtn>
          ) : undefined
        }
      />

      <SummaryStrip
        items={[
          { label: "People", value: String(rows.length) },
          { label: "Outstanding", value: fmtMoney(totalDue), tone: "brand" },
          { label: "With a due", value: `${owing.length} of ${rows.length}` },
          { label: "iTopup out", value: fmtMoney(topup) },
        ]}
      />

      <SectionHead
        title="Highest due first"
        sub="Everyone who owes something, largest first. Each person's stock is their own."
      />
      <StockHolderTable rows={rows} />

      {!owing.length && (
        <Card className="kit-card-p">
          <p className="kit-note is-ok">
            <Icon name="check" /> Nobody is carrying a due right now.
          </p>
        </Card>
      )}
    </main>
  );
}

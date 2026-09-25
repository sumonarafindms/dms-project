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
import { ReportActionBar } from "../components/ReportShell";
import { Icon } from "../components/icons";
import { StockHolderTable } from "../components/StockViews";
import { ServerSearchBar } from "../components/ServerSearchBar";
import { matchesTokens } from "../../lib/text-search";

export const dynamic = "force-dynamic";

export default async function StockHome({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const u = await requireUser();
  const scope = await stockScope(u);

  // One holder and nothing else to compare against: send them to their page.
  if (scope.self && scope.holders && scope.holders.size === 1) redirect(`/stock/${scope.self.type}/${scope.self.id}`);

  const rows = await holderDues(scope);
  const q = String((await searchParams).q ?? "")
    .slice(0, 80)
    .trim()
    .toLowerCase();

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

  const shown = q
    ? rows.filter((r) =>
        matchesTokens(
          `${r.name} ${r.code ?? ""} ${r.supervisorName ?? ""}`.toLowerCase(),
          q,
          (r.phones ?? []).join(" "),
        ),
      )
    : rows;
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
            <span className="kit-rowacts">
              <LinkBtn href="/stock/daily">
                <Icon name="upload" /> Daily entry
              </LinkBtn>
              <LinkBtn href="/stock/reminders" variant="secondary">
                <Icon name="alert" /> Due reminders
              </LinkBtn>
              <LinkBtn href="/stock/products" variant="ghost">
                <Icon name="shop" /> Products
              </LinkBtn>
            </span>
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

      <ReportActionBar exportHref="/api/stock/export?report=dues" rowCount={rows.length} />

      <SectionHead
        title="Highest due first"
        sub="Everyone who owes something, largest first. Each person's stock is their own."
      />
      {/*
        v201: find a person by name, code or phone — an RSO's wallet, a BP
        outlet's numbers, the number they log in with. The totals above stay
        everyone's; only the list narrows.
      */}
      <ServerSearchBar
        placeholder="Find a name, code or phone"
        resultCount={q ? shown.length : undefined}
        resultNoun="row"
      />
      {shown.length ? (
        <StockHolderTable rows={shown} />
      ) : (
        <EmptyState
          title="Nobody matches"
          hint="Try a different name, code or phone number."
          icon={<Icon name="users" />}
        />
      )}

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

/**
 * One holder's ledger.
 *
 * The same page for everybody — an RSO opening their own, a supervisor
 * opening one of their team's, Accounts opening anyone's. `stockScope` decides
 * who may see it; the page does not have a second idea about that.
 *
 * The due at the top is ALL TIME, not the selected period, because it is a
 * running balance. There is no date filter on this page for that reason: a
 * range would answer a different question and print it under the same word.
 */

import { notFound, redirect } from "next/navigation";
import { requireUser } from "../../../../lib/auth";
import { fmtMoney } from "../../../../lib/format";
import { findHolder, holderHistory, holderPosition, mayOpen, stockScope } from "../../../../lib/stock-data";
import { HOLDER_TYPE_LABEL, dueTone, type HolderType } from "../../../../lib/stock";
import { Card, LinkBtn, PageHeader, SectionHead, SummaryStrip } from "../../../components/Kit";
import { ReportActionBar } from "../../../components/ReportShell";
import { Icon } from "../../../components/icons";
import { DueBadge, StockHistoryTable, StockLineTable } from "../../../components/StockViews";

export const dynamic = "force-dynamic";

const TYPES: HolderType[] = ["RSO", "SUPERVISOR", "BP"];

export default async function HolderLedger({ params }: { params: Promise<{ type: string; id: string }> }) {
  const u = await requireUser();
  const { type: rawType, id } = await params;
  const type = String(rawType).toUpperCase() as HolderType;
  if (!TYPES.includes(type)) notFound();

  const scope = await stockScope(u);
  /*
   * Out of scope redirects home rather than 404ing. A 404 would tell a
   * supervisor whether an id exists in another team, which is a question they
   * should not be able to ask.
   */
  if (!mayOpen(scope, type, id)) redirect("/stock");

  const holder = await findHolder(type, id);
  if (!holder) notFound();

  const [position, history] = await Promise.all([holderPosition(holder), holderHistory(type, id, 30)]);
  const { due } = position;
  const stockValue = position.lines.reduce((s, l) => s + l.inHandValue, 0);

  return (
    <main className="page">
      <PageHeader
        title={holder.name}
        subtitle={`${HOLDER_TYPE_LABEL[holder.type]}${holder.code ? ` · ${holder.code}` : ""}${
          holder.supervisorName ? ` · ${holder.supervisorName}` : ""
        }`}
        action={
          <span className="kit-rowacts">
            {/* v203: the month statement, to print or send. */}
            <LinkBtn href={`/stock/${holder.type}/${holder.id}/statement`} variant="ghost">
              <Icon name="file" /> Statement
            </LinkBtn>
            {scope.canWrite ? (
              <LinkBtn href={`/stock/daily?holder=${holder.type}:${holder.id}`}>
                <Icon name="upload" /> Enter a day
              </LinkBtn>
            ) : null}
          </span>
        }
      />

      <SummaryStrip
        items={[
          {
            label: "Due now",
            value: fmtMoney(Math.abs(due.due)),
            tone: dueTone(due.due) === "owing" ? "brand" : undefined,
          },
          { label: "Stock in hand", value: fmtMoney(stockValue) },
          { label: "Deposited", value: fmtMoney(due.deposited) },
          { label: "Sold", value: fmtMoney(position.soldValue) },
        ]}
      />

      <Card className="kit-card-p kit-mb-20">
        <SectionHead
          title="How the due is made up"
          sub="A sale does not reduce a due. Only money deposited, or stock handed back, does."
        />
        <dl className="kit-daysum">
          <div>
            <dt>Opening{position.openingAsOf ? ` (${position.openingAsOf})` : ""}</dt>
            <dd>{fmtMoney(due.openingDue)}</dd>
          </div>
          <div>
            <dt>Given since</dt>
            <dd>{fmtMoney(due.givenValue)}</dd>
          </div>
          <div>
            <dt>Returned</dt>
            <dd>−{fmtMoney(due.returnedValue)}</dd>
          </div>
          <div>
            <dt>Deposited</dt>
            <dd>−{fmtMoney(due.deposited)}</dd>
          </div>
          <div className="is-total">
            <dt>Due</dt>
            <dd className={`kit-due is-${dueTone(due.due)}`}>
              {fmtMoney(Math.abs(due.due))} <DueBadge due={due.due} />
            </dd>
          </div>
        </dl>
      </Card>

      <ReportActionBar
        exportHref={`/api/stock/export?report=stock&type=${holder.type}&id=${holder.id}`}
        rowCount={position.lines.length}
      />
      {/*
       * v195: this line used to say "each price version is its own line", which
       * was v192's model and has been false since v193 — one product, one line,
       * each lot valued at the price it came at.
       */}
      <SectionHead
        title="Stock"
        sub="One line per product. Carried at is what they hold it at — each lot at the price it came to them."
      />
      <div className="kit-mb-20">
        <StockLineTable lines={position.lines} />
      </div>

      <SectionHead title="Last 30 days" sub="Newest first." />
      <StockHistoryTable rows={history} />
    </main>
  );
}

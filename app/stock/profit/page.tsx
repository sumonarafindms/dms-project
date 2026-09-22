/**
 * What the distribution actually made.
 *
 * The owner asked for both margins side by side, and he was right to:
 *
 *   **Issued** — what the stock we have handed out is worth to us if it all
 *   sells. It says what is in play.
 *
 *   **Sold** — what has actually been earned, on the quantity the field has
 *   reported selling. It says what is real.
 *
 * Showing only the first flatters a month where nothing moved; showing only
 * the second hides a godown full of stock. The NET is on the sold basis, less
 * expenses, because stock sitting with an RSO is not profit — it is stock with
 * an RSO, and calling it profit is how a distributor finds out at the end of a
 * quarter that the money was never there.
 *
 * The godown figure on this page is ALL TIME whatever period is chosen, and is
 * labelled so. "What was in the godown between the 1st and the 14th" is not a
 * question with an answer.
 */

import { requireUser } from "../../../lib/auth";
import { resolveRange } from "../../../lib/report-range";
import { godown, houseBooks } from "../../../lib/lifting-data";
import { marginPercent } from "../../../lib/lifting";
import { fmtMoney, fmtNumber } from "../../../lib/format";
import { isMoneyProduct } from "../../../lib/stock";
import { Card, LinkBtn, PageHeader, SectionHead, SummaryStrip } from "../../components/Kit";
import { ReportDateBar } from "../../components/ReportShell";
import { Icon } from "../../components/icons";

export const dynamic = "force-dynamic";

const pct = (m: number, v: number) => {
  const p = marginPercent(m, v);
  return p === null ? "—" : `${p}%`;
};

export default async function ProfitPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  /*
   * The literal, not BOOKS_READ_ROLES, because tests/route-guards reads this
   * call as source text. tests/lifting.smoke.test.ts asserts they agree.
   */
  await requireUser(["ACCOUNTS", "ADMIN", "IT"]);

  const sp = await searchParams;
  const range = resolveRange(sp.from, sp.to);
  const [books, allTime] = await Promise.all([houseBooks(range), godown()]);
  const { profit } = books;
  const godownValue = allTime.reduce((s, l) => s + l.godownValue, 0);

  const nowIso = new Date().toISOString();

  return (
    <main className="page">
      <PageHeader
        title="Profit & loss"
        subtitle="What we paid the company, what we charged the field, and what is left."
        action={
          <LinkBtn href="/stock/lifting" variant="ghost">
            <Icon name="upload" /> Lifting
          </LinkBtn>
        }
      />
      <ReportDateBar range={range} nowIso={nowIso} />

      <SummaryStrip
        items={[
          { label: "Margin on sold", value: fmtMoney(profit.marginSold), tone: "brand" },
          { label: "Expenses", value: fmtMoney(profit.expenses) },
          { label: "Net", value: fmtMoney(profit.net) },
          { label: "In godown now", value: fmtMoney(godownValue) },
        ]}
      />

      <Card className="kit-card-p kit-mb-20">
        <SectionHead
          title="The period"
          sub="Issued says what is in play. Sold says what has been earned. The net is on the sold basis."
        />
        <dl className="kit-daysum">
          <div>
            <dt>Lifted from the company</dt>
            <dd>{fmtMoney(profit.liftedCost)}</dd>
          </div>
          <div>
            <dt>Issued to the field, at our price</dt>
            <dd>{fmtMoney(profit.issuedValue)}</dd>
          </div>
          <div>
            <dt>What that issued stock cost us</dt>
            <dd className="is-muted">{fmtMoney(profit.issuedCost)}</dd>
          </div>
          <div>
            <dt>Margin if it all sells ({pct(profit.marginIssued, profit.issuedValue)})</dt>
            <dd className="is-muted">{fmtMoney(profit.marginIssued)}</dd>
          </div>
          <div>
            <dt>Reported sold</dt>
            <dd>{fmtMoney(profit.soldValue)}</dd>
          </div>
          <div>
            <dt>What that sold stock cost us</dt>
            <dd className="is-muted">{fmtMoney(profit.soldCost)}</dd>
          </div>
          <div>
            <dt>Margin earned ({pct(profit.marginSold, profit.soldValue)})</dt>
            <dd>{fmtMoney(profit.marginSold)}</dd>
          </div>
          <div>
            <dt>Expenses</dt>
            <dd>−{fmtMoney(profit.expenses)}</dd>
          </div>
          <div className="is-total">
            <dt>Net for the period</dt>
            <dd className={profit.net < 0 ? "kit-due is-owing" : undefined}>{fmtMoney(profit.net)}</dd>
          </div>
        </dl>
      </Card>

      <SectionHead title="By product" sub="Margin on what was issued and on what was sold, for the period above." />
      <div className="kit-table-wrap kit-mb-20">
        <table className="kit-report-table" role="table">
          <thead>
            <tr role="row">
              <th role="columnheader" scope="col">
                Product
              </th>
              <th role="columnheader" scope="col" className="is-right">
                Avg cost
              </th>
              <th role="columnheader" scope="col" className="is-right">
                Issued
              </th>
              <th role="columnheader" scope="col" className="is-right">
                Margin issued
              </th>
              <th role="columnheader" scope="col" className="is-right">
                Sold
              </th>
              <th role="columnheader" scope="col" className="is-right">
                Margin sold
              </th>
            </tr>
          </thead>
          <tbody>
            {books.lines
              .filter((l) => l.issuedQty || l.soldQty || l.liftedQty)
              .map((l) => {
                const qty = (n: number) => (isMoneyProduct(l.product.category) ? fmtMoney(n) : fmtNumber(n));
                return (
                  <tr role="row" key={l.product.id}>
                    <td role="cell" data-label="Product">
                      <strong>{l.product.subType}</strong>
                    </td>
                    <td role="cell" data-label="Avg cost" className="is-right">
                      {l.avgCost > 0 ? fmtMoney(l.avgCost) : <span className="kit-cell-unset">—</span>}
                    </td>
                    <td role="cell" data-label="Issued" className="is-right">
                      {qty(l.issuedQty)}
                      <span className="kit-cell-sub">{fmtMoney(l.issuedValue)}</span>
                    </td>
                    <td role="cell" data-label="Margin issued" className="is-right">
                      {l.avgCost > 0 ? fmtMoney(l.marginIssued) : <span className="kit-cell-unset">no cost yet</span>}
                    </td>
                    <td role="cell" data-label="Sold" className="is-right">
                      {qty(l.soldQty)}
                      <span className="kit-cell-sub">{fmtMoney(l.soldValue)}</span>
                    </td>
                    <td role="cell" data-label="Margin sold" className="is-right">
                      {l.avgCost > 0 ? fmtMoney(l.marginSold) : <span className="kit-cell-unset">no cost yet</span>}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/*
       * The figures NOT in the margins above.
       *
       * Reported rather than silently dropped: leaving it out understates the
       * business exactly as counting it at zero cost overstated it. In the
       * seeded month that mistake was worth ৳3.3 lakh of invented profit,
       * and .scratch/audit194.ts is what caught it.
       */}
      {profit.uncostedProducts.length > 0 && (
        <Card className="kit-card-p kit-mb-20">
          <SectionHead
            title="Not counted above"
            sub="No lifting has been recorded for these, so there is no cost to subtract and no margin to show."
          />
          <dl className="kit-daysum">
            <div>
              <dt>Products</dt>
              <dd>{profit.uncostedProducts.join(", ")}</dd>
            </div>
            <div>
              <dt>Issued, excluded from the margin</dt>
              <dd className="is-muted">{fmtMoney(profit.uncostedIssuedValue)}</dd>
            </div>
            <div className="is-total">
              <dt>Sold, excluded from the margin</dt>
              <dd className="is-muted">{fmtMoney(profit.uncostedSoldValue)}</dd>
            </div>
          </dl>
          <p className="kit-note">
            <Icon name="info" /> Record what these cost on the Lifting page and they join the figures above.
          </p>
        </Card>
      )}

      <p className="kit-note">
        <Icon name="info" /> A product with no lifting recorded has no cost, so its margin is left blank rather than
        shown as pure profit. Record the lifting and the figure appears.
      </p>
    </main>
  );
}

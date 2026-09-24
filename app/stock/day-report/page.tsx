/**
 * Daily report — the evening report Accounts sends.
 *
 * The owner: *"accounts ar proti din report dite hoi.. je tar koto takar sell
 * hoice.. koto taka bank a gase and koto taka cash paice.. koto taka expanse a
 * gase.. ki ki expanse gase... scratch card koto takar sell.. sim koita and
 * koto takar sell... mane sob kicur report dite hoi"*.
 *
 * One day, in the order somebody reads it aloud at closing: what sold, what
 * came in, what went out, and what the drawer should hold. **Copy summary**
 * produces the plain-text version for a message — the way this report actually
 * leaves the building — and **Export Excel** produces the file.
 *
 * Accounts, IT and Admin, like the rest of the buying side: it lists expenses
 * and what the company sent, and the owner kept both with those three roles.
 */

import { requireUser } from "../../../lib/auth";
import { dhakaTodayYmd, dhakaYesterdayYmd, isYmd } from "../../../lib/business-time";
import { dailyReport, dailySummaryText } from "../../../lib/daily-report";
import { PAID_FROM_LABEL } from "../../../lib/lifting";
import { fmtMoney, fmtNumber } from "../../../lib/format";
import { Badge, Card, EmptyState, PageHeader, SectionHead, SummaryStrip } from "../../components/Kit";
import { ReportActionBar } from "../../components/ReportShell";
import { SupportDayPicker } from "../../components/SupportDayPicker";
import { Icon } from "../../components/icons";

export const dynamic = "force-dynamic";

export default async function DayReport({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  /*
   * The literal, not BOOKS_READ_ROLES, because tests/route-guards reads this
   * call as source text. tests/stock-export.smoke.test.ts asserts they agree.
   */
  await requireUser(["ACCOUNTS", "ADMIN", "IT"]);

  const sp = await searchParams;
  const today = dhakaTodayYmd();
  const date = isYmd(sp.date) ? sp.date : today;
  const r = await dailyReport(date);

  const exportHref = `/api/stock/export?report=daily&date=${date}`;
  const itemCount =
    r.sold.byProduct.length + r.collected.depositors.length + r.expenses.items.length + (r.lifted.lines ? 1 : 0);

  return (
    <main className="page">
      <PageHeader title="Daily report" subtitle="One day: what sold, what came in, what went out." />
      <SupportDayPicker date={date} todayYmd={today} yesterdayYmd={dhakaYesterdayYmd()} />
      <ReportActionBar exportHref={exportHref} rowCount={r.empty ? 0 : itemCount} summary={dailySummaryText(r)} />

      {r.empty ? (
        /*
         * Nothing recorded is not the same as a day of zeros, and the page
         * says which one it is. A report of ৳0 everywhere reads as "the day
         * happened and nothing sold"; this reads as "nobody entered it yet".
         */
        <EmptyState
          title={`Nothing recorded for ${date}`}
          hint="No sales, deposits, expenses or liftings were entered for this day yet."
          icon={<Icon name="file" />}
        />
      ) : (
        <>
          <SummaryStrip
            items={[
              { label: "Sold", value: fmtMoney(r.sold.total), tone: "brand" },
              { label: "Collected", value: fmtMoney(r.collected.total) },
              { label: "Expenses", value: fmtMoney(r.expenses.total) },
              { label: "Net", value: fmtMoney(r.net.total) },
            ]}
          />

          <Card className="kit-card-p kit-mb-20">
            <SectionHead
              title="What sold"
              sub="As the field reported it. Collected money is below — the two are not the same."
            />
            {r.sold.byProduct.length ? (
              <dl className="kit-daysum">
                {r.sold.byProduct.map((p) => (
                  <div key={p.product}>
                    <dt>
                      {p.product}
                      <span className="kit-cell-sub">{p.label}</span>
                    </dt>
                    <dd>
                      {!p.money && <span className="kit-cell-sub">{fmtNumber(p.qty)} pcs</span>}
                      {fmtMoney(p.value)}
                    </dd>
                  </div>
                ))}
                <div className="is-total">
                  <dt>Total sold</dt>
                  <dd>{fmtMoney(r.sold.total)}</dd>
                </div>
              </dl>
            ) : (
              <p className="kit-note">No sales were reported for this day.</p>
            )}

            {r.sold.byCategory.length > 1 && (
              <>
                <SectionHead title="By kind" />
                <dl className="kit-daysum">
                  {r.sold.byCategory.map((c) => (
                    <div key={c.label}>
                      <dt>{c.label}</dt>
                      <dd>
                        {!c.money && <span className="kit-cell-sub">{fmtNumber(c.qty)} pcs</span>}
                        {fmtMoney(c.value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </Card>

          <Card className="kit-card-p kit-mb-20">
            <SectionHead title="Money in" sub="What was actually deposited today, by whom." />
            <dl className="kit-daysum">
              <div>
                <dt>Cash</dt>
                <dd>{fmtMoney(r.collected.cash)}</dd>
              </div>
              <div>
                <dt>Bank</dt>
                <dd>{fmtMoney(r.collected.bank)}</dd>
              </div>
              <div className="is-total">
                <dt>Collected</dt>
                <dd>{fmtMoney(r.collected.total)}</dd>
              </div>
            </dl>
            {r.collected.depositors.length > 0 && (
              <div className="kit-table-wrap">
                <table className="kit-report-table" role="table">
                  <thead>
                    <tr role="row">
                      <th role="columnheader" scope="col">
                        Person
                      </th>
                      <th role="columnheader" scope="col" className="is-right">
                        Cash
                      </th>
                      <th role="columnheader" scope="col" className="is-right">
                        Bank
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.collected.depositors.map((d, i) => (
                      <tr role="row" key={`${d.name}-${i}`}>
                        <td role="cell" data-label="Person">
                          <strong>{d.name}</strong>
                          <span className="kit-cell-sub">{d.role}</span>
                        </td>
                        <td role="cell" data-label="Cash" className="is-right">
                          {fmtMoney(d.cash)}
                        </td>
                        <td role="cell" data-label="Bank" className="is-right">
                          {fmtMoney(d.bank)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="kit-card-p kit-mb-20">
            <SectionHead title="Expenses" sub="Every item, and whether it left the drawer or the account." />
            {r.expenses.items.length ? (
              <dl className="kit-daysum">
                {r.expenses.items.map((e, i) => (
                  <div key={i}>
                    <dt>
                      {e.label}
                      {(e.note || e.payee) && (
                        <span className="kit-cell-sub">{[e.payee, e.note].filter(Boolean).join(" · ")}</span>
                      )}
                    </dt>
                    <dd>
                      <Badge tone={e.paidFrom === "CASH" ? "neutral" : "active"}>{PAID_FROM_LABEL[e.paidFrom]}</Badge>{" "}
                      {fmtMoney(e.amount)}
                    </dd>
                  </div>
                ))}
                <div className="is-total">
                  <dt>Total expenses</dt>
                  <dd>{fmtMoney(r.expenses.total)}</dd>
                </div>
              </dl>
            ) : (
              <p className="kit-note">No expenses were recorded for this day.</p>
            )}
          </Card>

          <Card className="kit-card-p kit-mb-20">
            <SectionHead title="The drawer" sub="What today did to the cash in hand and to the bank." />
            <dl className="kit-daysum">
              <div>
                <dt>Cash in − cash spent</dt>
                <dd className={r.net.cash < 0 ? "kit-due is-owing" : undefined}>{fmtMoney(r.net.cash)}</dd>
              </div>
              <div>
                <dt>Bank in − bank spent</dt>
                <dd className={r.net.bank < 0 ? "kit-due is-owing" : undefined}>{fmtMoney(r.net.bank)}</dd>
              </div>
              <div className="is-total">
                <dt>Net for the day</dt>
                <dd className={r.net.total < 0 ? "kit-due is-owing" : undefined}>{fmtMoney(r.net.total)}</dd>
              </div>
            </dl>
          </Card>

          {(r.given.total > 0 || r.returned.total > 0 || r.lifted.lines > 0) && (
            <Card className="kit-card-p kit-mb-20">
              <SectionHead title="Stock that moved" sub="Handed out, handed back, and bought from the company." />
              <dl className="kit-daysum">
                {r.given.byCategory.map((c) => (
                  <div key={c.label}>
                    <dt>Given out — {c.label}</dt>
                    <dd>
                      {!c.money && <span className="kit-cell-sub">{fmtNumber(c.qty)} pcs</span>}
                      {fmtMoney(c.value)}
                    </dd>
                  </div>
                ))}
                {r.returned.total > 0 && (
                  <div>
                    <dt>Handed back</dt>
                    <dd>{fmtMoney(r.returned.total)}</dd>
                  </div>
                )}
                {r.lifted.lines > 0 && (
                  <div>
                    <dt>
                      Lifted from the company
                      <span className="kit-cell-sub">
                        {r.lifted.lines} {r.lifted.lines === 1 ? "entry" : "entries"}
                      </span>
                    </dt>
                    <dd>{fmtMoney(r.lifted.cost)}</dd>
                  </div>
                )}
              </dl>
            </Card>
          )}

          <p className="kit-note">
            <Icon name="info" /> Copy summary leaves out what the company charged us, because the text gets forwarded.
            The Excel file includes it.
          </p>
        </>
      )}
    </main>
  );
}

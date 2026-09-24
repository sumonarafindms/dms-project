/**
 * v203 — one person's statement for a month.
 *
 * The owner picked it from the "user friendly" list: the page Accounts prints
 * (or saves as PDF) and hands an RSO or BP at month end — brought forward,
 * every day's stock and money, and the due carried forward — plus the same
 * totals as a WhatsApp message.
 *
 * Same guard as the ledger it hangs off: `stockScope` decides who may open
 * whom, and anyone out of scope is sent to /stock rather than told whether the
 * id exists.
 */

import { notFound, redirect } from "next/navigation";
import { requireUser } from "../../../../../lib/auth";
import { dhakaMonth, dhakaTodayYmd, isYm } from "../../../../../lib/business-time";
import { fmtDate, fmtMoney } from "../../../../../lib/format";
import { findHolder, holderPhone, holderStatement, mayOpen, stockScope } from "../../../../../lib/stock-data";
import { HOLDER_TYPE_LABEL, dueTone, type HolderType } from "../../../../../lib/stock";
import { statementMessage, type StatementItem } from "../../../../../lib/statement";
import { Card, EmptyState, LinkBtn, PageHeader, SectionHead, SummaryStrip } from "../../../../components/Kit";
import { ReportActionBar } from "../../../../components/ReportShell";
import { AppLink } from "../../../../components/AppLink";
import { Icon } from "../../../../components/icons";
import { DueBadge } from "../../../../components/StockViews";
import { SupportOfferMessage } from "../../../../components/SupportOfferMessage";

export const dynamic = "force-dynamic";

const TYPES: HolderType[] = ["RSO", "SUPERVISOR", "BP"];

function monthLabel(ym: string) {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${ym}-01T00:00:00.000Z`),
  );
}
function shiftMonth(ym: string, by: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function lastDay(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

/** "Normal 150 × 30 · iTopup ৳10,000" */
function items(list: StatementItem[]) {
  return list
    .map((i) => (i.money ? `${i.name} ${fmtMoney(i.qty)}` : `${i.name} × ${i.qty.toLocaleString("en-US")}`))
    .join(" · ");
}

export default async function HolderStatement({
  params,
  searchParams,
}: {
  params: Promise<{ type: string; id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const u = await requireUser();
  const { type: rawType, id } = await params;
  const type = String(rawType).toUpperCase() as HolderType;
  if (!TYPES.includes(type)) notFound();

  const scope = await stockScope(u);
  if (!mayOpen(scope, type, id)) redirect("/stock");
  const holder = await findHolder(type, id);
  if (!holder) notFound();

  const thisMonth = dhakaMonth();
  const sp = await searchParams;
  const month = isYm(sp.month) && sp.month <= thisMonth ? sp.month : thisMonth;
  const from = `${month}-01`;
  // The current month runs to today; a past month to its last day.
  const to = month === thisMonth ? dhakaTodayYmd() : lastDay(month);

  const [s, phone] = await Promise.all([
    holderStatement(holder, from, to),
    scope.canWrite ? holderPhone(holder) : Promise.resolve(null),
  ]);
  const base = `/stock/${holder.type}/${holder.id}/statement`;
  const deposited = s.totals.cash + s.totals.bank;

  return (
    <main className="page stmt-page">
      <AppLink href={`/stock/${holder.type}/${holder.id}`} className="kit-detail-back no-print">
        <Icon name="arrow" /> Back to {holder.name}&apos;s ledger
      </AppLink>
      <PageHeader
        title={`Statement — ${holder.name}`}
        subtitle={`${HOLDER_TYPE_LABEL[holder.type]}${holder.code ? ` · ${holder.code}` : ""}${
          holder.supervisorName ? ` · ${holder.supervisorName}` : ""
        } · ${fmtDate(from)} to ${fmtDate(to)}`}
      />

      <nav className="stmt-months no-print" aria-label="Which month">
        <LinkBtn href={`${base}?month=${shiftMonth(month, -1)}`} variant="secondary" size="sm">
          ← {monthLabel(shiftMonth(month, -1))}
        </LinkBtn>
        <strong>{monthLabel(month)}</strong>
        {month < thisMonth ? (
          <LinkBtn href={`${base}?month=${shiftMonth(month, 1)}`} variant="secondary" size="sm">
            {monthLabel(shiftMonth(month, 1))} →
          </LinkBtn>
        ) : (
          <span />
        )}
      </nav>

      <ReportActionBar
        exportHref={`/api/stock/export?report=statement&type=${holder.type}&id=${holder.id}&month=${month}`}
        rowCount={s.days.length}
      />

      <SummaryStrip
        items={[
          { label: "Brought forward", value: fmtMoney(s.broughtForward) },
          { label: "Given", value: fmtMoney(s.totals.given) },
          { label: "Returned", value: `−${fmtMoney(s.totals.returned)}` },
          { label: "Deposited", value: `−${fmtMoney(deposited)}` },
          {
            label: "Carried forward",
            value: fmtMoney(Math.abs(s.carriedForward)),
            tone: dueTone(s.carriedForward) === "owing" ? "brand" : undefined,
          },
        ]}
      />

      {scope.canWrite ? (
        <div className="kit-mb-20 no-print">
          <SupportOfferMessage
            text={statementMessage(s, { name: holder.name, code: holder.code })}
            title="Statement message"
            collapsed
            whatsappTo={phone}
          />
        </div>
      ) : null}

      <SectionHead
        title="Day by day"
        sub="Sold is shown for the record — only returns and money deposited reduce the due."
      />
      {s.days.length ? (
        <div className="kit-table-wrap kit-mb-20">
          <table className="kit-report-table stmt-table" role="table">
            <thead>
              <tr role="row">
                <th role="columnheader" scope="col">
                  Date
                </th>
                <th role="columnheader" scope="col" className="is-right">
                  Given
                </th>
                <th role="columnheader" scope="col" className="is-right">
                  Returned
                </th>
                <th role="columnheader" scope="col" className="is-right">
                  Deposited
                </th>
                <th role="columnheader" scope="col" className="is-right">
                  Due after
                </th>
              </tr>
            </thead>
            <tbody>
              <tr role="row" className="stmt-bf">
                <td role="cell" data-label="Date">
                  Brought forward
                </td>
                <td role="cell" data-label="Given" className="is-right" />
                <td role="cell" data-label="Returned" className="is-right" />
                <td role="cell" data-label="Deposited" className="is-right" />
                <td role="cell" data-label="Due after" className="is-right">
                  {fmtMoney(s.broughtForward)}
                </td>
              </tr>
              {s.days.map((d) => (
                <tr role="row" key={d.date}>
                  <td role="cell" data-label="Date">
                    <strong>{fmtDate(d.date)}</strong>
                    {d.sold.length ? <span className="kit-cell-sub">Sold: {items(d.sold)}</span> : null}
                  </td>
                  <td role="cell" data-label="Given" className="is-right">
                    {d.givenValue ? fmtMoney(d.givenValue) : <span className="kit-cell-unset">—</span>}
                    {d.given.length ? <span className="kit-cell-sub">{items(d.given)}</span> : null}
                  </td>
                  <td role="cell" data-label="Returned" className="is-right">
                    {d.returnedValue ? `−${fmtMoney(d.returnedValue)}` : <span className="kit-cell-unset">—</span>}
                    {d.returned.length ? <span className="kit-cell-sub">{items(d.returned)}</span> : null}
                  </td>
                  <td role="cell" data-label="Deposited" className="is-right">
                    {d.cash + d.bank ? `−${fmtMoney(d.cash + d.bank)}` : <span className="kit-cell-unset">—</span>}
                    {d.cash && d.bank ? (
                      <span className="kit-cell-sub">
                        Cash {fmtMoney(d.cash)} · Bank {fmtMoney(d.bank)}
                      </span>
                    ) : d.bank ? (
                      <span className="kit-cell-sub">Bank{d.bankRef ? ` · ${d.bankRef}` : ""}</span>
                    ) : null}
                  </td>
                  <td role="cell" data-label="Due after" className="is-right">
                    <span className={`kit-due is-${dueTone(d.due)}`}>{fmtMoney(Math.abs(d.due))}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Card padded className="kit-mb-20">
          <EmptyState
            title={`Nothing recorded in ${monthLabel(month)}`}
            hint={`The due brought forward and carried forward are the same: ${fmtMoney(s.broughtForward)}.`}
            icon={<Icon name="calendar" />}
          />
        </Card>
      )}

      {s.products.length ? (
        <>
          <SectionHead title="By product" sub="How many of each, over the month." />
          <div className="kit-table-wrap kit-mb-20">
            <table className="kit-report-table" role="table">
              <thead>
                <tr role="row">
                  <th role="columnheader" scope="col">
                    Product
                  </th>
                  <th role="columnheader" scope="col" className="is-right">
                    Given
                  </th>
                  <th role="columnheader" scope="col" className="is-right">
                    Returned
                  </th>
                  <th role="columnheader" scope="col" className="is-right">
                    Sold
                  </th>
                </tr>
              </thead>
              <tbody>
                {s.products.map((p) => {
                  const f = (n: number) => (p.money ? fmtMoney(n) : n.toLocaleString("en-US"));
                  return (
                    <tr role="row" key={p.productId}>
                      <td role="cell" data-label="Product">
                        {p.name}
                      </td>
                      <td role="cell" data-label="Given" className="is-right">
                        {f(p.given)}
                      </td>
                      <td role="cell" data-label="Returned" className="is-right">
                        {f(p.returned)}
                      </td>
                      <td role="cell" data-label="Sold" className="is-right">
                        {f(p.sold)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <Card className="kit-card-p stmt-close">
        <dl className="kit-daysum">
          <div className="is-total">
            <dt>Carried forward on {fmtDate(to)}</dt>
            <dd className={`kit-due is-${dueTone(s.carriedForward)}`}>
              {fmtMoney(Math.abs(s.carriedForward))} <DueBadge due={s.carriedForward} />
            </dd>
          </div>
        </dl>
        {/* On paper: the two signatures a hand-over needs. */}
        <div className="stmt-sign" aria-hidden="true">
          <span>Received by</span>
          <span>For the distributor</span>
        </div>
      </Card>
    </main>
  );
}

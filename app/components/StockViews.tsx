/**
 * The read-only stock screens: a list of holders, and one holder's position.
 *
 * Server components — nothing here needs state, and keeping them off the
 * client means the due arithmetic ships once, in the entry island, rather than
 * in every page that shows a number.
 *
 * One rule runs through all of it: **a due is per person and is never summed
 * across people into a figure presented as somebody's.** The landing page adds
 * up outstanding money because "the company is owed X in total" is a real
 * question with a real answer; a supervisor's team page does not, because
 * "this team owes X" is not a thing anybody can collect.
 */

import { AppLink as Link } from "./AppLink";
import { fmtMoney, fmtNumber } from "../../lib/format";
import { DUE_TONE_LABEL, HOLDER_TYPE_LABEL, dueTone, isMoneyProduct, type StockLine } from "../../lib/stock";
import type { HolderDue } from "../../lib/stock-data";
import { Badge, EmptyState } from "./Kit";
import { Icon } from "./icons";

/** Due is risk money, coloured the same way everywhere. */
export function DueCell({ due }: { due: number }) {
  const tone = dueTone(due);
  if (tone === "clear") return <span className="kit-cell-unset">Settled</span>;
  return (
    <span className={`kit-due is-${tone}`}>
      {fmtMoney(Math.abs(due))}
      {tone === "over" && <span className="kit-cell-sub">{DUE_TONE_LABEL.over}</span>}
    </span>
  );
}

export function StockHolderTable({ rows }: { rows: HolderDue[] }) {
  const sorted = [...rows].sort((a, b) => b.due - a.due || a.name.localeCompare(b.name));
  return (
    <div className="kit-table-wrap">
      <table className="kit-report-table" role="table">
        <thead>
          <tr role="row">
            <th role="columnheader" scope="col">
              Person
            </th>
            <th role="columnheader" scope="col">
              Role
            </th>
            <th role="columnheader" scope="col" className="is-right">
              Given
            </th>
            <th role="columnheader" scope="col" className="is-right">
              Deposited
            </th>
            <th role="columnheader" scope="col" className="is-right">
              iTopup out
            </th>
            <th role="columnheader" scope="col" className="is-right">
              Due
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr role="row" key={`${r.type}:${r.id}`}>
              <td role="cell" data-label="Person">
                <Link className="kit-tablelink" href={`/stock/${r.type}/${r.id}`}>
                  {r.name}
                </Link>
                {r.code && <span className="kit-cell-sub">{r.code}</span>}
              </td>
              <td role="cell" data-label="Role">
                {HOLDER_TYPE_LABEL[r.type]}
                {r.supervisorName && <span className="kit-cell-sub">{r.supervisorName}</span>}
              </td>
              <td role="cell" data-label="Given" className="is-right">
                {fmtMoney(r.givenValue)}
              </td>
              <td role="cell" data-label="Deposited" className="is-right">
                {fmtMoney(r.deposited)}
              </td>
              <td role="cell" data-label="iTopup out" className="is-right">
                {r.topupInHand ? fmtMoney(r.topupInHand) : <span className="kit-cell-unset">—</span>}
              </td>
              <td role="cell" data-label="Due" className="is-right">
                <DueCell due={r.due} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * What one holder is carrying, product by product.
 *
 * A version of a product that was superseded still appears on its own line
 * while any of it is in hand — the spec is explicit that an old-price card and
 * a new-price card are different products and must not be merged, and that is
 * why the price sits in the row rather than in a heading over several.
 */
export function StockLineTable({ lines }: { lines: StockLine[] }) {
  const held = lines.filter((l) => l.opening || l.given || l.sold || l.returned);
  if (!held.length)
    return (
      <EmptyState
        title="Nothing has moved yet"
        hint="No stock has been handed to this person."
        icon={<Icon name="shop" />}
      />
    );

  return (
    <div className="kit-table-wrap">
      <table className="kit-report-table" role="table">
        <thead>
          <tr role="row">
            <th role="columnheader" scope="col">
              Product
            </th>
            <th role="columnheader" scope="col" className="is-right">
              Carried at
            </th>
            <th role="columnheader" scope="col" className="is-right">
              Given
            </th>
            <th role="columnheader" scope="col" className="is-right">
              Sold
            </th>
            <th role="columnheader" scope="col" className="is-right">
              Returned
            </th>
            <th role="columnheader" scope="col" className="is-right">
              In hand
            </th>
            <th role="columnheader" scope="col" className="is-right">
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {held.map((l) => {
            const money = isMoneyProduct(l.product.category);
            const qty = (n: number) => (money ? fmtMoney(n) : fmtNumber(n));
            return (
              <tr role="row" key={l.product.id}>
                <td role="cell" data-label="Product">
                  <strong>{l.product.subType}</strong>
                  {l.opening > 0 && <span className="kit-cell-sub">opening {qty(l.opening)}</span>}
                </td>
                {/*
                 * What this holder is CARRYING it at — what came in minus what
                 * went out, each at its own price. Not today's catalogue price:
                 * that is the one number a price change could still have moved.
                 */}
                <td role="cell" data-label="Carried at" className="is-right">
                  {l.carryPrice > 0 ? fmtMoney(l.carryPrice) : <span className="kit-cell-unset">—</span>}
                </td>
                <td role="cell" data-label="Given" className="is-right">
                  {qty(l.given)}
                </td>
                <td role="cell" data-label="Sold" className="is-right">
                  {qty(l.sold)}
                </td>
                <td role="cell" data-label="Returned" className="is-right">
                  {qty(l.returned)}
                </td>
                {/*
                 * A negative balance means more was sold than was ever given —
                 * a data error somebody has to fix. It is shown in red rather
                 * than clamped to zero, because clamping would leave the error
                 * in the database and take the only sign of it off the screen.
                 */}
                <td role="cell" data-label="In hand" className="is-right">
                  {l.inHand < 0 ? <span className="kit-due is-owing">{qty(l.inHand)}</span> : qty(l.inHand)}
                </td>
                <td role="cell" data-label="Value" className="is-right">
                  {fmtMoney(l.inHandValue)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function StockHistoryTable({
  rows,
}: {
  rows: { date: string; given: number; sold: number; returned: number; cash: number; bank: number }[];
}) {
  if (!rows.length)
    return (
      <EmptyState
        title="No days recorded"
        hint="Nothing has been entered for this person yet."
        icon={<Icon name="file" />}
      />
    );
  return (
    <div className="kit-table-wrap">
      <table className="kit-report-table" role="table">
        <thead>
          <tr role="row">
            <th role="columnheader" scope="col">
              Date
            </th>
            <th role="columnheader" scope="col" className="is-right">
              Given
            </th>
            <th role="columnheader" scope="col" className="is-right">
              Sold
            </th>
            <th role="columnheader" scope="col" className="is-right">
              Returned
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
          {rows.map((r) => (
            <tr role="row" key={r.date}>
              <td role="cell" data-label="Date">
                {r.date}
              </td>
              <td role="cell" data-label="Given" className="is-right">
                {fmtMoney(r.given)}
              </td>
              <td role="cell" data-label="Sold" className="is-right">
                {fmtMoney(r.sold)}
              </td>
              <td role="cell" data-label="Returned" className="is-right">
                {fmtMoney(r.returned)}
              </td>
              <td role="cell" data-label="Cash" className="is-right">
                {fmtMoney(r.cash)}
              </td>
              <td role="cell" data-label="Bank" className="is-right">
                {fmtMoney(r.bank)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DueBadge({ due }: { due: number }) {
  const tone = dueTone(due);
  return (
    <Badge tone={tone === "owing" ? "behind" : tone === "over" ? "pending" : "neutral"}>{DUE_TONE_LABEL[tone]}</Badge>
  );
}

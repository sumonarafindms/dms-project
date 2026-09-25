"use client";

/**
 * Recording what we bought, and what it left in the godown.
 *
 * The screen keeps two things visibly apart, because they are two questions
 * and answering them as one is how a stock figure starts lying:
 *
 *   - The margin is for the PERIOD chosen.
 *   - The godown is ALL TIME, always. "What is in the godown between the 1st
 *     and the 14th" has no answer, so the table says "now" on it.
 */

import { useState } from "react";
import { closedMessage, isClosedDate, monthOfYmd } from "@/lib/month-close-rules";
import { useRouter } from "next/navigation";
import { Badge, Btn, Card, EmptyState, Field, NumberInput, SectionHead } from "./Kit";
import { Picker } from "./Picker";
import { Icon } from "./icons";
import { apiSend } from "@/lib/api-client";
import { fmtMoney, fmtNumber } from "@/lib/format";
import { isMoneyProduct, type ProductRow, kindLabel } from "@/lib/stock";
import { LIFTING_KIND_LABEL, type HouseLine, type LiftingKind } from "@/lib/lifting";
import type { LiftingEntry } from "@/lib/lifting-data";
import { useConfirm, useToast } from "./Feedback";

export function LiftingEntryForm({
  products,
  today,
  suggested,
  closed = [],
}: {
  products: ProductRow[];
  today: string;
  /** v206: closed months — a date in one cannot be saved. */
  closed?: readonly string[];
  /** The last cost paid for each product, so a repeat purchase is one tap. */
  suggested: Record<string, number>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState({
    date: today,
    productId: products[0]?.id || "",
    kind: "PURCHASE" as LiftingKind,
    qty: "",
    unitCost: "",
    invoiceRef: "",
    note: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);

  const product = products.find((p) => p.id === form.productId);
  const qty = Number(form.qty) || 0;
  const cost = Number(form.unitCost) || 0;

  async function save() {
    setBusy(true);
    setMessage("");
    const r = await apiSend("/api/stock/lifting", "POST", form);
    setBusy(false);
    setOk(r.ok);
    // v205: success is a toast; a refusal stays by the form.
    setMessage(r.ok ? "" : r.message);
    if (r.ok) {
      toast("Lifting recorded");
      setForm({ ...form, qty: "", unitCost: "", invoiceRef: "", note: "" });
      router.refresh();
    }
  }

  if (!products.length)
    return (
      <EmptyState
        title="No products yet"
        hint="Add products before recording what you bought."
        icon={<Icon name="shop" />}
      />
    );

  return (
    <Card className="kit-card-p kit-mb-20">
      <SectionHead
        title="Record a lifting"
        sub="What the company charged us. Recharge balance is a product too — price it at 1 and enter the amount as the quantity."
      />
      <div className="kit-form-grid">
        <Field label="Date">
          <input
            className="kit-input"
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
        </Field>
        <Field label="Product">
          <Picker
            name="productId"
            // v201: the kind under each name, so "Smart watch" and a same-named SIM are told apart.
            options={products.map((p) => ({ id: p.id, label: p.subType, meta: kindLabel(p) }))}
            value={form.productId}
            onChange={(id) =>
              setForm({ ...form, productId: id, unitCost: suggested[id] ? String(suggested[id]) : form.unitCost })
            }
            placeholder="Type a product name"
          />
        </Field>
        <Field label={product && isMoneyProduct(product.category) ? "Amount (Taka)" : "Quantity"}>
          <NumberInput min="1" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
        </Field>
        <Field label="Our cost per unit" hint="What the company charged">
          <NumberInput
            min="0"
            step="0.01"
            value={form.unitCost}
            onChange={(e) => setForm({ ...form, unitCost: e.target.value })}
          />
        </Field>
        <Field label="Invoice / memo">
          <input
            className="kit-input"
            value={form.invoiceRef}
            onChange={(e) => setForm({ ...form, invoiceRef: e.target.value })}
          />
        </Field>
        <Field label="Kind" hint="Opening = what was already in the godown">
          <select
            className="kit-input"
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value as LiftingKind })}
          >
            <option value="PURCHASE">Bought from the company</option>
            <option value="OPENING">Opening godown stock</option>
          </select>
        </Field>
      </div>

      {qty > 0 && cost > 0 && (
        <dl className="kit-daysum">
          <div className="is-total">
            <dt>This lifting costs us</dt>
            <dd>{fmtMoney(qty * cost)}</dd>
          </div>
        </dl>
      )}

      {message && <p className={ok ? "kit-note is-ok" : "kit-note is-bad"}>{message}</p>}
      {isClosedDate(closed, form.date) && (
        <p className="kit-note is-bad">
          <Icon name="alert" /> {closedMessage(monthOfYmd(form.date))}
        </p>
      )}
      <Btn
        onClick={save}
        disabled={busy || !form.productId || !form.qty || !form.unitCost || isClosedDate(closed, form.date)}
      >
        {busy ? "Saving…" : "Record lifting"}
      </Btn>
    </Card>
  );
}

export function LiftingList({
  rows,
  canWrite,
  closed = [],
}: {
  rows: LiftingEntry[];
  canWrite: boolean;
  /** v206: a row in a closed month shows "Closed" where Remove would be. */
  closed?: readonly string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  /*
   * v199: only Accounts writes, so only Accounts sees Remove — Admin and IT
   * were shown a button the server refused, and the refusal was swallowed.
   * A failure is now said out loud.
   */
  async function remove(id: string) {
    // v205: a lifting moves the godown and the profit — it is asked about first.
    const row = rows.find((x) => x.id === id);
    if (
      !(await confirm({
        title: "Remove this lifting?",
        body: row
          ? `${row.productName} × ${row.qty.toLocaleString("en-US")} on ${row.date}. The godown and profit change with it.`
          : undefined,
        confirmLabel: "Remove",
        danger: true,
      }))
    )
      return;
    setBusy(id);
    setError("");
    const r = await apiSend("/api/stock/lifting", "DELETE", { id });
    setBusy(null);
    if (!r.ok) return setError(r.message);
    toast("Lifting removed");
    router.refresh();
  }

  if (!rows.length)
    return (
      <EmptyState
        title="Nothing lifted yet"
        hint="Record what the company sent and the godown will fill in."
        icon={<Icon name="upload" />}
      />
    );

  return (
    <div className="kit-table-wrap">
      {error && <p className="kit-note is-bad">{error}</p>}
      <table className="kit-report-table" role="table">
        <thead>
          <tr role="row">
            <th role="columnheader" scope="col">
              Date
            </th>
            <th role="columnheader" scope="col">
              Product
            </th>
            <th role="columnheader" scope="col" className="is-right">
              Qty
            </th>
            <th role="columnheader" scope="col" className="is-right">
              Our cost
            </th>
            <th role="columnheader" scope="col" className="is-right">
              Value
            </th>
            {canWrite && (
              <th role="columnheader" scope="col" className="is-right">
                Action
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr role="row" key={r.id}>
              <td role="cell" data-label="Date">
                {r.date}
                {r.kind === "OPENING" && <span className="kit-cell-sub">{LIFTING_KIND_LABEL.OPENING}</span>}
              </td>
              <td role="cell" data-label="Product">
                <strong>{r.productName}</strong>
                {r.invoiceRef && <span className="kit-cell-sub">{r.invoiceRef}</span>}
              </td>
              <td role="cell" data-label="Qty" className="is-right">
                {fmtNumber(r.qty)}
              </td>
              <td role="cell" data-label="Our cost" className="is-right">
                {fmtMoney(r.unitCost)}
              </td>
              <td role="cell" data-label="Value" className="is-right">
                {fmtMoney(r.value)}
              </td>
              {canWrite && (
                <td role="cell" data-label="Action" className="is-right">
                  {isClosedDate(closed, r.date) ? (
                    <Badge tone="neutral">Month closed</Badge>
                  ) : (
                    <Btn size="sm" variant="ghost" disabled={busy === r.id} onClick={() => remove(r.id)}>
                      Remove
                    </Btn>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * What is in the godown.
 *
 * All-time by definition. A negative figure means more went out than was ever
 * recorded coming in — usually a lifting nobody entered — and it is shown in
 * red rather than clamped, for the reason a negative stock line always is:
 * clamping leaves the error in the database and takes the only sign of it off
 * the screen.
 */
export function GodownTable({ lines }: { lines: HouseLine[] }) {
  const held = lines.filter((l) => l.liftedQty || l.withPeopleQty || l.inGodown);
  if (!held.length)
    return (
      <EmptyState
        title="Nothing to show yet"
        hint="Record a lifting and this fills in."
        icon={<Icon name="balance" />}
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
              Lifted
            </th>
            <th role="columnheader" scope="col" className="is-right">
              Out with people
            </th>
            <th role="columnheader" scope="col" className="is-right">
              In godown
            </th>
            <th role="columnheader" scope="col" className="is-right">
              Avg cost
            </th>
            <th role="columnheader" scope="col" className="is-right">
              Godown value
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
                </td>
                <td role="cell" data-label="Lifted" className="is-right">
                  {qty(l.liftedQty)}
                </td>
                <td role="cell" data-label="Out with people" className="is-right">
                  {qty(l.withPeopleQty)}
                </td>
                <td role="cell" data-label="In godown" className="is-right">
                  {l.inGodown < 0 ? <span className="kit-due is-owing">{qty(l.inGodown)}</span> : qty(l.inGodown)}
                </td>
                <td role="cell" data-label="Avg cost" className="is-right">
                  {l.avgCost > 0 ? fmtMoney(l.avgCost) : <span className="kit-cell-unset">—</span>}
                </td>
                {/* v195: a product with no lifting cost has no value to print — never ৳0. */}
                <td role="cell" data-label="Godown value" className="is-right">
                  {l.hasCost ? fmtMoney(l.godownValue) : <span className="kit-cell-unset">no cost yet</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

"use client";

/**
 * Where one person stood on the day the ledger starts.
 *
 * The owner is not importing history — *"Excel theke na... jamon ajke projonto
 * tar koto stock ace.. koto due ace"* — so each person gets one opening
 * position and everything runs forward from it.
 *
 * ## The one number that is easy to get wrong
 *
 * `openingDue` is the WHOLE outstanding amount, **including the value of the
 * stock typed in the same form**. That follows from the owner's own
 * arithmetic: took ৳100,000, deposited ৳80,000, "due ৳20,000" — and the
 * ৳20,000 of goods is still in his hands.
 *
 * Asking somebody to remember that would guarantee it goes wrong, so the field
 * is prefilled from the stock rows as they are typed and the screen names what
 * it is doing. An operator who has extra cash owed on top adds it; an operator
 * who does not, does nothing.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Card, EmptyState, Field, NumberInput, SectionHead } from "./Kit";
import { Picker, type PickerOption } from "./Picker";
import { Icon } from "./icons";
import { apiSend } from "@/lib/api-client";
import { fmtMoney } from "@/lib/format";
import { isMoneyProduct, kindLabel, lineValue, paisa, type ProductRow } from "@/lib/stock";
import { useToast } from "./Feedback";

/** A product with the price in force on the opening date. Null: none yet. */
export type OpeningProduct = ProductRow & { price: number | null };

export function StockOpeningForm({
  holders,
  holderKey,
  products,
  today,
  initial,
  basePath,
}: {
  holders: PickerOption[];
  holderKey: string;
  products: OpeningProduct[];
  today: string;
  initial: { asOfDate: string; openingDue: number; lines: Record<string, number>; exists: boolean };
  basePath: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const asOfDate = initial.asOfDate || today;
  const [qty, setQty] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(initial.lines).map(([k, v]) => [k, String(v)])),
  );
  const [extra, setExtra] = useState(String(initial.openingDue || ""));
  const [useStockValue, setUseStockValue] = useState(!initial.exists);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);

  const num = (v: string | undefined) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const stockValue = useMemo(
    () => paisa(products.reduce((s, p) => s + lineValue(num(qty[p.id]), p.price ?? 0), 0)),
    [products, qty],
  );

  /*
   * Two ways to arrive at the same number, and the screen shows which one is
   * live. Prefilling is the common case; typing the total outright is for the
   * office that already has the figure on a sheet of paper.
   */
  const openingDue = useStockValue ? paisa(stockValue + num(extra)) : num(extra);

  function go(next: string, date = asOfDate) {
    router.push(`${basePath}?holder=${encodeURIComponent(next)}&as=${date}`);
  }

  async function save() {
    setBusy(true);
    setMessage("");
    const [type, ...rest] = holderKey.split(":");
    const r = await apiSend("/api/stock/opening", "POST", {
      holderType: type,
      holderId: rest.join(":"),
      asOfDate,
      openingDue,
      lines: products.map((p) => ({ productId: p.id, qty: num(qty[p.id]) })),
    });
    setBusy(false);
    setOk(r.ok);
    setMessage(r.ok ? "" : r.message);
    if (r.ok) {
      toast("Opening position saved");
      router.refresh();
    }
  }

  return (
    <>
      <Card className="kit-card-p kit-mb-20">
        <div className="kit-form-grid">
          <Field label="Person">
            <Picker
              name="holder"
              options={holders}
              value={holderKey}
              onChange={(id) => id && go(id)}
              placeholder="Type a name, code or phone"
            />
          </Field>
          <Field label="As of" hint="The day the ledger starts — prices below are as at this date">
            <input
              className="kit-input"
              type="date"
              value={asOfDate}
              onChange={(e) => e.target.value && go(holderKey, e.target.value)}
            />
          </Field>
        </div>
        {initial.exists && (
          <p className="kit-note">
            <Icon name="info" /> This person already has an opening position. Saving replaces it — it is a statement of
            where they stood, not a list to add to.
          </p>
        )}
      </Card>

      {!products.length ? (
        <EmptyState
          title="No products yet"
          hint="Add products first — opening stock is counted in them."
          icon={<Icon name="shop" />}
        />
      ) : (
        <Card className="kit-card-p kit-mb-20">
          <SectionHead title="Stock already in hand" sub="What this person is holding on the day above." />
          <div className="kit-table-wrap">
            <table className="kit-report-table" role="table">
              <thead>
                <tr role="row">
                  <th role="columnheader" scope="col">
                    Product
                  </th>
                  <th role="columnheader" scope="col" className="is-right">
                    Price
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
                {products.map((p) => (
                  <tr role="row" key={p.id}>
                    <td role="cell" data-label="Product">
                      <strong>{p.subType}</strong>
                      <span className="kit-cell-sub">{kindLabel(p)}</span>
                    </td>
                    <td role="cell" data-label="Price" className="is-right">
                      {fmtMoney(p.price)}
                    </td>
                    <td role="cell" data-label="In hand" className="is-right">
                      <NumberInput
                        min="0"
                        className="kit-input kit-input-qty"
                        aria-label={`In hand — ${p.subType}`}
                        value={qty[p.id] ?? ""}
                        onChange={(e) => setQty({ ...qty, [p.id]: e.target.value })}
                      />
                      {isMoneyProduct(p.category) && <span className="kit-cell-sub">Taka</span>}
                    </td>
                    <td role="cell" data-label="Value" className="is-right">
                      {fmtMoney(lineValue(num(qty[p.id]), p.price ?? 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="kit-card-p kit-mb-20">
        <SectionHead
          title="Opening due"
          sub="The whole amount outstanding, including the stock above — that stock has not been paid for yet."
        />
        <div className="kit-form-grid">
          <Field label="How to set it">
            <select
              className="kit-input"
              value={useStockValue ? "build" : "type"}
              onChange={(e) => {
                /*
                 * v199: switching how the total is built keeps the TOTAL. A
                 * saved opening opens as "type the total", and switching to
                 * "stock plus extra" used to add the stock on top of a figure
                 * that already contained it — ৳20,000 became ৳40,000.
                 */
                const build = e.target.value === "build";
                if (build === useStockValue) return;
                /*
                 * v200: a total BELOW the stock's value cannot be written as
                 * "stock plus extra" without changing it (the extra would have
                 * to be negative). Refused with a word, rather than silently
                 * raising ৳15,000 to the ৳20,000 of stock.
                 */
                if (build && openingDue < stockValue) {
                  setOk(false);
                  setMessage(
                    `The total (${fmtMoney(openingDue)}) is less than the stock above (${fmtMoney(stockValue)}) — keep typing the total.`,
                  );
                  return;
                }
                setMessage("");
                setExtra(String(build ? paisa(openingDue - stockValue) || "" : openingDue || ""));
                setUseStockValue(build);
              }}
            >
              <option value="build">Stock value above, plus any extra owed</option>
              <option value="type">Type the total outright</option>
            </select>
          </Field>
          <Field label={useStockValue ? "Extra cash owed on top" : "Total outstanding"}>
            <NumberInput min="0" step="0.01" value={extra} onChange={(e) => setExtra(e.target.value)} />
          </Field>
        </div>
        <dl className="kit-daysum">
          <div>
            <dt>Stock value</dt>
            <dd>{fmtMoney(stockValue)}</dd>
          </div>
          <div className="is-total">
            <dt>Opening due</dt>
            <dd className="kit-due is-owing">{fmtMoney(openingDue)}</dd>
          </div>
        </dl>
      </Card>

      {message && <p className={ok ? "kit-note is-ok" : "kit-note is-bad"}>{message}</p>}
      <Btn onClick={save} disabled={busy} block>
        {busy ? "Saving…" : "Save opening position"}
      </Btn>
    </>
  );
}

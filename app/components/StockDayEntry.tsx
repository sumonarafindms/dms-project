"use client";

/**
 * One holder, one day, four tabs, one save.
 *
 * The spec suggested four separate screens and combining them "later". They
 * are one screen from the start, for two reasons that are not style:
 *
 *   1. Four screens each ask for the same Date and the same person. That is
 *      four times the typing, on a phone, for one visit.
 *   2. The bottom bar holds five cells (v187, lib/bottom-nav.ts). Four entry
 *      routes would push everything a person actually navigates to into the
 *      More sheet.
 *
 * The tabs are Give, Sell, Return and Collect — the real sequence of a day,
 * with Return present because the owner's business has it and the spec did
 * not: *"chaile she baki 10000 taka and 5ta sim accounts ke farot diye dite
 * pare"*.
 *
 * ## The running total under the form
 *
 * The figure that decides whether the day was entered correctly is the due
 * AFTER saving, and an operator should not have to save to find out. So this
 * recomputes it live from exactly the arithmetic in lib/stock.ts — never a
 * second formula written out again here, which is how two numbers on one
 * screen start to disagree.
 *
 * `dueBefore` is the holder's due with THIS DAY REMOVED, computed on the
 * server. Subtracting the saved day there rather than here means re-opening a
 * day already entered shows the same number as leaving it alone, instead of
 * counting it twice.
 *
 * ## Prices on this screen
 *
 * Give and Sell show the price in force **on the date being entered**, sent by
 * the server with the day. Correcting a day from before a price change must
 * use the price that applied then; v193 exists because v192 would have used
 * today's.
 *
 * Return is different and has its own editable price column. The owner's
 * ruling is *"je dame nice sei dame"* — stock handed back clears at what it
 * was lifted at. The default is what the holder is actually carrying that
 * product at (`carryPrice`), and it is shown rather than applied silently,
 * because a default nobody can see is how a wrong number survives.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Btn, Card, EmptyState, Field, NumberInput, SectionHead, type BadgeTone } from "./Kit";
import { Picker, type PickerOption } from "./Picker";
import { Icon } from "./icons";
import { apiSend } from "@/lib/api-client";
import { dayReceipt } from "@/lib/receipt";
import { SupportOfferMessage } from "./SupportOfferMessage";
import { fmtMoney } from "@/lib/format";
import {
  DUE_TONE_LABEL,
  MOVE_KIND_LABEL,
  kindLabel,
  dueOf,
  dueTone,
  isMoneyProduct,
  lineValue,
  paisa,
  type DueTone,
  type MoveKind,
  type ProductRow,
} from "@/lib/stock";

type EntryTab = "GIVEN" | "SOLD" | "RETURNED" | "COLLECT";

/*
 * Due is risk money and wears the same colour wherever it appears — the
 * owner's ruling. "behind" is the palette's red; a settled account is neutral
 * rather than green, because owing nothing is normal, not an achievement.
 */
const DUE_BADGE_TONE: Record<DueTone, BadgeTone> = {
  owing: "behind",
  over: "pending",
  clear: "neutral",
};

const TABS: { key: EntryTab; label: string; hint: string }[] = [
  { key: "GIVEN", label: "Give", hint: "Stock handed out from company stock today." },
  { key: "SOLD", label: "Sell", hint: "What they reported selling. This does not reduce the due." },
  { key: "RETURNED", label: "Return", hint: "Unsold stock and unused balance handed back." },
  { key: "COLLECT", label: "Collect", hint: "Money deposited today. This is what reduces the due." },
];

/** A product with the price in force on the day being entered. Null: none yet. */
export type EntryProduct = ProductRow & { price: number | null; retired?: boolean };

export type StockDayEntryProps = {
  holders: PickerOption[];
  holderKey: string;
  date: string;
  products: EntryProduct[];
  initial: {
    given: Record<string, number>;
    sold: Record<string, number>;
    returned: Record<string, number>;
    returnPrice: Record<string, number>;
    /** v199: the price each saved GIVEN / SOLD line keeps on a re-save. */
    givenPrice: Record<string, number>;
    soldPrice: Record<string, number>;
    cash: number;
    bank: number;
    bankRef: string;
    notes: string;
  };
  /** The holder's due with this day taken out of it. */
  dueBefore: number;
  /**
   * What this holder is carrying each product at, ignoring this day — the
   * default a return credits at. Keyed by product id.
   */
  carryPrice: Record<string, number>;
  /**
   * What the godown holds before this person's entry for this day, by product.
   * Absent for a product that has never been lifted — no figure, no warning.
   */
  godown: Record<string, number>;
  basePath: string;
  /** v203: who this day is for, for the WhatsApp receipt. */
  person?: { name: string; code: string | null; phone: string | null };
};

type Qty = Record<string, string>;

const toQty = (saved: Record<string, number>): Qty =>
  Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, String(v)]));

const num = (v: string | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function StockDayEntry({
  holders,
  holderKey,
  date,
  products,
  initial,
  dueBefore,
  carryPrice,
  godown,
  basePath,
  person,
}: StockDayEntryProps) {
  const router = useRouter();
  const [tab, setTab] = useState<EntryTab>("GIVEN");
  const [given, setGiven] = useState<Qty>(toQty(initial.given));
  const [sold, setSold] = useState<Qty>(toQty(initial.sold));
  const [returned, setReturned] = useState<Qty>(toQty(initial.returned));
  /*
   * The price each return credits at. Seeded from what was SAVED for this day
   * where a line already exists, so re-opening an untouched day and saving it
   * again cannot quietly reprice it; otherwise from what the holder is
   * carrying.
   */
  const [retPrice, setRetPrice] = useState<Qty>(
    Object.fromEntries(
      products.map((p) => [p.id, String(initial.returnPrice[p.id] ?? carryPrice[p.id] ?? p.price ?? "")]),
    ),
  );
  const [cash, setCash] = useState(String(initial.cash || ""));
  const [bank, setBank] = useState(String(initial.bank || ""));
  const [bankRef, setBankRef] = useState(initial.bankRef);
  const [notes, setNotes] = useState(initial.notes);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);

  const table: Record<Exclude<EntryTab, "COLLECT">, [Qty, (q: Qty) => void]> = {
    GIVEN: [given, setGiven],
    SOLD: [sold, setSold],
    RETURNED: [returned, setReturned],
  };

  const totals = useMemo(() => {
    let givenValue = 0;
    let soldValue = 0;
    let returnedValue = 0;
    for (const p of products) {
      // A product with no price on this date contributes nothing and the row
      // says why; the save refuses it rather than recording a free handout.
      const day = p.price ?? 0;
      // A line already saved keeps the price it was saved at — the server does
      // the same (v199), so this running due is the one that will be stored.
      givenValue += lineValue(num(given[p.id]), initial.givenPrice[p.id] ?? day);
      soldValue += lineValue(num(sold[p.id]), initial.soldPrice[p.id] ?? day);
      returnedValue += lineValue(num(returned[p.id]), num(retPrice[p.id]) || day);
    }
    return {
      givenValue: paisa(givenValue),
      soldValue: paisa(soldValue),
      returnedValue: paisa(returnedValue),
    };
  }, [products, given, sold, returned, retPrice, initial.givenPrice, initial.soldPrice]);

  /**
   * What each product will leave in the godown after this entry: what was
   * there, less what is being given, plus what is being handed back.
   */
  const leftInGodown = (id: string) => (id in godown ? godown[id] - num(given[id]) + num(returned[id]) : null);
  /* Given beyond what the godown holds. A warning, never a block: the lifting
     that covers it may simply not have been entered yet. */
  const overGodown = products.filter((p) => {
    const left = leftInGodown(p.id);
    return left !== null && left < 0 && num(given[p.id]) > 0;
  });

  /** Products typed into today that have no price for this date (and no saved line to keep one). */
  const unpriced = products.filter(
    (p) =>
      p.price === null &&
      ((num(given[p.id]) && initial.givenPrice[p.id] === undefined) ||
        (num(sold[p.id]) && initial.soldPrice[p.id] === undefined) ||
        num(returned[p.id])),
  );

  /*
   * v199: quantities are whole units. The server refuses anything else, so
   * the screen says so first instead of valuing 2.5 in the running due.
   */
  const fractional = products.filter((p) =>
    [given[p.id], sold[p.id], returned[p.id]].some((v) => v !== undefined && v !== "" && !Number.isInteger(Number(v))),
  );

  const after = dueOf({
    openingDue: dueBefore,
    givenValue: totals.givenValue,
    returnedValue: totals.returnedValue,
    cash: num(cash),
    bank: num(bank),
  });

  /*
   * v203 — the receipt. It is sent only for what is SAVED: while the form
   * differs from the saved day the button waits, so nobody is sent a figure
   * that is not in the books. "Saved" compares the typed figures with the
   * saved ones (the page re-reads the day after every save).
   */
  const unsaved =
    products.some((p) => {
      const r = num(returned[p.id]);
      return (
        num(given[p.id]) !== (initial.given[p.id] || 0) ||
        num(sold[p.id]) !== (initial.sold[p.id] || 0) ||
        r !== (initial.returned[p.id] || 0) ||
        (r > 0 && initial.returnPrice[p.id] !== undefined && num(retPrice[p.id]) !== initial.returnPrice[p.id])
      );
    }) ||
    num(cash) !== (initial.cash || 0) ||
    num(bank) !== (initial.bank || 0);
  const savedSomething =
    Object.values(initial.given).some(Boolean) ||
    Object.values(initial.sold).some(Boolean) ||
    Object.values(initial.returned).some(Boolean) ||
    initial.cash > 0 ||
    initial.bank > 0;
  const receipt = useMemo(() => {
    if (!person) return "";
    const rows = (qtys: Qty, price: (p: EntryProduct) => number) =>
      products.map((p) => ({
        name: p.subType,
        qty: num(qtys[p.id]),
        value: lineValue(num(qtys[p.id]), price(p)),
        money: isMoneyProduct(p.category),
      }));
    return dayReceipt({
      name: person.name,
      code: person.code,
      dateYmd: date,
      given: rows(given, (p) => initial.givenPrice[p.id] ?? p.price ?? 0),
      sold: rows(sold, (p) => initial.soldPrice[p.id] ?? p.price ?? 0),
      returned: rows(returned, (p) => num(retPrice[p.id]) || p.price || 0),
      cash: num(cash),
      bank: num(bank),
      bankRef,
      dueBefore,
      dueAfter: after.due,
    });
  }, [person, products, given, sold, returned, retPrice, cash, bank, bankRef, dueBefore, after.due, date, initial]);

  function setQty(kind: Exclude<EntryTab, "COLLECT">, productId: string, value: string) {
    const [current, set] = table[kind];
    set({ ...current, [productId]: value });
  }

  function go(nextHolder: string, nextDate: string) {
    router.push(`${basePath}?holder=${encodeURIComponent(nextHolder)}&date=${nextDate}`);
  }

  async function save() {
    setBusy(true);
    setMessage("");
    const [type, ...rest] = holderKey.split(":");
    const lines: { productId: string; kind: MoveKind; qty: number; unitPrice?: number }[] = [];
    for (const p of products) {
      // Every product is sent every time, including the zeros: a zero is how
      // a line that was entered yesterday and is wrong today gets removed.
      lines.push({ productId: p.id, kind: "GIVEN", qty: num(given[p.id]) });
      lines.push({ productId: p.id, kind: "SOLD", qty: num(sold[p.id]) });
      // The return carries its own price; the server prices the other two by
      // the date, so it cannot be told a different figure for those.
      lines.push({
        productId: p.id,
        kind: "RETURNED",
        qty: num(returned[p.id]),
        unitPrice: num(retPrice[p.id]) || undefined,
      });
    }
    const r = await apiSend("/api/stock/day", "POST", {
      holderType: type,
      holderId: rest.join(":"),
      date,
      lines,
      cash: num(cash),
      bank: num(bank),
      bankRef,
      notes,
    });
    setBusy(false);
    setOk(r.ok);
    setMessage(r.ok ? "Saved." : r.message);
    if (r.ok) router.refresh();
  }

  if (!products.length)
    return (
      <EmptyState
        title="No products yet"
        hint="Add what you hand out — SIMs, cards, routers, iTopup — on the Products page first."
        icon={<Icon name="shop" />}
      />
    );

  const tone = dueTone(after.due);

  return (
    <>
      <Card className="kit-card-p kit-mb-20">
        <div className="kit-form-grid">
          <Field label="Date">
            <input
              className="kit-input"
              type="date"
              value={date}
              onChange={(e) => e.target.value && go(holderKey, e.target.value)}
            />
          </Field>
          <Field label="Person" hint="Name, code or phone number">
            <Picker
              name="holder"
              options={holders}
              value={holderKey}
              onChange={(id) => id && go(id, date)}
              placeholder="Type a name, code or phone"
            />
          </Field>
        </div>
      </Card>

      <div className="kit-tabs kit-mb-16" role="tablist" aria-label="What to enter">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}

            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card className="kit-card-p kit-mb-20">
        <SectionHead
          title={TABS.find((t) => t.key === tab)!.label}
          sub={
            tab === "RETURNED"
              ? "Credited at what this person lifted it at, not today's price. Change a figure if the lot differs."
              : tab === "COLLECT"
                ? TABS.find((t) => t.key === tab)!.hint
                : `${TABS.find((t) => t.key === tab)!.hint} Priced as at ${date}.`
          }
        />

        {tab === "COLLECT" ? (
          <div className="kit-form-grid">
            <Field label="Cash deposited">
              <NumberInput min="0" step="0.01" value={cash} onChange={(e) => setCash(e.target.value)} />
            </Field>
            <Field label="Bank deposited">
              <NumberInput min="0" step="0.01" value={bank} onChange={(e) => setBank(e.target.value)} />
            </Field>
            <Field label="Bank reference" hint="Slip or transaction number">
              <input className="kit-input" value={bankRef} onChange={(e) => setBankRef(e.target.value)} />
            </Field>
            <Field label="Note" wide>
              <input className="kit-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        ) : (
          <div className="kit-table-wrap">
            <table className="kit-report-table" role="table">
              <thead>
                <tr role="row">
                  <th role="columnheader" scope="col">
                    Product
                  </th>
                  <th role="columnheader" scope="col" className="is-right">
                    {tab === "RETURNED" ? "Credit at" : "Price"}
                  </th>
                  <th role="columnheader" scope="col" className="is-right">
                    {MOVE_KIND_LABEL[tab as MoveKind]}
                  </th>
                  <th role="columnheader" scope="col" className="is-right">
                    Value
                  </th>
                  {(tab === "GIVEN" || tab === "RETURNED") && (
                    <th role="columnheader" scope="col" className="is-right">
                      Godown after
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const kind = tab as Exclude<EntryTab, "COLLECT">;
                  const qty = table[kind][0][p.id] ?? "";
                  const money = isMoneyProduct(p.category);
                  const isReturn = kind === "RETURNED";
                  const savedPrice =
                    kind === "GIVEN" ? initial.givenPrice[p.id] : kind === "SOLD" ? initial.soldPrice[p.id] : undefined;
                  const dayPrice = savedPrice ?? p.price;
                  const unit = isReturn ? num(retPrice[p.id]) || p.price || 0 : (dayPrice ?? 0);
                  const carrying = carryPrice[p.id] || 0;
                  /*
                   * The holder is carrying this product at a different price
                   * from today's. Worth saying on a RETURN row, because that
                   * is precisely when the two must not be confused.
                   */
                  const lots = isReturn && carrying > 0 && p.price !== null && carrying !== p.price;
                  return (
                    <tr role="row" key={p.id}>
                      <td role="cell" data-label="Product">
                        <strong>{p.subType}</strong>
                        <span className="kit-cell-sub">
                          {kindLabel(p)}
                          {p.retired ? " · retired" : ""}
                        </span>
                      </td>
                      <td role="cell" data-label={isReturn ? "Credit at" : "Price"} className="is-right">
                        {isReturn ? (
                          <>
                            <NumberInput
                              min="0"
                              step="0.01"
                              className="kit-input kit-input-qty"
                              aria-label={`Return price — ${p.subType}`}
                              value={retPrice[p.id] ?? ""}
                              onChange={(e) => setRetPrice({ ...retPrice, [p.id]: e.target.value })}
                            />
                            {lots && <span className="kit-cell-sub">carried at {fmtMoney(carrying)}</span>}
                          </>
                        ) : dayPrice === null ? (
                          <span className="kit-cell-unset">No price</span>
                        ) : (
                          <>
                            {fmtMoney(dayPrice)}
                            {savedPrice !== undefined && p.price !== null && savedPrice !== p.price && (
                              <span className="kit-cell-sub">saved at this price</span>
                            )}
                          </>
                        )}
                      </td>
                      <td role="cell" data-label={MOVE_KIND_LABEL[tab as MoveKind]} className="is-right">
                        <NumberInput
                          min="0"
                          step="1"
                          className="kit-input kit-input-qty"
                          aria-label={`${MOVE_KIND_LABEL[tab as MoveKind]} — ${p.subType}`}
                          value={qty}
                          onChange={(e) => setQty(kind, p.id, e.target.value)}
                        />
                        {money && <span className="kit-cell-sub">Taka</span>}
                      </td>
                      <td role="cell" data-label="Value" className="is-right">
                        {fmtMoney(lineValue(num(qty), unit))}
                      </td>
                      {(kind === "GIVEN" || kind === "RETURNED") && (
                        <td role="cell" data-label="Godown after" className="is-right">
                          {(() => {
                            const left = leftInGodown(p.id);
                            // Never lifted: no figure to check against, so no false "0 left".
                            if (left === null) return <span className="kit-cell-unset">—</span>;
                            const text = money ? fmtMoney(left) : `${left.toLocaleString("en-US")}`;
                            return left < 0 ? <span className="kit-due is-owing">{text}</span> : text;
                          })()}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/*
       * The day and the balance it lands on, side by side. "Sold" sits here
       * deliberately greyed out of the sum: it is the one figure an operator
       * expects to reduce the due and the only one that does not.
       */}
      <Card className="kit-card-p kit-mb-20">
        <SectionHead title="This day" sub="Sold is shown for the record. Only money and returns reduce the due." />
        <dl className="kit-daysum">
          <div>
            <dt>Given</dt>
            <dd>{fmtMoney(totals.givenValue)}</dd>
          </div>
          <div>
            <dt>Sold</dt>
            <dd className="is-muted">{fmtMoney(totals.soldValue)}</dd>
          </div>
          <div>
            <dt>Returned</dt>
            <dd>−{fmtMoney(totals.returnedValue)}</dd>
          </div>
          <div>
            <dt>Deposited</dt>
            <dd>−{fmtMoney(after.deposited)}</dd>
          </div>
          <div className="is-total">
            <dt>Due after saving</dt>
            <dd className={`kit-due is-${tone}`}>
              {fmtMoney(Math.abs(after.due))} <Badge tone={DUE_BADGE_TONE[tone]}>{DUE_TONE_LABEL[tone]}</Badge>
            </dd>
          </div>
        </dl>
      </Card>

      {overGodown.length > 0 && (
        <p className="kit-note is-bad">
          <Icon name="alert" /> More than the godown holds:{" "}
          {overGodown.map((p) => `${p.subType} (${(godown[p.id] ?? 0).toLocaleString("en-US")} in godown)`).join(", ")}.
          You can still save — but check whether a lifting is missing first.
        </p>
      )}
      {unpriced.length > 0 && (
        <p className="kit-note is-bad">
          <Icon name="alert" /> {unpriced.map((p) => p.subType).join(", ")} {unpriced.length === 1 ? "has" : "have"} no
          price on {date}. Set one on the Products page — a line with no price would record as free.
        </p>
      )}
      {message && <p className={ok ? "kit-note is-ok" : "kit-note is-bad"}>{message}</p>}
      {fractional.length > 0 && (
        <p className="kit-note is-bad">
          <Icon name="alert" /> {fractional.map((p) => p.subType).join(", ")}: quantities are whole units.
        </p>
      )}
      <Btn onClick={save} disabled={busy || unpriced.length > 0 || fractional.length > 0} block>
        {busy ? "Saving…" : "Save this day"}
      </Btn>

      {person && savedSomething ? (
        <Card className="kit-card-p kit-mt-20">
          <SectionHead
            title="Receipt"
            sub={
              unsaved
                ? "The figures above are not saved yet. Save first — the receipt only ever shows what is in the books."
                : person.phone
                  ? `Send ${person.name} what was saved for this day, on WhatsApp to ${person.phone}.`
                  : `No phone number on file for ${person.name} — WhatsApp will ask whom to send it to.`
            }
          />
          {unsaved ? null : <SupportOfferMessage text={receipt} title="Message" whatsappTo={person.phone} />}
        </Card>
      ) : null}
    </>
  );
}

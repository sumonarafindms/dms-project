"use client";

/**
 * The day's running costs.
 *
 * Deliberately the simplest screen in the module: this is the thing somebody
 * types twelve times a day between other jobs, so it is one row of fields and
 * one button, with the date and the category remembered between saves.
 *
 * Nothing here touches a holder's due. An RSO's balance must not move because
 * the office bought tea, and the note under the form says so — otherwise the
 * first question anybody asks is whether it does.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Btn, Card, EmptyState, Field, NumberInput, SectionHead } from "./Kit";
import { Icon } from "./icons";
import { apiSend } from "@/lib/api-client";
import { fmtMoney } from "@/lib/format";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABEL,
  PAID_FROM_LABEL,
  type ExpenseCategory,
  type PaidFrom,
} from "@/lib/lifting";
import type { ExpenseEntry } from "@/lib/lifting-data";

export function ExpenseEntryForm({ today }: { today: string }) {
  const router = useRouter();
  const [form, setForm] = useState({
    date: today,
    category: "TRANSPORT" as ExpenseCategory,
    amount: "",
    paidFrom: "CASH" as PaidFrom,
    payee: "",
    note: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);

  async function save() {
    setBusy(true);
    setMessage("");
    const r = await apiSend("/api/stock/expenses", "POST", form);
    setBusy(false);
    setOk(r.ok);
    setMessage(r.ok ? "Saved." : r.message);
    // Date and category stay: the next expense is usually the same kind of
    // thing on the same day, and retyping them twelve times is the friction
    // that makes somebody stop recording the small ones.
    if (r.ok) {
      setForm({ ...form, amount: "", payee: "", note: "" });
      router.refresh();
    }
  }

  const needsNote = form.category === "OTHER";

  return (
    <Card className="kit-card-p kit-mb-20">
      <SectionHead title="Add an expense" sub="Date and kind stay put, so a run of small entries is quick." />
      <div className="kit-form-grid">
        <Field label="Date">
          <input
            className="kit-input"
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
        </Field>
        <Field label="What for">
          <select
            className="kit-input"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {EXPENSE_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Amount">
          <NumberInput
            min="0"
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </Field>
        <Field label="Paid from">
          <select
            className="kit-input"
            value={form.paidFrom}
            onChange={(e) => setForm({ ...form, paidFrom: e.target.value as PaidFrom })}
          >
            <option value="CASH">Cash</option>
            <option value="BANK">Bank</option>
          </select>
        </Field>
        <Field label="Paid to" hint="Optional">
          <input
            className="kit-input"
            value={form.payee}
            onChange={(e) => setForm({ ...form, payee: e.target.value })}
          />
        </Field>
        <Field label="Note" hint={needsNote ? "Required for Other" : "Optional"} wide>
          <input className="kit-input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </Field>
      </div>

      {message && <p className={ok ? "kit-note is-ok" : "kit-note is-bad"}>{message}</p>}
      <Btn onClick={save} disabled={busy || !form.amount || (needsNote && !form.note.trim())}>
        {busy ? "Saving…" : "Add expense"}
      </Btn>
      <p className="kit-note">
        <Icon name="info" /> These are the house&apos;s own costs. Nobody&apos;s due changes because of anything entered
        here — it comes off the net on the Profit page and nothing else.
      </p>
    </Card>
  );
}

export function ExpenseList({ rows, canWrite }: { rows: ExpenseEntry[]; canWrite: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function remove(id: string) {
    setBusy(id);
    await apiSend("/api/stock/expenses", "DELETE", { id });
    setBusy(null);
    router.refresh();
  }

  if (!rows.length)
    return (
      <EmptyState
        title="No expenses in this period"
        hint="Nothing was recorded for these dates."
        icon={<Icon name="wallet" />}
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
            <th role="columnheader" scope="col">
              What for
            </th>
            <th role="columnheader" scope="col">
              Paid from
            </th>
            <th role="columnheader" scope="col" className="is-right">
              Amount
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
              </td>
              <td role="cell" data-label="What for">
                <strong>{EXPENSE_CATEGORY_LABEL[r.category]}</strong>
                {(r.payee || r.note) && (
                  <span className="kit-cell-sub">{[r.payee, r.note].filter(Boolean).join(" · ")}</span>
                )}
              </td>
              <td role="cell" data-label="Paid from">
                <Badge tone={r.paidFrom === "CASH" ? "neutral" : "active"}>{PAID_FROM_LABEL[r.paidFrom]}</Badge>
              </td>
              <td role="cell" data-label="Amount" className="is-right">
                {fmtMoney(r.amount)}
              </td>
              {canWrite && (
                <td role="cell" data-label="Action" className="is-right">
                  <Btn size="sm" variant="ghost" disabled={busy === r.id} onClick={() => remove(r.id)}>
                    Remove
                  </Btn>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ExpenseByCategory({ rows }: { rows: { category: ExpenseCategory; amount: number }[] }) {
  if (!rows.length) return null;
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <dl className="kit-daysum">
      {rows.map((r) => (
        <div key={r.category}>
          <dt>{EXPENSE_CATEGORY_LABEL[r.category]}</dt>
          <dd>{fmtMoney(r.amount)}</dd>
        </div>
      ))}
      <div className="is-total">
        <dt>Total</dt>
        <dd>{fmtMoney(total)}</dd>
      </div>
    </dl>
  );
}

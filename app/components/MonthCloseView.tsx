"use client";

/**
 * v206 — Month close. Accounts closes a month once it is over; from then on
 * nothing dated in it can be written or removed. Admin reopens, with a reason.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiSend } from "@/lib/api-client";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { monthLabel } from "@/lib/month-close-rules";
import type { MonthCloseItem } from "@/lib/month-close-types";
import { AppLink } from "./AppLink";
import { Badge, Btn, Card, EmptyState, Field } from "./Kit";
import { Icon } from "./icons";
import { useConfirm, useToast } from "./Feedback";

export function MonthCloseView({
  months,
  canClose,
  canReopen,
}: {
  months: MonthCloseItem[];
  canClose: boolean;
  canReopen: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<Record<string, string>>({});
  const [reopening, setReopening] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  async function close(m: MonthCloseItem) {
    const c = m.checks;
    const issues = c ? c.openCashDays.length + c.changedCashDays.length : 0;
    if (
      !(await confirm({
        title: `Close ${monthLabel(m.month)}?`,
        body: issues
          ? `${issues} cash day${issues === 1 ? " needs" : "s need"} a look first (listed on the card). Closing anyway seals the month as it is — nothing dated in it can be changed afterwards, and only Admin can reopen it.`
          : "Nothing dated in it — stock, deposits, expenses, liftings, cash — can be changed afterwards. Only Admin can reopen it.",
        confirmLabel: issues ? "Close anyway" : "Close the month",
        danger: issues > 0,
      }))
    )
      return;
    setBusy(m.month);
    setError((e) => ({ ...e, [m.month]: "" }));
    const r = await apiSend("/api/stock/month-close", "POST", { month: m.month, confirm: issues > 0 });
    setBusy(null);
    if (!r.ok) return setError((e) => ({ ...e, [m.month]: r.message }));
    toast(`${monthLabel(m.month)} is closed`);
    router.refresh();
  }

  async function reopen(month: string) {
    setBusy(month);
    const r = await apiSend("/api/stock/month-close", "DELETE", { month, reason });
    setBusy(null);
    if (!r.ok) return setError((e) => ({ ...e, [month]: r.message }));
    setReopening(null);
    setReason("");
    toast(`${monthLabel(month)} reopened`);
    router.refresh();
  }

  if (!months.length)
    return (
      <Card padded>
        <EmptyState
          title="No months yet"
          hint="A month appears here once anything is recorded in it."
          icon={<Icon name="calendar" />}
        />
      </Card>
    );

  return (
    <ul className="mc-list">
      {months.map((m) => {
        const c = m.checks;
        const issues = c ? c.openCashDays.length + c.changedCashDays.length : 0;
        const s = m.closed?.snapshot;
        return (
          <li key={m.month} className={`mc-row${m.closed ? " is-closed" : ""}`}>
            <Card className="kit-card-p">
              <div className="mc-head">
                <div>
                  <h3>{monthLabel(m.month)}</h3>
                  <p>
                    {m.closed
                      ? `Closed by ${m.closed.byName} · ${fmtDateTime(m.closed.at)}`
                      : m.running
                        ? "Running — it can be closed after its last day."
                        : `${m.entries.toLocaleString("en-US")} entries · open`}
                  </p>
                </div>
                <Badge tone={m.closed ? "success" : m.running ? "neutral" : "pending"}>
                  {m.closed ? "Closed" : m.running ? "This month" : "Open"}
                </Badge>
              </div>

              {s ? (
                <dl className="mc-figs">
                  <div>
                    <dt>Given out</dt>
                    <dd>{fmtMoney(s.given)}</dd>
                  </div>
                  <div>
                    <dt>Returned</dt>
                    <dd>{fmtMoney(s.returned)}</dd>
                  </div>
                  <div>
                    <dt>Collected</dt>
                    <dd>{fmtMoney(s.cash + s.bank)}</dd>
                  </div>
                  <div>
                    <dt>Expenses</dt>
                    <dd>{fmtMoney(s.expensesCash + s.expensesBank)}</dd>
                  </div>
                  <div>
                    <dt>Lifting</dt>
                    <dd>{fmtMoney(s.lifting)}</dd>
                  </div>
                  <div>
                    <dt>Outstanding at month end</dt>
                    <dd>{fmtMoney(s.outstanding)}</dd>
                  </div>
                  <div>
                    <dt>Cash days counted</dt>
                    <dd>
                      {s.daysClosed}
                      {Math.abs(s.variance) > 0.5
                        ? ` · ${s.variance < 0 ? "short" : "over"} ${fmtMoney(Math.abs(s.variance))}`
                        : ""}
                    </dd>
                  </div>
                </dl>
              ) : null}
              {m.closed?.note ? <p className="kit-note">{m.closed.note}</p> : null}

              {c && issues ? (
                <div className="mc-checks" role="status">
                  <strong>Before closing, a look at:</strong>
                  <ul>
                    {c.openCashDays.length ? (
                      <li>
                        Cash never counted on {c.openCashDays.length} day{c.openCashDays.length === 1 ? "" : "s"} (
                        {c.openCashDays.slice(0, 4).map((d, i) => (
                          <span key={d}>
                            {i ? ", " : ""}
                            <AppLink href={`/stock/cash-book?date=${d}`}>{fmtDate(d)}</AppLink>
                          </span>
                        ))}
                        {c.openCashDays.length > 4 ? "…" : ""})
                      </li>
                    ) : null}
                    {c.changedCashDays.length ? (
                      <li>
                        {c.changedCashDays.length} cash count{c.changedCashDays.length === 1 ? "" : "s"} changed after
                        closing (
                        <AppLink href={`/stock/cash-book?date=${c.changedCashDays[0]}`}>
                          {fmtDate(c.changedCashDays[0])}
                        </AppLink>
                        )
                      </li>
                    ) : null}
                  </ul>
                </div>
              ) : null}

              {error[m.month] ? <p className="kit-note is-bad">{error[m.month]}</p> : null}

              {!m.closed && !m.running && canClose ? (
                <div className="mc-acts">
                  <Btn onClick={() => close(m)} disabled={busy === m.month}>
                    <Icon name="shield" /> {busy === m.month ? "Closing…" : `Close ${monthLabel(m.month)}`}
                  </Btn>
                </div>
              ) : null}

              {m.closed && canReopen ? (
                reopening === m.month ? (
                  <div className="mc-reopen">
                    <Field label="Why is it being reopened?" hint="Goes in the activity log.">
                      <input
                        className="kit-input"
                        value={reason}
                        maxLength={400}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </Field>
                    <div className="mc-acts">
                      <Btn variant="ghost" onClick={() => setReopening(null)}>
                        Cancel
                      </Btn>
                      <Btn onClick={() => reopen(m.month)} disabled={busy === m.month || reason.trim().length < 3}>
                        Reopen {monthLabel(m.month)}
                      </Btn>
                    </div>
                  </div>
                ) : (
                  <div className="mc-acts">
                    <Btn variant="secondary" onClick={() => setReopening(m.month)}>
                      Reopen…
                    </Btn>
                  </div>
                )
              ) : null}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

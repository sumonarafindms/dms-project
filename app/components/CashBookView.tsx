"use client";

/**
 * v206 — the Cash Book: one day's cash box, and the note-by-note count that
 * closes it. Figures come whole from lib/cash-book.ts; this screen only adds
 * up what is typed into the count and sends it.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiSend } from "@/lib/api-client";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import {
  CASH_MOVE_KINDS,
  DENOMINATIONS,
  VARIANCE_LABEL,
  VARIANCE_TOLERANCE,
  countedCash,
  varianceTone,
  type CashMoveKind,
  type Denominations,
  type LedgerDay,
} from "@/lib/cash-book-rules";
import type { CashBookDay, CashBookLine } from "@/lib/cash-book-types";
import { AppLink } from "./AppLink";
import { Badge, Btn, Card, EmptyState, Field, LinkBtn, NumberInput, SectionHead, type BadgeTone } from "./Kit";
import { Icon } from "./icons";
import { useConfirm, useToast } from "./Feedback";

const VARIANCE_TONE: Record<"even" | "short" | "over", BadgeTone> = {
  even: "active",
  short: "failed",
  over: "pending",
};

const shift = (ymd: string, days: number) =>
  new Date(new Date(`${ymd}T00:00:00.000Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);

/** How many lines a list shows before "Show all" — a day can have forty depositors. */
const FOLD = 8;

function Lines({
  title,
  sign,
  rows,
  empty,
  onRemove,
}: {
  title: string;
  sign: "+" | "−";
  rows: CashBookLine[];
  empty: string;
  onRemove?: (row: CashBookLine) => void;
}) {
  const [all, setAll] = useState(false);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const shown = all ? rows : rows.slice(0, FOLD);
  return (
    <div className="cb-lines">
      <div className="cb-lines-head">
        <span>{title}</span>
        <strong>
          {sign}
          {fmtMoney(total)}
        </strong>
      </div>
      {rows.length ? (
        <ul>
          {shown.map((r, i) => (
            <li key={r.id ?? `${r.label}-${i}`}>
              <span className="cb-line-name">
                {r.label}
                {r.sub ? <em>{r.sub}</em> : null}
              </span>
              <span className="cb-line-amt">{fmtMoney(r.amount)}</span>
              {onRemove && r.id ? (
                <button
                  type="button"
                  className="cb-line-x"
                  aria-label={`Remove ${r.label} ${fmtMoney(r.amount)}`}
                  onClick={() => onRemove(r)}
                >
                  <Icon name="close" />
                </button>
              ) : null}
            </li>
          ))}
          {rows.length > FOLD ? (
            <li className="cb-lines-more">
              <button type="button" onClick={() => setAll(!all)} aria-expanded={all}>
                {all ? "Show fewer" : `Show all ${rows.length}`}
              </button>
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="cb-lines-empty">{empty}</p>
      )}
    </div>
  );
}

export function CashBookView({
  day,
  history,
  today,
  canWrite,
  locked,
}: {
  day: CashBookDay;
  history: LedgerDay[];
  today: string;
  canWrite: boolean;
  /** Set when the day's month is closed. */
  locked: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const writable = canWrite && !locked;

  const [count, setCount] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      DENOMINATIONS.map((d) => [
        String(d),
        day.detail?.denominations[String(d)] ? String(day.detail.denominations[String(d)]) : "",
      ]),
    ),
  );
  const [note, setNote] = useState(day.detail?.note ?? "");
  const needsOpening = day.carriedIn === null;
  const [opening, setOpening] = useState(needsOpening && day.close ? String(day.close.openingCash) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [move, setMove] = useState<{ kind: CashMoveKind; amount: string; note: string }>({
    kind: "BANK_DEPOSIT",
    amount: "",
    note: "",
  });
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveError, setMoveError] = useState("");

  const denoms: Denominations = useMemo(
    () => Object.fromEntries(Object.entries(count).map(([k, v]) => [k, Number(v) || 0])),
    [count],
  );
  const counted = countedCash(denoms);
  const openingNow = needsOpening ? (opening === "" ? null : Number(opening) || 0) : day.carriedIn;
  const expected = openingNow === null ? null : Math.round((openingNow + day.cashIn - day.cashOut) * 100) / 100;
  const variance = expected === null ? null : Math.round((counted - expected) * 100) / 100;
  const vTone = variance === null ? null : varianceTone(variance);
  const typedAnything = Object.values(count).some((v) => v !== "");

  async function closeDay() {
    setError("");
    if (variance !== null && Math.abs(variance) > VARIANCE_TOLERANCE && note.trim().length < 3)
      return setError(
        `The count is ${variance < 0 ? "short" : "over"} by ${fmtMoney(Math.abs(variance))}. Write a short reason first.`,
      );
    setBusy(true);
    const r = await apiSend<{ variance: number }>("/api/stock/cash-book/close", "POST", {
      date: day.date,
      denominations: Object.fromEntries(Object.entries(count).filter(([, v]) => v !== "")),
      openingCash: needsOpening ? opening : undefined,
      note,
    });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    toast(day.close ? `Cash for ${fmtDate(day.date)} counted again` : `Cash for ${fmtDate(day.date)} closed`);
    router.refresh();
  }

  async function addMove() {
    setMoveError("");
    setMoveBusy(true);
    const r = await apiSend("/api/stock/cash-book/moves", "POST", { date: day.date, ...move });
    setMoveBusy(false);
    if (!r.ok) return setMoveError(r.message);
    setMove((m) => ({ ...m, amount: "", note: "" }));
    toast("Cash entry added");
    router.refresh();
  }

  async function removeMove(row: CashBookLine) {
    if (
      !(await confirm({
        title: "Remove this cash entry?",
        body: `${row.label} — ${fmtMoney(row.amount)} on ${fmtDate(day.date)}.`,
        confirmLabel: "Remove",
        danger: true,
      }))
    )
      return;
    const r = await apiSend("/api/stock/cash-book/moves", "DELETE", { id: row.id });
    if (!r.ok) return toast(r.message, "bad");
    toast("Cash entry removed");
    router.refresh();
  }

  const status = day.changed
    ? { tone: "failed" as BadgeTone, text: "Changed after closing" }
    : day.close
      ? { tone: "active" as BadgeTone, text: "Closed" }
      : { tone: "neutral" as BadgeTone, text: "Open" };

  return (
    <>
      <div className="cb-daynav">
        <LinkBtn
          href={`/stock/cash-book?date=${shift(day.date, -1)}`}
          variant="ghost"
          size="sm"
          aria-label="Day before"
        >
          ←
        </LinkBtn>
        <input
          className="kit-input cb-date"
          type="date"
          value={day.date}
          max={today}
          aria-label="Day"
          onChange={(e) => e.target.value && router.push(`/stock/cash-book?date=${e.target.value}`)}
        />
        {day.date < today ? (
          <LinkBtn
            href={`/stock/cash-book?date=${shift(day.date, 1)}`}
            variant="ghost"
            size="sm"
            aria-label="Day after"
          >
            →
          </LinkBtn>
        ) : null}
        {day.date !== today ? (
          <LinkBtn href="/stock/cash-book" variant="secondary" size="sm">
            Today
          </LinkBtn>
        ) : null}
      </div>

      {locked ? (
        <p className="kit-note is-bad kit-mb-16" role="status">
          <Icon name="alert" /> {locked}
        </p>
      ) : null}
      {day.changed && day.close ? (
        <p className="kit-note is-bad kit-mb-16" role="status">
          <Icon name="alert" /> Something changed after this day was closed. It was signed off expecting{" "}
          {fmtMoney(day.close.expected)}; the books now say {fmtMoney(day.expected ?? 0)}
          {day.carriedIn !== null && day.carriedIn !== day.close.openingCash
            ? ` (the day before now carries ${fmtMoney(day.carriedIn)}, not ${fmtMoney(day.close.openingCash)})`
            : ""}
          . Count again to sign off the new figure.
        </p>
      ) : null}

      <div className="cb-grid">
        <div className="cb-main">
          <Card className="kit-card-p cb-hero">
            <div className="cb-hero-top">
              <span className="kit-label">Cash that should be in hand</span>
              <Badge tone={status.tone}>{status.text}</Badge>
            </div>
            <strong className="cb-hero-figure">{expected === null ? "—" : fmtMoney(expected)}</strong>
            <p className="cb-hero-sub">
              {expected === null
                ? "No earlier count to start from. Enter the cash in hand at the start of the day, in the count."
                : `End of ${fmtDate(day.date)}. ${day.close && !day.changed ? `Closed by ${day.detail?.closedByName} · ${fmtDateTime(day.detail?.closedAt ?? "")}` : ""}`}
            </p>
            <dl className="cb-sum">
              <div>
                <dt>Opening</dt>
                <dd>{openingNow === null ? "—" : fmtMoney(openingNow)}</dd>
              </div>
              <div>
                <dt>Cash in</dt>
                <dd className="is-in">+{fmtMoney(day.cashIn)}</dd>
              </div>
              <div>
                <dt>Cash out</dt>
                <dd className="is-out">−{fmtMoney(day.cashOut)}</dd>
              </div>
              <div className="is-total">
                <dt>Should be</dt>
                <dd>{expected === null ? "—" : fmtMoney(expected)}</dd>
              </div>
            </dl>
            {/* On a phone the count sits under the lists; one tap takes the thumb there. */}
            <LinkBtn external href="#cb-count" variant="secondary" size="sm" className="cb-jump">
              {day.close ? "See the count ↓" : "Count the cash ↓"}
            </LinkBtn>
          </Card>

          <Card className="kit-card-p kit-mb-16">
            <SectionHead title="Cash in" sub="Deposited in cash by RSOs, BPs and supervisors, from Daily Entry." />
            <Lines title="From people" sign="+" rows={day.deposits} empty="No cash deposits on this day." />
            {day.movesIn.length ? (
              <Lines
                title="Other cash in"
                sign="+"
                rows={day.movesIn}
                empty=""
                onRemove={writable ? removeMove : undefined}
              />
            ) : null}
          </Card>

          <Card className="kit-card-p kit-mb-16">
            <SectionHead title="Cash out" sub="Expenses paid from cash, and cash that left the box." />
            <Lines title="Expenses (cash)" sign="−" rows={day.expenses} empty="No cash expenses on this day." />
            {day.movesOut.length ? (
              <Lines
                title="Other cash out"
                sign="−"
                rows={day.movesOut}
                empty=""
                onRemove={writable ? removeMove : undefined}
              />
            ) : null}
            {writable ? (
              <div className="cb-move">
                <span className="kit-label">Add cash in or out</span>
                <div className="kit-form-grid">
                  <Field label="What">
                    <select
                      className="kit-input"
                      value={move.kind}
                      onChange={(e) => setMove({ ...move, kind: e.target.value as CashMoveKind })}
                    >
                      {(["out", "in"] as const).map((dir) => (
                        <optgroup key={dir} label={dir === "out" ? "Cash out" : "Cash in"}>
                          {CASH_MOVE_KINDS.filter((k) => k.dir === dir).map((k) => (
                            <option key={k.key} value={k.key}>
                              {k.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </Field>
                  <Field label="Amount">
                    <NumberInput
                      min="0"
                      step="0.01"
                      value={move.amount}
                      onChange={(e) => setMove({ ...move, amount: e.target.value })}
                    />
                  </Field>
                  <Field label="Note" hint="Slip number, who took it">
                    <input
                      className="kit-input"
                      value={move.note}
                      maxLength={200}
                      onChange={(e) => setMove({ ...move, note: e.target.value })}
                    />
                  </Field>
                </div>
                {moveError ? <p className="kit-note is-bad">{moveError}</p> : null}
                <Btn variant="secondary" onClick={addMove} disabled={moveBusy || !(Number(move.amount) > 0)}>
                  {moveBusy ? "Adding…" : "Add"}
                </Btn>
              </div>
            ) : null}
            {day.bankDeposits > 0 || day.bankExpenses > 0 ? (
              <p className="kit-note">
                <Icon name="info" /> Not in the cash box: {fmtMoney(day.bankDeposits)} deposited straight to the bank
                {day.bankExpenses > 0 ? ` and ${fmtMoney(day.bankExpenses)} of expenses paid from the bank` : ""}.
              </p>
            ) : null}
          </Card>
        </div>

        <div className="cb-count" id="cb-count">
          <Card className="kit-card-p">
            <SectionHead
              title={day.close ? "The count" : "Count the cash"}
              sub={writable ? "How many of each note is in the box now." : "What was counted when the day was closed."}
            />
            {needsOpening ? (
              <Field
                label="Cash in hand when the day began"
                hint="Only the first count asks — after that it carries forward."
              >
                <NumberInput
                  min="0"
                  step="0.01"
                  value={opening}
                  disabled={!writable}
                  onChange={(e) => setOpening(e.target.value)}
                />
              </Field>
            ) : null}
            <div className="cb-denoms" role="group" aria-label="Notes and coins counted">
              {DENOMINATIONS.map((d) => {
                const n = Number(count[String(d)]) || 0;
                return (
                  <label key={d} className="cb-denom">
                    <span className="cb-denom-note">৳{d.toLocaleString("en-US")}</span>
                    <span className="cb-denom-x" aria-hidden="true">
                      ×
                    </span>
                    <input
                      className="kit-input"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={count[String(d)]}
                      disabled={!writable}
                      aria-label={`Number of ৳${d} ${d >= 10 ? "notes" : "coins"}`}
                      onChange={(e) => setCount({ ...count, [String(d)]: e.target.value.replace(/[^0-9]/g, "") })}
                    />
                    <span className="cb-denom-sum">{n ? fmtMoney(n * d) : ""}</span>
                  </label>
                );
              })}
            </div>
            <dl className="cb-result">
              <div>
                <dt>Counted</dt>
                <dd>{fmtMoney(counted)}</dd>
              </div>
              <div>
                <dt>Should be</dt>
                <dd>{expected === null ? "—" : fmtMoney(expected)}</dd>
              </div>
              <div className={`is-total is-${vTone ?? "none"}`}>
                <dt>Difference</dt>
                <dd>
                  {variance === null || (!typedAnything && !day.close) ? (
                    "—"
                  ) : (
                    <>
                      {variance > 0 ? "+" : variance < 0 ? "−" : ""}
                      {fmtMoney(Math.abs(variance))}{" "}
                      <Badge tone={VARIANCE_TONE[vTone!]}>{VARIANCE_LABEL[vTone!]}</Badge>
                    </>
                  )}
                </dd>
              </div>
            </dl>
            <Field label="Note" hint={vTone && vTone !== "even" ? "Required: why is it short or over?" : "Optional"}>
              <input
                className="kit-input"
                value={note}
                maxLength={400}
                disabled={!writable}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            {error ? <p className="kit-note is-bad">{error}</p> : null}
            {writable ? (
              <Btn block onClick={closeDay} disabled={busy || (needsOpening && opening === "")}>
                {busy ? "Closing…" : day.close ? "Count again and close" : "Close the day"}
              </Btn>
            ) : null}
          </Card>
        </div>
      </div>

      <SectionHead title="Last two weeks" sub="Tap a day to open it. A day with no cash moving needs no count." />
      {history.length ? (
        <div className="kit-table-wrap">
          <table className="kit-report-table" role="table">
            <thead>
              <tr role="row">
                <th role="columnheader" scope="col">
                  Day
                </th>
                <th role="columnheader" scope="col" className="is-right">
                  Cash in
                </th>
                <th role="columnheader" scope="col" className="is-right">
                  Cash out
                </th>
                <th role="columnheader" scope="col" className="is-right">
                  Should be
                </th>
                <th role="columnheader" scope="col" className="is-right">
                  Counted
                </th>
                <th role="columnheader" scope="col">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => {
                const t = h.variance === null ? null : varianceTone(h.variance);
                return (
                  <tr role="row" key={h.date} className={h.date === day.date ? "is-current" : undefined}>
                    <td role="cell" data-label="Day">
                      <AppLink href={`/stock/cash-book?date=${h.date}`} className="kit-row-link">
                        <strong>{fmtDate(h.date)}</strong>
                      </AppLink>
                    </td>
                    <td role="cell" data-label="Cash in" className="is-right">
                      {fmtMoney(h.cashIn)}
                    </td>
                    <td role="cell" data-label="Cash out" className="is-right">
                      {fmtMoney(h.cashOut)}
                    </td>
                    <td role="cell" data-label="Should be" className="is-right">
                      {h.expected === null ? "—" : fmtMoney(h.expected)}
                    </td>
                    <td role="cell" data-label="Counted" className="is-right">
                      {h.close ? fmtMoney(h.close.counted) : "—"}
                    </td>
                    <td role="cell" data-label="Status">
                      {h.changed ? (
                        <Badge tone="failed">Changed after closing</Badge>
                      ) : h.close ? (
                        <Badge tone={VARIANCE_TONE[t!]}>
                          {t === "even" ? "Closed" : `${VARIANCE_LABEL[t!]} ${fmtMoney(Math.abs(h.variance!))}`}
                        </Badge>
                      ) : h.cashIn || h.cashOut ? (
                        <Badge tone="pending">Not counted</Badge>
                      ) : (
                        <Badge tone="neutral">Quiet</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Card padded>
          <EmptyState title="Nothing yet" hint="Days appear here as cash moves." icon={<Icon name="wallet" />} />
        </Card>
      )}
    </>
  );
}

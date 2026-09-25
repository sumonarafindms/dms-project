"use client";

/**
 * v205 — the Due reminders list: who owes, since when nothing came in, and a
 * WhatsApp reminder one tap away. Sending records it (REMIND_DUE), so the list
 * says who was chased today and by whom.
 */

import { useMemo, useState } from "react";
import { apiSend } from "@/lib/api-client";
import { fmtDate, fmtMoney } from "@/lib/format";
import { HOLDER_TYPE_LABEL, type HolderType } from "@/lib/stock";
import { matchesTokens } from "@/lib/text-search";
import { daysBetween, reminderText } from "@/lib/reminder-text";
import { whatsappLink } from "@/lib/receipt";
import { dhakaTodayYmd } from "@/lib/business-time";
import { AppLink } from "./AppLink";
import { Badge, Card, EmptyState, LinkBtn } from "./Kit";
import { Icon } from "./icons";
import { useToast } from "./Feedback";

export type ReminderItem = {
  key: string;
  type: HolderType;
  id: string;
  name: string;
  code: string | null;
  supervisorName: string | null;
  inactive: boolean;
  due: number;
  phone: string | null;
  phones: string[];
  lastDeposit: string | null;
  lastAmount: number | null;
  lastReminded: string | null;
  lastRemindedBy: string | null;
};

type Sort = "due" | "quiet" | "unreminded";
const SORTS: { key: Sort; label: string }[] = [
  { key: "due", label: "Biggest due first" },
  { key: "quiet", label: "Longest without paying" },
  { key: "unreminded", label: "Not reminded lately" },
];
const QUIET = 7;

export function ReminderList({ rows, today }: { rows: ReminderItem[]; today: string }) {
  const toast = useToast();
  const [type, setType] = useState<HolderType | "ALL">("ALL");
  const [sort, setSort] = useState<Sort>("due");
  const [q, setQ] = useState("");
  const [onlyQuiet, setOnlyQuiet] = useState(false);
  const [reminded, setReminded] = useState<Record<string, { at: string; by: string }>>({});

  const quietDays = (r: ReminderItem) => (r.lastDeposit ? daysBetween(r.lastDeposit, today) : Infinity);
  const remindedAt = (r: ReminderItem) => reminded[r.key]?.at ?? r.lastReminded;

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: rows.length, RSO: 0, BP: 0, SUPERVISOR: 0 };
    for (const r of rows) c[r.type] += 1;
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter(
      (r) =>
        (type === "ALL" || r.type === type) &&
        (!onlyQuiet || quietDays(r) >= QUIET) &&
        (!needle ||
          matchesTokens(
            `${r.name} ${r.code ?? ""} ${r.supervisorName ?? ""}`.toLowerCase(),
            needle,
            r.phones.join(" "),
          )),
    );
    const by: Record<Sort, (a: ReminderItem, b: ReminderItem) => number> = {
      due: (a, b) => b.due - a.due,
      quiet: (a, b) => quietDays(b) - quietDays(a) || b.due - a.due,
      unreminded: (a, b) => (remindedAt(a) ?? "").localeCompare(remindedAt(b) ?? "") || b.due - a.due,
    };
    return [...list].sort(by[sort]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, type, sort, q, onlyQuiet, reminded]);

  async function record(r: ReminderItem) {
    const res = await apiSend<{ at: string }>("/api/stock/reminders", "POST", { holder: r.key, due: r.due });
    if (res.ok) {
      setReminded((m) => ({ ...m, [r.key]: { at: res.data.at, by: "you" } }));
      toast(`Reminder to ${r.name} recorded`);
    } else toast(res.message, "bad");
  }

  return (
    <>
      <div className="rem-tools">
        <div className="ops-level-tabs" role="tablist" aria-label="Who">
          {(["ALL", "RSO", "BP", "SUPERVISOR"] as const).map((t) =>
            t !== "ALL" && !counts[t] ? null : (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={type === t}
                className={`ops-level-tab${type === t ? " is-active" : ""}`}
                onClick={() => setType(t)}
              >
                <span>
                  {t === "ALL" ? "Everyone" : t === "SUPERVISOR" ? "Supervisors" : `${HOLDER_TYPE_LABEL[t]}s`}
                </span>
                <em>{counts[t]}</em>
              </button>
            ),
          )}
        </div>
        <input
          className="kit-input rem-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a name, code or phone"
          aria-label="Find a person"
        />
        <select
          className="kit-input rem-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <label className="acc-toggle">
          <input type="checkbox" checked={onlyQuiet} onChange={(e) => setOnlyQuiet(e.target.checked)} />
          <span>Nothing paid for {QUIET}+ days</span>
        </label>
      </div>

      {shown.length ? (
        <ul className="rem-list">
          {shown.map((r) => {
            const quiet = quietDays(r);
            const at = remindedAt(r);
            const by = reminded[r.key]?.by ?? r.lastRemindedBy;
            const today_ = !!at && dhakaTodayYmd(new Date(at)) === today;
            const text = reminderText({
              name: r.name,
              due: r.due,
              today,
              lastDeposit: r.lastDeposit,
              lastAmount: r.lastAmount,
            });
            return (
              <li key={r.key} className={`rem-row${quiet >= QUIET ? " is-quiet" : ""}`}>
                <div className="rem-who">
                  <AppLink href={`/stock/${r.type}/${r.id}`} className="rem-name">
                    {r.name}
                  </AppLink>
                  <span className="rem-meta">
                    <Badge tone="neutral">{HOLDER_TYPE_LABEL[r.type]}</Badge>
                    {[r.code, r.supervisorName].filter(Boolean).join(" · ")}
                    {r.inactive ? " · no longer active" : ""}
                  </span>
                </div>
                <div className="rem-due">
                  <strong className="kit-due is-owing">{fmtMoney(r.due)}</strong>
                  <span className={quiet >= QUIET ? "rem-quiet is-late" : "rem-quiet"}>
                    {r.lastDeposit
                      ? `Last paid ${fmtDate(r.lastDeposit)}${r.lastAmount ? ` · ${fmtMoney(r.lastAmount)}` : ""} · ${
                          quiet === 0 ? "today" : quiet === 1 ? "yesterday" : `${quiet} days ago`
                        }`
                      : "Never paid"}
                  </span>
                </div>
                <div className="rem-acts">
                  {at ? (
                    <span className={`rem-sent${today_ ? " is-today" : ""}`}>
                      <Icon name="check" /> Reminded {today_ ? "today" : fmtDate(at)}
                      {by ? ` by ${by}` : ""}
                    </span>
                  ) : null}
                  <LinkBtn
                    external
                    size="sm"
                    href={whatsappLink(r.phone, text)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => void record(r)}
                  >
                    <Icon name="phone" /> Remind on WhatsApp
                  </LinkBtn>
                  <LinkBtn href={`/stock/${r.type}/${r.id}/statement`} variant="ghost" size="sm">
                    <Icon name="file" /> Statement
                  </LinkBtn>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <Card padded>
          <EmptyState
            title={rows.length ? "Nobody matches" : "Nobody owes anything"}
            hint={rows.length ? "Try a different name, or clear the filters." : "Every due in your scope is settled."}
            icon={<Icon name="check" />}
          />
        </Card>
      )}
    </>
  );
}

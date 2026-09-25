"use client";

/**
 * v203 — the notice board's screens: the strip on each home screen, the list
 * a reader sees, the form a poster fills in and the list they manage.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiSend } from "@/lib/api-client";
import { fmtDate } from "@/lib/format";
import {
  NOTICE_AUDIENCE_LABEL,
  NOTICE_BODY_MAX,
  NOTICE_MAX_DAYS,
  NOTICE_TITLE_MAX,
  audiencesFor,
  type NoticeAudience,
  type NoticeView,
} from "@/lib/notice-rules";
import { AppLink } from "./AppLink";
import { Badge, Btn, Card, EmptyState, Field, SectionHead } from "./Kit";
import { Icon } from "./icons";
import { useConfirm, useToast } from "./Feedback";

const HIDDEN_KEY = "dms_notices_hidden";

function readHidden(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** One notice as a card. */
export function NoticeCard({ n, onHide }: { n: NoticeView; onHide?: () => void }) {
  return (
    <article className={`notice${n.urgent ? " is-urgent" : ""}`}>
      <header>
        <Icon name={n.urgent ? "alert" : "info"} />
        <strong>{n.title}</strong>
        {onHide ? (
          <button type="button" className="notice-hide" onClick={onHide} aria-label={`Hide “${n.title}”`}>
            <Icon name="close" />
          </button>
        ) : null}
      </header>
      <p>{n.body}</p>
      <footer>
        {n.createdByName} · {fmtDate(n.createdAt)}
        {n.expiresOn ? ` · until ${fmtDate(n.expiresOn)}` : ""}
      </footer>
    </article>
  );
}

/**
 * The home screen's strip: today's notices, each hideable on this device. A
 * hidden notice is still on the Notice Board page; hiding is "I have read it",
 * not "delete".
 */
export function NoticeStrip({ notices }: { notices: NoticeView[] }) {
  const [hidden, setHidden] = useState<string[] | null>(null);
  useEffect(() => setHidden(readHidden()), []);
  // Until the device's list is read, nothing: no flash of notices already hidden.
  if (hidden === null) return null;
  const shown = notices.filter((n) => !hidden.includes(n.id));
  if (!shown.length) return null;
  function hide(id: string) {
    const next = [...new Set([...(hidden ?? []), id])].slice(-200);
    setHidden(next);
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
    } catch {
      /* private mode: hidden for this visit only */
    }
  }
  return (
    <section className="notice-strip no-print" aria-label="Notices">
      {shown.slice(0, 3).map((n) => (
        <NoticeCard key={n.id} n={n} onHide={() => hide(n.id)} />
      ))}
      <AppLink href="/notices" className="notice-all">
        {shown.length > 3 ? `${shown.length - 3} more — see all notices` : "Notice Board"} <Icon name="arrow" />
      </AppLink>
    </section>
  );
}

/** A poster's form. */
export function NoticeForm({ role, today }: { role: string; today: string }) {
  const router = useRouter();
  const toast = useToast();
  const options = audiencesFor(role);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<NoticeAudience[]>(options.includes("RSO") ? ["RSO", "BP"] : [...options]);
  const [urgent, setUrgent] = useState(false);
  const [expiresOn, setExpiresOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);

  const maxDay = (() => {
    const d = new Date(`${today}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + NOTICE_MAX_DAYS);
    return d.toISOString().slice(0, 10);
  })();

  async function post() {
    setBusy(true);
    setMessage("");
    const r = await apiSend("/api/notices", "POST", { title, body, audience, urgent, expiresOn: expiresOn || null });
    setBusy(false);
    setOk(r.ok);
    setMessage(r.ok ? "" : r.message);
    if (r.ok) {
      toast("Notice posted — it is on their home screens now");
      setTitle("");
      setBody("");
      setUrgent(false);
      setExpiresOn("");
      router.refresh();
    }
  }

  return (
    <Card className="kit-card-p kit-mb-20">
      <SectionHead
        title="Post a notice"
        sub={
          role === "MANAGER"
            ? "It reaches your own teams only."
            : "It shows at the top of each reader's home screen until its last day."
        }
      />
      <div className="kit-form-grid">
        <Field label="Heading" hint={`${title.length}/${NOTICE_TITLE_MAX}`} wide>
          <input
            className="kit-input"
            value={title}
            maxLength={NOTICE_TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Meeting on Saturday, 10 am"
          />
        </Field>
        <Field label="Notice" hint={`${body.length}/${NOTICE_BODY_MAX}`} wide>
          <textarea
            className="kit-input notice-body-input"
            value={body}
            maxLength={NOTICE_BODY_MAX}
            rows={4}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What everybody needs to know"
          />
        </Field>
        <fieldset className="kit-field is-wide notice-aud">
          <legend>For</legend>
          <div>
            {options.map((a) => (
              <label key={a} className={`notice-aud-opt${audience.includes(a) ? " is-on" : ""}`}>
                <input
                  type="checkbox"
                  checked={audience.includes(a)}
                  onChange={() => setAudience((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]))}
                />
                {NOTICE_AUDIENCE_LABEL[a]}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Last day to show it" hint="Leave empty to keep it up until you take it down">
          <input
            className="kit-input"
            type="date"
            value={expiresOn}
            min={today}
            max={maxDay}
            onChange={(e) => setExpiresOn(e.target.value)}
          />
        </Field>
        <label className="acc-toggle notice-urgent">
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
          <span>Important — show it first, in red</span>
        </label>
      </div>
      {message && <p className={ok ? "kit-note is-ok" : "kit-note is-bad"}>{message}</p>}
      <Btn onClick={post} disabled={busy || !title.trim() || !body.trim() || !audience.length}>
        {busy ? "Posting…" : "Post notice"}
      </Btn>
    </Card>
  );
}

export type ManagedNoticeRow = NoticeView & { audience: string[]; active: boolean; live: boolean; teamOnly: boolean };

/** What a poster has posted, with Take down / Put back. */
export function NoticeManager({ rows }: { rows: ManagedNoticeRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function setActive(id: string, active: boolean) {
    const n = rows.find((x) => x.id === id);
    if (
      !active &&
      !(await confirm({
        title: `Take down “${n?.title ?? "this notice"}”?`,
        body: "It disappears from every home screen at once. You can put it back later.",
        confirmLabel: "Take down",
        danger: true,
      }))
    )
      return;
    setBusy(id);
    setError("");
    const r = await apiSend("/api/notices", "PATCH", { id, active });
    setBusy(null);
    if (!r.ok) return setError(r.message);
    toast(active ? "Notice back up" : "Notice taken down");
    router.refresh();
  }

  if (!rows.length)
    return (
      <Card padded>
        <EmptyState
          title="Nothing posted yet"
          hint="Notices you post will be listed here."
          icon={<Icon name="info" />}
        />
      </Card>
    );

  return (
    <>
      {error && <p className="kit-note is-bad">{error}</p>}
      <div className="notice-list">
        {rows.map((n) => (
          <div key={n.id} className={`notice-managed${n.live ? "" : " is-off"}`}>
            <NoticeCard n={n} />
            <div className="notice-managed-foot">
              <span>
                For {n.audience.map((a) => NOTICE_AUDIENCE_LABEL[a as NoticeAudience] ?? a).join(", ")}
                {n.teamOnly ? " · own teams only" : ""}
              </span>
              {n.live ? (
                <Badge tone="success">Showing</Badge>
              ) : n.active ? (
                <Badge tone="neutral">Ended</Badge>
              ) : (
                <Badge tone="pending">Taken down</Badge>
              )}
              {n.active ? (
                <Btn size="sm" variant="ghost" disabled={busy === n.id} onClick={() => setActive(n.id, false)}>
                  Take down
                </Btn>
              ) : (
                <Btn size="sm" variant="ghost" disabled={busy === n.id} onClick={() => setActive(n.id, true)}>
                  Put back
                </Btn>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

"use client";

/**
 * v203 — Quick search: the one box that finds a person, an outlet or a page.
 *
 * Opens from the search button in the sidebar and the phone's top bar, or
 * with Ctrl+K / ⌘K / "/" on a keyboard. Pages are matched here, from the menu
 * this role can already see; people and outlets come from /api/search, which
 * scopes them to what this role's own pages would show (lib/quick-search.ts).
 *
 * Arrow keys move, Enter opens, Esc closes — and a tap does the same on a
 * phone, which is where nine in ten of this app's users are.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { matchesTokens } from "@/lib/text-search";
import type { QuickHit } from "@/lib/quick-search-types";
import { Modal } from "./Modal";
import { Icon } from "./icons";

export type QuickPage = { href: string; label: string; group?: string };

type Row = { key: string; kind: string; title: string; sub: string; href: string };

export function QuickSearch({ pages, variant }: { pages: QuickPage[]; variant: "sidebar" | "icon" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<QuickHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  // Ctrl+K / ⌘K anywhere; "/" when not already typing. Only the sidebar copy
  // listens, so the two buttons do not both open on one key press.
  useEffect(() => {
    if (variant !== "sidebar") return;
    function onKey(e: KeyboardEvent) {
      const typing = (e.target as HTMLElement)?.closest?.("input, textarea, select, [contenteditable=true]");
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [variant]);

  // After the dialog's own focus move, so the cursor lands in the box.
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  // People and outlets from the server, debounced; a newer query cancels an older one.
  useEffect(() => {
    const term = q.trim();
    if (!open || term.length < 2) {
      setHits([]);
      setLoading(false);
      setFailed("");
      return;
    }
    const ctl = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      const r = await apiFetch<{ hits: QuickHit[] }>(`/api/search?q=${encodeURIComponent(term)}`, {
        signal: ctl.signal,
      });
      if (ctl.signal.aborted) return;
      setLoading(false);
      if (r.ok) {
        setHits(r.data.hits);
        setFailed("");
      } else {
        setHits([]);
        setFailed(r.message);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [q, open]);

  const rows: Row[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    const pageRows: Row[] = term
      ? pages
          .filter((p) => matchesTokens(`${p.label} ${p.group ?? ""}`.toLowerCase(), term))
          .slice(0, 6)
          .map((p) => ({ key: `page:${p.href}`, kind: "Page", title: p.label, sub: p.group ?? "", href: p.href }))
      : [];
    return [...hits.map((h) => ({ key: `${h.kind}:${h.href}`, ...h })), ...pageRows];
  }, [q, pages, hits]);

  useEffect(() => setActive(0), [rows.length]);

  function close() {
    setOpen(false);
    setQ("");
    setHits([]);
  }
  function go(r: Row) {
    close();
    router.push(r.href);
  }

  return (
    <>
      {variant === "sidebar" ? (
        <button type="button" className="qs-trigger" onClick={() => setOpen(true)}>
          <Icon name="search" />
          <span>Search people, outlets, pages</span>
          <kbd>Ctrl K</kbd>
        </button>
      ) : (
        <button type="button" className="qs-icon kit-icon-btn" onClick={() => setOpen(true)} aria-label="Search">
          <Icon name="search" />
        </button>
      )}

      {open ? (
        <Modal title="Search" sub="A name, a code or a phone number — or the name of a page." onClose={close}>
          <div className="qs">
            <input
              ref={input}
              className="kit-input qs-input"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, rows.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter" && rows[active]) {
                  e.preventDefault();
                  go(rows[active]);
                }
              }}
              placeholder="e.g. Rahim, R109469, 01712345678, Daily entry"
              aria-label="Search"
              aria-controls="qs-results"
              autoComplete="off"
            />
            <p className="kit-hint is-xs" aria-live="polite">
              {q.trim().length < 2
                ? "Type at least two letters."
                : loading
                  ? "Searching…"
                  : failed
                    ? failed
                    : rows.length
                      ? `${rows.length} found — ↑ ↓ to move, Enter to open`
                      : "Nothing matches that."}
            </p>
            {rows.length ? (
              <ul className="qs-list" id="qs-results" role="listbox" aria-label="Results">
                {rows.map((r, i) => (
                  <li key={r.key} role="option" aria-selected={i === active}>
                    <button
                      type="button"
                      className={`qs-row${i === active ? " is-active" : ""}`}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(r)}
                    >
                      <span className={`qs-kind is-${r.kind.toLowerCase()}`}>{r.kind}</span>
                      <span className="qs-text">
                        <strong>{r.title}</strong>
                        {r.sub ? <em>{r.sub}</em> : null}
                      </span>
                      <Icon name="arrow" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </>
  );
}

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "./icons";

/**
 * Instant search for a list the SERVER has to narrow.
 *
 * Most lists in this app are fetched whole and filtered in the browser
 * (`ListControls`) — nothing beats that, because no request happens at all.
 * This component is for the cases where that is not honest: the Activity Log
 * can hold years of rows, and filtering only the 250 already on screen would
 * silently fail to find the entry someone is actually looking for.
 *
 * ## Why this is not a form
 *
 * The previous version (`LiveFilterForm`) called `form.requestSubmit()` a few
 * hundred milliseconds after each keystroke. A native form submit is a real
 * browser navigation: the whole document reloads, the input is destroyed and
 * recreated, and the caret is lost. That is precisely the "type a word, watch
 * the page reload, then see results" behaviour this replaces.
 *
 * Instead the input is ordinary client state and the URL is updated with
 * `router.replace` inside a transition. That is a SOFT navigation — React
 * re-renders the server component tree in place, this input never unmounts, so
 * focus and caret position survive, and `scroll: false` keeps the page where it
 * was. The URL still carries the query, so the result is bookmarkable and the
 * back button behaves.
 *
 * `replace`, not `push`: every keystroke would otherwise become a history
 * entry, and leaving the page would mean pressing back once per character.
 */
export function ServerSearchBar({
  paramName = "q",
  placeholder = "Search",
  delay = 250,
  children,
  resultCount,
  resultNoun = "result",
}: {
  paramName?: string;
  placeholder?: string;
  /** Debounce. Long enough to skip most intermediate words, short enough to feel live. */
  delay?: number;
  /** Extra controls (selects, date inputs) rendered inside the same bar. */
  children?: React.ReactNode;
  resultCount?: number;
  resultNoun?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(params.get(paramName) ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The URL is the source of truth on first paint and on a back/forward, but
  // NOT while typing — reading it back mid-debounce would fight the caret.
  const committed = params.get(paramName) ?? "";
  const lastCommitted = useRef(committed);
  useEffect(() => {
    if (committed !== lastCommitted.current) {
      lastCommitted.current = committed;
      setValue(committed);
    }
  }, [committed]);

  function push(next: string) {
    const search = new URLSearchParams(params.toString());
    if (next.trim()) search.set(paramName, next.trim());
    else search.delete(paramName);
    lastCommitted.current = next.trim();
    startTransition(() => {
      router.replace(`${pathname}${search.toString() ? `?${search}` : ""}`, { scroll: false });
    });
  }

  function onChange(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => push(next), delay);
  }

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <div className="kit-filter-bar no-print">
      <div className="kit-search">
        <Icon name="search" />
        <input
          className="kit-input"
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // Enter commits immediately rather than waiting out the debounce.
            if (e.key === "Enter") {
              e.preventDefault();
              if (timer.current) clearTimeout(timer.current);
              push(value);
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          aria-label={placeholder}
        />
      </div>
      {children}
      <span className="kit-filter-note" aria-live="polite">
        {pending ? (
          <>
            <Icon name="search" /> Searching…
          </>
        ) : resultCount === undefined ? (
          <>
            <Icon name="filter" /> Live filter
          </>
        ) : (
          `${resultCount.toLocaleString()} ${resultNoun}${resultCount === 1 ? "" : "s"}`
        )}
      </span>
    </div>
  );
}

/**
 * A select that narrows a server-fetched list, sharing the same soft
 * navigation. One interaction rather than one per keystroke, so it commits
 * immediately with no debounce.
 */
export type SelectOption = string | { value: string; label: string };

export function ServerSelect({
  paramName,
  label,
  options,
  allLabel = "All",
}: {
  paramName: string;
  label: string;
  /** Plain strings where value and label are the same, or `{ value, label }`. */
  options: SelectOption[];
  /**
   * The leading "no choice" entry. Pass `null` where every option is a real
   * choice — a sort dropdown has no "All", and offering one would show the
   * default order twice under two different names.
   */
  allLabel?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const current = params.get(paramName) ?? "";

  return (
    <label className="kit-field">
      <span>{label}</span>
      <select
        className="kit-select"
        value={current}
        onChange={(e) => {
          const search = new URLSearchParams(params.toString());
          if (e.target.value) search.set(paramName, e.target.value);
          else search.delete(paramName);
          startTransition(() => {
            router.replace(`${pathname}${search.toString() ? `?${search}` : ""}`, { scroll: false });
          });
        }}
      >
        {allLabel === null ? null : <option value="">{allLabel}</option>}
        {options.map((o) => {
          const { value, label: text } = typeof o === "string" ? { value: o, label: o } : o;
          return (
            <option key={value} value={value}>
              {text}
            </option>
          );
        })}
      </select>
    </label>
  );
}

"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { Icon } from "./icons";

/**
 * The filter bar, split by what each control actually does.
 *
 * SEARCH and SORT are presentation over rows the page has already fetched, so
 * they are client state: typing filters what is on screen, and nothing is
 * refetched, re-rendered on the server, or pushed into the URL. That is the
 * whole point — the previous version submitted a GET form ~280ms after each
 * keystroke, which re-ran the Server Component tree, so every character cost a
 * full route render and the page visibly reloaded while the user typed.
 *
 * The DATE RANGE is different: it selects a different dataset, so it stays a
 * real form submission and stays in the URL, where it can be bookmarked and
 * shared. Mixing the two into one submit mechanism is what made search feel
 * like a page load.
 *
 * `useDeferredValue` keeps the input responsive while a long list re-filters:
 * React renders the keystroke immediately and the filtered list at a lower
 * priority, so the caret never lags behind the typing.
 */
export function ListControls({
  query,
  onQuery,
  placeholder = "Search",
  sort,
  sortValue,
  onSort,
  month,
  from,
  to,
  showDates = true,
  resultCount,
  resultNoun = "result",
}: {
  query: string;
  onQuery: (next: string) => void;
  placeholder?: string;
  sort?: { value: string; label: string }[];
  sortValue?: string;
  onSort?: (next: string) => void;
  month?: string;
  from?: string;
  to?: string;
  showDates?: boolean;
  /** Announced politely as the list narrows, so the change is not silent. */
  resultCount?: number;
  resultNoun?: string;
}) {
  return (
    <div className="kit-filter-bar no-print">
      {placeholder ? (
        <div className="kit-search">
          <Icon name="search" />
          <input
            className="kit-input"
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            aria-label={placeholder}
          />
        </div>
      ) : null}

      {showDates ? <DateRangeFields month={month} from={from} to={to} /> : null}

      {sort && sort.length > 1 && onSort ? (
        <label className="kit-field kit-sort">
          <span>Sort by</span>
          <select className="kit-select" value={sortValue ?? sort[0].value} onChange={(e) => onSort(e.target.value)}>
            {sort.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <span className="kit-filter-note" aria-live="polite">
        <Icon name="filter" />
        {resultCount === undefined
          ? "Instant filter"
          : `${resultCount.toLocaleString()} ${resultCount === 1 ? resultNoun : `${resultNoun}s`}`}
      </span>
    </div>
  );
}

/**
 * The date range, as its own form.
 *
 * A real form submission on purpose: a date change selects a DIFFERENT dataset,
 * so it belongs in the URL where it can be bookmarked and shared. That is the
 * one control on these bars that should navigate — mixing search into the same
 * submit is what made typing feel like a page load (v131).
 *
 * Extracted in v137 so the retailer list, which no longer uses ListControls,
 * gets the same markup rather than a second copy of it.
 */
export function DateRangeFields({ month, from, to }: { month?: string; from?: string; to?: string }) {
  return (
    <form className="kit-date-form">
      <label className="kit-field">
        <span>From</span>
        <input className="kit-input" type="date" name="from" defaultValue={from || (month ? `${month}-01` : "")} />
      </label>
      <label className="kit-field">
        <span>To</span>
        <input className="kit-input" type="date" name="to" defaultValue={to || ""} />
      </label>
      <button className="kit-btn is-secondary size-sm" type="submit">
        Apply dates
      </button>
    </form>
  );
}

/** The same form, wrapped in a bar of its own for pages with no ListControls. */
export function DateRangeForm(props: { month?: string; from?: string; to?: string }) {
  return (
    <div className="kit-filter-bar no-print">
      <DateRangeFields {...props} />
    </div>
  );
}

/**
 * Search + sort state for a list, with the query deferred.
 *
 * Returned `query` drives the input (so typing is never dropped) and
 * `deferredQuery` drives the filtering (so a 3,000-row list does not block the
 * keystroke).
 */
export function useListControls(initialSort?: string) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(initialSort ?? "");
  const deferredQuery = useDeferredValue(query);
  // A date change replaces the rows underneath us; the sort the user picked
  // still applies, but a stale sort key from a previous page should not.
  useEffect(() => {
    if (initialSort && !sort) setSort(initialSort);
  }, [initialSort, sort]);
  return {
    query,
    setQuery,
    deferredQuery: deferredQuery.trim().toLowerCase(),
    sort,
    setSort,
  };
}

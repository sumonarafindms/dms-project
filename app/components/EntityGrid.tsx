"use client";

/**
 * A searchable, sortable grid of EntityCards.
 *
 * Every "who is behind target" screen is this shape — supervisors, RSOs, BPs —
 * so the search box, the order and the empty state live here once. The page
 * fetches and scopes the rows; this only ever filters what it was handed, so
 * client-side filtering cannot widen anyone's access.
 *
 * Search and sort are local state: they rearrange rows already on the screen.
 * Only the date range navigates, because only the date range changes the data.
 */

import { useMemo } from "react";
import { ListControls, useListControls } from "./ListControls";
import { matchesTokens } from "../../lib/text-search";
import { Card, EmptyState, EntityCard } from "./Kit";
import { Icon } from "./icons";
import { activeSort, applySort, byNumberAsc, byNumberDesc, byText, sortOptions, type SortSpec } from "../../lib/sort";

/** One card. `search` is the text this row matches on; `sortKeys` its numbers. */
export type EntityRow = {
  id: string;
  href: string;
  eyebrow: string;
  name: string;
  code: string;
  percent: number;
  metrics: { label: string; achieved: number; target: number; unit?: string }[];
  search: string;
  sortKeys: Record<string, number>;
};

/** What a page declares: which numeric keys its rows carry, and their labels. */
export type EntitySortField = { key: string; label: string; bothWays?: boolean };

/**
 * Orders built from the row's own `sortKeys`, so one component serves every
 * entity type.
 *
 * Built HERE, on the client, from a plain description the page passes as a
 * prop. Comparators are functions, and functions cannot cross the
 * Server-to-Client boundary — an earlier draft exported this for pages to call
 * and the build failed with "Attempted to call entitySorts() from the server".
 */
function entitySorts(keys: EntitySortField[]): SortSpec<EntityRow>[] {
  const specs: SortSpec<EntityRow>[] = [];
  for (const k of keys) {
    specs.push({
      value: `${k.key}-desc`,
      label: `${k.label} — high to low`,
      compare: byNumberDesc(
        (r) => r.sortKeys[k.key] ?? 0,
        (r) => r.name,
      ),
    });
    if (k.bothWays !== false)
      specs.push({
        value: `${k.key}-asc`,
        label: `${k.label} — low to high`,
        compare: byNumberAsc(
          (r) => r.sortKeys[k.key] ?? 0,
          (r) => r.name,
        ),
      });
  }
  specs.push({ value: "name-asc", label: "Name — A to Z", compare: (a, b) => byText(a.name, b.name) });
  return specs;
}

export function EntityGrid({
  rows,
  sortFields,
  placeholder,
  noun,
  month,
  from,
  to,
  emptyTitle,
  emptyHint,
}: {
  rows: EntityRow[];
  sortFields: EntitySortField[];
  placeholder: string;
  noun: string;
  month?: string;
  from?: string;
  to?: string;
  emptyTitle: string;
  emptyHint?: string;
}) {
  const sorts = useMemo(() => entitySorts(sortFields), [sortFields]);
  const { query, setQuery, deferredQuery, sort, setSort } = useListControls(sorts[0].value);

  const shown = useMemo(
    () =>
      applySort(
        rows.filter((r) => matchesTokens(r.search, deferredQuery)),
        sorts,
        sort,
      ),
    [rows, deferredQuery, sort, sorts],
  );

  return (
    <>
      <ListControls
        query={query}
        onQuery={setQuery}
        placeholder={placeholder}
        sort={sortOptions(sorts)}
        sortValue={sort}
        onSort={setSort}
        month={month}
        from={from}
        to={to}
        resultCount={shown.length}
        resultNoun={noun}
      />
      <p className="kit-list-caption">
        {shown.length.toLocaleString()} {shown.length === 1 ? noun : `${noun}s`} · sorted by{" "}
        {activeSort(sorts, sort).label}
      </p>
      {shown.length ? (
        <div className="kit-card-grid">
          {shown.map((r) => (
            <EntityCard
              key={r.id}
              href={r.href}
              eyebrow={r.eyebrow}
              name={r.name}
              code={r.code}
              percent={r.percent}
              metrics={r.metrics}
            />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            title={deferredQuery ? `No ${noun} matches “${query.trim()}”` : emptyTitle}
            hint={deferredQuery ? "Clear the search to see the whole list." : emptyHint}
            icon={<Icon name="search" />}
          />
        </Card>
      )}
    </>
  );
}

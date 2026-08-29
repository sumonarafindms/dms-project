"use client";

/**
 * The BP assignment list, with instant search and sort.
 *
 * Split out of BpActivationListView so the query stays on the server and only
 * the rendering runs in the browser: typing filters rows that are already
 * here, instead of re-running the page.
 *
 * Dates arrive as ISO strings, not Date objects — a Date survives the
 * server/client boundary, but every consumer here only formats it, and strings
 * keep the row shape obviously serialisable.
 */

import { useMemo } from "react";
import { ListControls, useListControls } from "./ListControls";
import { matchesTokens } from "../../lib/text-search";
import { Icon } from "./icons";
import { Badge, Card, EmptyState, Row, SectionHead } from "./Kit";
import { activeSort, applySort, type SortSpec } from "../../lib/sort";
import { byNumberAsc, byNumberDesc, byText, sortOptions } from "../../lib/sort";

export type BpListRow = {
  id: string;
  active: boolean;
  gaTarget: number;
  monthGa: number;
  startDate: string;
  endDate: string | null;
  retailerCode: string;
  retailerName: string;
  rsoName: string;
  supervisorName: string;
};

const label = (b: BpListRow) => b.retailerName || b.retailerCode;
const pctOf = (b: BpListRow) => (b.gaTarget > 0 ? Math.round((b.monthGa / b.gaTarget) * 100) : 0);

/** Mirrors lib/bp-sort.ts, over the serialised row this list receives. */
const SORTS: SortSpec<BpListRow>[] = [
  {
    value: "active-first",
    label: "Active first, then newest",
    compare: (a, b) => Number(b.active) - Number(a.active) || b.startDate.localeCompare(a.startDate),
  },
  { value: "ga-desc", label: "SIM sales — high to low", compare: byNumberDesc((b) => b.monthGa, label) },
  { value: "ga-asc", label: "SIM sales — low to high", compare: byNumberAsc((b) => b.monthGa, label) },
  { value: "pct-desc", label: "GA target % — high to low", compare: byNumberDesc(pctOf, label) },
  { value: "pct-asc", label: "GA target % — low to high", compare: byNumberAsc(pctOf, label) },
  { value: "target-desc", label: "GA target — high to low", compare: byNumberDesc((b) => b.gaTarget, label) },
  { value: "name-asc", label: "BP name — A to Z", compare: (a, b) => byText(label(a), label(b)) },
  { value: "code-asc", label: "BP code — A to Z", compare: (a, b) => byText(a.retailerCode, b.retailerCode) },
  {
    value: "rso-asc",
    label: "RSO — A to Z",
    compare: (a, b) => byText(a.rsoName, b.rsoName) || byText(label(a), label(b)),
  },
  { value: "start-desc", label: "Assigned — newest first", compare: (a, b) => b.startDate.localeCompare(a.startDate) },
  { value: "start-asc", label: "Assigned — oldest first", compare: (a, b) => a.startDate.localeCompare(b.startDate) },
];

const haystack = (b: BpListRow) => `${b.retailerCode} ${b.retailerName} ${b.rsoName} ${b.supervisorName}`.toLowerCase();

export function BpAssignmentList({
  rows,
  basePath,
  range,
  month,
  from,
  to,
}: {
  rows: BpListRow[];
  basePath: string;
  range: string;
  month: string;
  from?: string;
  to?: string;
}) {
  const { query, setQuery, deferredQuery, sort, setSort } = useListControls(SORTS[0].value);

  const shown = useMemo(
    () =>
      applySort(
        rows.filter((b) => matchesTokens(haystack(b), deferredQuery)),
        SORTS,
        sort,
      ),
    [rows, deferredQuery, sort],
  );

  return (
    <>
      <ListControls
        query={query}
        onQuery={setQuery}
        placeholder="Search BP code, BP name or RSO"
        sort={sortOptions(SORTS)}
        sortValue={sort}
        onSort={setSort}
        month={month}
        from={from}
        to={to}
        resultCount={shown.length}
        resultNoun="assignment"
      />
      <SectionHead
        title={`${shown.length} BP ${shown.length === 1 ? "assignment" : "assignments"}`}
        sub={`Sorted by ${activeSort(SORTS, sort).label}.`}
      />
      <Card padded>
        {shown.length ? (
          <div className="kit-rows">
            {shown.map((a) => (
              <Row
                key={a.id}
                href={`${basePath}/${a.id}?${range}`}
                avatar={a.retailerName || a.retailerCode}
                title={a.retailerName || a.retailerCode}
                sub={`${a.retailerCode} · RSO ${a.rsoName}${a.supervisorName ? ` · ${a.supervisorName}` : ""}`}
                detail={`${a.startDate} → ${a.endDate || "current"}`}
                // Wrapped in .kit-row-actions so the mobile rule moves it to
                // its own line; a bare badge stays inline and squeezes the BP
                // name to an ellipsis on a phone.
                after={
                  <div className="kit-row-actions">
                    <Badge tone={a.active ? "active" : "neutral"}>{a.active ? "Active" : "History"}</Badge>
                  </div>
                }
                value={a.monthGa}
                valueSub="GA"
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title={deferredQuery ? `No BP matches “${query.trim()}”` : "No BP assignment found"}
            hint={
              deferredQuery
                ? "Clear the search to see every assignment in this period."
                : "Nothing was assigned in this period. Try another date range."
            }
            icon={<Icon name={deferredQuery ? "search" : "sim"} />}
          />
        )}
      </Card>
    </>
  );
}

"use client";

/**
 * The BP's own SIM activation history, with instant search.
 *
 * A BP looks up a specific serial constantly — "did this SIM go through?" —
 * so the search has to answer while they type rather than after a page load.
 * The rows are already here; the query never leaves the browser.
 */

import { useMemo } from "react";
import { ListControls, useListControls } from "./ListControls";
import { matchesTokens } from "../../lib/text-search";
import { Icon } from "./icons";
import { Card, EmptyState, Row, SectionHead } from "./Kit";

export type SimRow = {
  simNo: string;
  date: string;
  time: string;
  price: number;
  category: string;
};

export function SimActivationList({
  rows,
  month,
  from,
  to,
  capped = false,
  title = "SIM activations",
}: {
  rows: SimRow[];
  month: string;
  from?: string;
  to?: string;
  /** True when the server hit its row cap, so the search covers a window. */
  capped?: boolean;
  /** Section heading, so a BP page and an admin page can each name it. */
  title?: string;
}) {
  const { query, setQuery, deferredQuery } = useListControls();
  const shown = useMemo(
    () => rows.filter((r) => matchesTokens(r.simNo.toLowerCase(), deferredQuery)),
    [rows, deferredQuery],
  );

  return (
    <>
      <ListControls
        query={query}
        onQuery={setQuery}
        placeholder="Search SIM serial"
        month={month}
        from={from}
        to={to}
        resultCount={shown.length}
        resultNoun="activation"
      />
      <SectionHead
        title={title}
        sub={
          capped
            ? `Newest ${rows.length} inside your BP assignment and the selected dates — narrow the date range to search further back.`
            : "Only records inside your BP assignment and the selected date range."
        }
      />
      <Card padded>
        {shown.length ? (
          <div className="kit-rows">
            {shown.map((x) => (
              <Row
                key={x.simNo}
                icon={<Icon name="sim" />}
                title={`SIM ${x.simNo}`}
                sub={`${x.date}${x.time ? ` · ${x.time}` : ""}`}
                value={`৳${x.price}`}
                valueSub={x.category}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title={deferredQuery ? `No SIM matches “${query.trim()}”` : "No GA found"}
            hint={deferredQuery ? "Clear the search to see every activation." : "Change the date range."}
            icon={<Icon name="search" />}
          />
        )}
      </Card>
    </>
  );
}

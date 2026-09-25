"use client";

/**
 * v206 — the Collection dashboard's screen. The figures come whole from
 * lib/collections.ts; this sorts, searches and draws them.
 */

import { useMemo, useState } from "react";
import { fmtDate, fmtMoney } from "@/lib/format";
import { HOLDER_TYPE_LABEL } from "@/lib/stock";
import { matchesTokens } from "@/lib/text-search";
import type { CollectionRow, Collections } from "@/lib/collections-types";
import { AppLink } from "./AppLink";
import { Badge, Card, EmptyState, SectionHead } from "./Kit";
import { Icon } from "./icons";
import { CollectionChart } from "./CollectionChart";

type Sort = "collected" | "closing" | "rate" | "silent";
const SORTS: { key: Sort; label: string }[] = [
  { key: "collected", label: "Most collected" },
  { key: "closing", label: "Biggest due at the end" },
  { key: "rate", label: "Lowest collection rate" },
  { key: "silent", label: "Took goods, paid nothing" },
];

/** A rate is coloured by what it means for the money, never painted green just for being high. */
const rateTone = (r: number | null) => (r === null ? "neutral" : r >= 90 ? "success" : r >= 60 ? "pending" : "failed");

export function CollectionsView({ data }: { data: Collections }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("collected");

  const active = useMemo(
    () => data.rows.filter((r) => r.given || r.returned || r.collected || r.broughtForward),
    [data.rows],
  );
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = active.filter(
      (r) =>
        (sort !== "silent" || (r.given > 0 && r.collected === 0)) &&
        (!needle || matchesTokens(`${r.name} ${r.code ?? ""} ${r.supervisorName ?? ""}`.toLowerCase(), needle, "")),
    );
    const by: Record<Sort, (a: CollectionRow, b: CollectionRow) => number> = {
      collected: (a, b) => b.collected - a.collected || a.name.localeCompare(b.name),
      closing: (a, b) => b.closing - a.closing,
      rate: (a, b) => (a.rate ?? 1e9) - (b.rate ?? 1e9) || b.given - a.given,
      silent: (a, b) => b.given - a.given,
    };
    return [...list].sort(by[sort]);
  }, [active, q, sort]);

  const top = useMemo(
    () =>
      active
        .filter((r) => r.collected > 0)
        .sort((a, b) => b.collected - a.collected)
        .slice(0, 5),
    [active],
  );
  const silent = active.filter((r) => r.given > 0 && r.collected === 0);
  const best = data.days.reduce(
    (a, d) => (d.collected > (a?.collected ?? 0) ? d : a),
    null as null | (typeof data.days)[number],
  );

  return (
    <>
      <Card className="kit-card-p kit-mb-16">
        <SectionHead
          title="Day by day"
          sub={`${fmtDate(data.from)} – ${fmtDate(data.to)}${best ? ` · best day for money: ${fmtDate(best.date)}, ${fmtMoney(best.collected)}` : ""}`}
        />
        {data.days.some((d) => d.given || d.collected) ? (
          <CollectionChart days={data.days} />
        ) : (
          <EmptyState
            title="Nothing moved yet"
            hint="The chart fills in as the month's entries are saved."
            icon={<Icon name="chart" />}
          />
        )}
        <details className="cc-table">
          <summary>Show as a table</summary>
          <div className="kit-table-wrap">
            <table className="kit-report-table" role="table">
              <thead>
                <tr role="row">
                  <th role="columnheader" scope="col">
                    Day
                  </th>
                  <th role="columnheader" scope="col" className="is-right">
                    Given
                  </th>
                  <th role="columnheader" scope="col" className="is-right">
                    Returned
                  </th>
                  <th role="columnheader" scope="col" className="is-right">
                    Collected
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.days
                  .filter((d) => d.given || d.returned || d.collected)
                  .map((d) => (
                    <tr role="row" key={d.date}>
                      <td role="cell" data-label="Day">
                        {fmtDate(d.date)}
                      </td>
                      <td role="cell" data-label="Given" className="is-right">
                        {fmtMoney(d.given)}
                      </td>
                      <td role="cell" data-label="Returned" className="is-right">
                        {fmtMoney(d.returned)}
                      </td>
                      <td role="cell" data-label="Collected" className="is-right">
                        {fmtMoney(d.collected)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      </Card>

      <div className="col-split kit-mb-16">
        <Card className="kit-card-p">
          <SectionHead title="Top collectors" sub="Most money brought in this month." />
          {top.length ? (
            <ol className="col-top">
              {top.map((r, i) => (
                <li key={r.key}>
                  <span className="col-top-rank">{i + 1}</span>
                  <span className="col-top-who">
                    <AppLink href={`/stock/${r.type}/${r.id}`}>{r.name}</AppLink>
                    <em>{[HOLDER_TYPE_LABEL[r.type], r.code].filter(Boolean).join(" · ")}</em>
                  </span>
                  <strong>{fmtMoney(r.collected)}</strong>
                </li>
              ))}
            </ol>
          ) : (
            <p className="cb-lines-empty">No money collected yet this month.</p>
          )}
        </Card>
        <Card className="kit-card-p">
          <SectionHead
            title="Took goods, paid nothing"
            sub="Given stock this month, and not one deposit since the 1st."
          />
          {silent.length ? (
            <ul className="col-top">
              {silent
                .sort((a, b) => b.given - a.given)
                .slice(0, 5)
                .map((r) => (
                  <li key={r.key}>
                    <span className="col-top-rank is-warn">!</span>
                    <span className="col-top-who">
                      <AppLink href={`/stock/${r.type}/${r.id}`}>{r.name}</AppLink>
                      <em>Given {fmtMoney(r.given)}</em>
                    </span>
                    <strong className="kit-due is-owing">{fmtMoney(r.closing)}</strong>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="cb-lines-empty">
              <Icon name="check" /> Everyone who took goods this month has paid something.
            </p>
          )}
        </Card>
      </div>

      <SectionHead title="Everyone" sub="Brought forward, this month's goods and money, and where each person ends." />
      <div className="rem-tools">
        <input
          className="kit-input rem-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a name or code"
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
      </div>
      {shown.length ? (
        <div className="kit-table-wrap">
          <table className="kit-report-table" role="table">
            <thead>
              <tr role="row">
                <th role="columnheader" scope="col">
                  Person
                </th>
                <th role="columnheader" scope="col" className="is-right">
                  Brought forward
                </th>
                <th role="columnheader" scope="col" className="is-right">
                  Given
                </th>
                <th role="columnheader" scope="col" className="is-right">
                  Returned
                </th>
                <th role="columnheader" scope="col" className="is-right">
                  Collected
                </th>
                <th role="columnheader" scope="col" className="is-right">
                  Rate
                </th>
                <th role="columnheader" scope="col" className="is-right">
                  Due at end
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr role="row" key={r.key}>
                  <td role="cell" data-label="Person">
                    <AppLink href={`/stock/${r.type}/${r.id}`} className="kit-row-link">
                      <strong>{r.name}</strong>
                    </AppLink>
                    <span className="kit-cell-sub">
                      {[HOLDER_TYPE_LABEL[r.type], r.code, r.supervisorName].filter(Boolean).join(" · ")}
                      {r.lastPaid ? ` · last paid ${fmtDate(r.lastPaid)}` : ""}
                    </span>
                  </td>
                  <td role="cell" data-label="Brought forward" className="is-right">
                    {fmtMoney(r.broughtForward)}
                  </td>
                  <td role="cell" data-label="Given" className="is-right">
                    {fmtMoney(r.given)}
                  </td>
                  <td role="cell" data-label="Returned" className="is-right">
                    {fmtMoney(r.returned)}
                  </td>
                  <td role="cell" data-label="Collected" className="is-right">
                    {fmtMoney(r.collected)}
                  </td>
                  <td role="cell" data-label="Rate" className="is-right">
                    {r.rate === null ? "—" : <Badge tone={rateTone(r.rate)}>{r.rate}%</Badge>}
                  </td>
                  <td role="cell" data-label="Due at end" className="is-right">
                    <span className={`kit-due is-${r.closing > 0 ? "owing" : r.closing < 0 ? "over" : "clear"}`}>
                      {fmtMoney(Math.abs(r.closing))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Card padded>
          <EmptyState
            title={active.length ? "Nobody matches" : "Nothing this month yet"}
            hint={
              active.length ? "Try another name, or another sort." : "Goods and money appear here as they are entered."
            }
            icon={<Icon name="users" />}
          />
        </Card>
      )}
    </>
  );
}

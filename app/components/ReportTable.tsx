/**
 * The report table — a SERVER component, and that is the whole point.
 *
 * ## The bug this file exists to fix
 *
 * It used to live in ReportShell.tsx, next to the date bar and the export
 * buttons, under that file's `"use client"`. Those two need the client: they
 * hold state, read the URL and call `window.print()`. This table needs none of
 * it — no hook, no event handler, no browser API. It was a Client Component by
 * association with its neighbours in one file.
 *
 * That association was fatal, because a `Column` carries a `render` function:
 *
 *     { key: "value", label: "C2C Value", render: (r) => money(r.value) }
 *
 * Every report page is a Server Component and builds its columns there. Passing
 * them into a client component means passing FUNCTIONS across the RSC boundary,
 * which React refuses:
 *
 *     Functions cannot be passed directly to Client Components unless you
 *     explicitly expose it by marking it with "use server".
 *
 * So every single report — Daily, Activation, SSO, LSO, C2C, C2S, Low C2S, OB,
 * Target, Custom and all four performance reports — answered 500 and showed
 * "We couldn't load this page." The Reporting Center's index still rendered,
 * because it has no table; only the reports themselves were dead.
 *
 * ## Why the fix is a file move rather than a rewrite
 *
 * The columns are not the problem. A render function is the right way to say
 * "this cell is money" and it costs nothing when both sides are on the server.
 * The only thing that was wrong was which side of the boundary this component
 * sat on, and a file is what decides that in the App Router.
 *
 * Keep it that way: do NOT add `"use client"` here, and do not move this back
 * in beside a component that needs it. It renders `Card`, `EmptyState` and
 * `Icon`, and a Server Component may render those freely.
 */

import type { ReactNode } from "react";
import { Card, EmptyState } from "./Kit";
import { Icon } from "./icons";

export type Column<T> = {
  key: string;
  label: string;
  align?: "right";
  render?: (row: T) => ReactNode;
};

export function ReportTable<T extends { id?: string }>({
  columns,
  rows,
  emptyTitle = "No data for this period",
  emptyHint,
}: {
  columns: Column<T>[];
  rows: T[];
  emptyTitle?: string;
  emptyHint?: string;
}) {
  if (!rows.length) {
    return (
      <Card>
        <EmptyState title={emptyTitle} hint={emptyHint} icon={<Icon name="search" />} />
      </Card>
    );
  }
  const cell = (c: Column<T>, row: T) =>
    c.render ? c.render(row) : ((row as Record<string, ReactNode>)[c.key] ?? "—");

  return (
    <>
      <Card className="kit-report-table">
        <div className="kit-report-scroll">
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={c.align === "right" ? "is-right" : undefined}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.id ?? i}>
                  {columns.map((c) => (
                    <td key={c.key} className={c.align === "right" ? "is-right" : undefined}>
                      {cell(c, row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="kit-report-cards">
        {rows.map((row, i) => (
          <Card key={row.id ?? i} padded>
            {columns.map((c) => (
              <div className="kit-report-cardrow" key={c.key}>
                <span>{c.label}</span>
                <b>{cell(c, row)}</b>
              </div>
            ))}
          </Card>
        ))}
      </div>
    </>
  );
}

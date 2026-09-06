"use client";

/**
 * Reporting Center chrome: the date bar, the Excel/Print/Copy action bar, and
 * the report table.
 *
 * Two things here differ deliberately from the IT demo:
 *
 * 1. The range lives in the URL (?from=&to=), not in React state. Report links
 *    are pasted into chat and bookmarked, and a range held in state produces a
 *    link that opens on a different period than the one the sender was looking
 *    at. It also means the server component can do the aggregation, so a long
 *    range does not ship every row to the browser to be summed.
 *
 * 2. Export Excel is a link to `/api/reports/export`, not a click handler. The
 *    workbook is built on the server from `lib/report-builders.ts`, so `xlsx`
 *    is not in the browser bundle at all and the page does not have to carry
 *    every row of the report for a button most viewings never press. See
 *    ReportActionBar below.
 *
 * The report TABLE is deliberately not here — see ./ReportTable. It has no
 * hooks and no browser API, and living in this file made it a Client Component
 * purely by association, which broke every report page.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Btn, LinkBtn } from "./Kit";
import { Icon } from "./icons";
import { rangeDayCount, rangeLabel, rangePresets } from "../../lib/report-range";
import type { ReportRange } from "../../lib/report-range";

/* ------------------------------------------------------------------ *
 * Date bar
 * ------------------------------------------------------------------ */
export function ReportDateBar({ range }: { range: ReportRange }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function apply(next: ReportRange) {
    const q = new URLSearchParams(params.toString());
    q.set("from", next.from);
    q.set("to", next.to);
    startTransition(() => router.replace(`?${q.toString()}`, { scroll: false }));
  }

  // No min/max on these inputs. A native date input reports "" for any value a
  // min/max rejects, which reads to the user as a dead picker — the GA page bug
  // in claude/v102. Out-of-order dates are swapped in resolveRange() instead.
  const setFrom = (v: string) => v && apply({ from: v, to: v > range.to ? v : range.to });
  const setTo = (v: string) => v && apply({ from: v < range.from ? v : range.from, to: v });

  const presets = rangePresets();
  const active = presets.find((p) => p.range.from === range.from && p.range.to === range.to);
  const days = rangeDayCount(range);

  return (
    <div className="kit-report-datebar no-print" aria-busy={pending}>
      <div className="kit-report-dates">
        <label className="kit-field">
          <span>From</span>
          <input className="kit-input" type="date" value={range.from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="kit-field">
          <span>To</span>
          <input className="kit-input" type="date" value={range.to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      <div className="kit-report-presets">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            className={`kit-preset${active?.label === p.label ? " is-active" : ""}`}
            onClick={() => apply(p.range)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="kit-report-period">
        Report Period: <b>{rangeLabel(range)}</b> ({days} day{days === 1 ? "" : "s"})
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Action bar
 * ------------------------------------------------------------------ */
export type { ExportRow } from "../../lib/report-builders";

/**
 * Export, Print and Copy Summary.
 *
 * ## Export is a link now, not a click handler
 *
 * It used to receive every row of the report as a prop and build the workbook
 * with a dynamically imported `xlsx`. That put the entire report in the page's
 * RSC payload on every load — measured at 1,018,255 bytes for the retailer
 * performance report — for a button most viewings never press, and it put
 * ~400 KB of spreadsheet library in the browser to format numbers the server
 * already had.
 *
 * Now the server builds it at `/api/reports/export` and this is an anchor to
 * that URL. Three consequences worth knowing:
 *
 * - **The download is the whole report, not the page being viewed.** The href
 *   deliberately carries no `page` parameter. Sixty rows on screen, every row
 *   in the file.
 * - There is no `busy` state to show, because the browser owns the download.
 * - It is a plain navigation rather than a `blob:` URL, which is one fewer
 *   thing the Content-Security-Policy has to allow.
 */
export function ReportActionBar({
  exportHref,
  rowCount,
  summary,
}: {
  /** `/api/reports/export?report=…` — every parameter except `page`. */
  exportHref: string;
  /** Rows in the whole report. Zero disables the button. */
  rowCount: number;
  /** Plain-text block for Copy Summary. Omit to hide the button. */
  summary?: string;
}) {
  const [copyOpen, setCopyOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Clipboard permission varies by browser and context, so the textarea
  // fallback is not optional — it is the path that always works.
  async function copySummary() {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyOpen(true);
    }
  }

  return (
    <>
      <div className="kit-report-actions no-print">
        {/* `external`: a plain <a>, so the browser follows the attachment response
            instead of next/link trying to client-route to an API route. */}
        <LinkBtn variant="secondary" size="sm" href={rowCount ? exportHref : "#"} disabled={!rowCount} external>
          <Icon name="download" /> Export Excel
        </LinkBtn>
        <Btn variant="secondary" size="sm" onClick={() => window.print()}>
          <Icon name="file" /> Print
        </Btn>
        {summary && (
          <Btn variant="secondary" size="sm" onClick={copySummary}>
            <Icon name="check" /> {copied ? "Copied" : "Copy Summary"}
          </Btn>
        )}
      </div>
      {copyOpen && summary && (
        <div className="kit-scrim no-print" onClick={() => setCopyOpen(false)}>
          <div className="kit-copy-box" onClick={(e) => e.stopPropagation()}>
            <p className="kit-label">Select and copy</p>
            <textarea readOnly value={summary} rows={10} className="kit-input" />
            <Btn variant="secondary" size="sm" onClick={() => setCopyOpen(false)}>
              Close
            </Btn>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

/**
 * v206 — goods out vs money in, one pair of columns per day.
 *
 * Two series on ONE money axis (both are taka, so there is no second scale to
 * invent). Given is sky, collected is brand orange — the pair was checked with
 * the dataviz validator for colour-blind separation (protan ΔE 22.8). The
 * legend is always shown, a hover or tap names the day's two figures, and
 * the same numbers are in the table under the chart, so nothing depends on
 * colour or on hovering.
 */

import { useEffect, useRef, useState } from "react";
import { fmtMoney } from "@/lib/format";
import type { CollectionDay } from "@/lib/collections-types";
import { niceMax } from "@/lib/collections-rate";

const H = 160;
const PAD_TOP = 8;
/** The narrowest a day's slot may get before the plot scrolls sideways instead. */
const MIN_COL = 16;

const short = (n: number) =>
  n >= 1e7
    ? `${(n / 1e7).toFixed(n >= 1e8 ? 0 : 1)}Cr`
    : n >= 1e5
      ? `${(n / 1e5).toFixed(n >= 1e6 ? 0 : 1)}L`
      : n >= 1e3
        ? `${Math.round(n / 1e3)}K`
        : String(Math.round(n));

/** A column with a 4px rounded top and a square foot on the baseline. */
function column(x: number, y: number, w: number, h: number) {
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function CollectionChart({ days }: { days: CollectionDay[] }) {
  const [hover, setHover] = useState<number | null>(null);
  /*
   * Drawn in real pixels at the width it is given, so the day labels stay at
   * their own size: a viewBox scaled to fit shrank them to 6px on a phone.
   * Below MIN_COL per day the plot keeps its width and scrolls inside itself.
   */
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(1, Math.floor(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const n = Math.max(days.length, 1);
  const COL = Math.max(MIN_COL, width / n);
  // Each column thin (capped at 12px), with a 2px surface gap inside the pair and air to the next day.
  const BAR = Math.max(4, Math.min(12, (COL - 6) / 2));
  const W = Math.round(n * COL);
  const top = niceMax(Math.max(0, ...days.map((d) => Math.max(d.given, d.collected))));
  const y = (v: number) => PAD_TOP + (H - PAD_TOP) * (1 - v / top);
  const ticks = [0, top / 2, top];
  const h = hover === null ? null : days[hover];

  return (
    <figure className="cc-chart" aria-label="Goods given and money collected, per day">
      <div className="cc-legend">
        <span>
          <i className="cc-key is-given" aria-hidden="true" /> Given (goods out)
        </span>
        <span>
          <i className="cc-key is-collected" aria-hidden="true" /> Collected (cash + bank)
        </span>
      </div>
      <div className="cc-plot">
        <div className="cc-axis" aria-hidden="true">
          {ticks
            .slice()
            .reverse()
            .map((t) => (
              <span key={t} style={{ top: `${(y(t) / (H + 18)) * 100}%` }}>
                ৳{short(t)}
              </span>
            ))}
        </div>
        <div className="cc-scroll" ref={box}>
          <svg
            width={W}
            height={H + 18}
            viewBox={`0 0 ${W} ${H + 18}`}
            role="img"
            aria-hidden="true"
            onMouseLeave={() => setHover(null)}
          >
            {ticks.map((t) => (
              <line key={t} className="cc-grid" x1={0} x2={W} y1={y(t)} y2={y(t)} />
            ))}
            {days.map((d, i) => {
              const x = i * COL + (COL - BAR * 2 - 2) / 2;
              return (
                <g key={d.date} className={hover === i ? "is-hover" : undefined}>
                  <path className="cc-bar is-given" d={column(x, y(d.given), BAR, H - y(d.given))} />
                  {/* 2px surface gap between the pair */}
                  <path
                    className="cc-bar is-collected"
                    d={column(x + BAR + 2, y(d.collected), BAR, H - y(d.collected))}
                  />
                  {i % (COL < 22 ? 5 : 3) === 0 || i === days.length - 1 ? (
                    <text className="cc-day" x={i * COL + COL / 2} y={H + 13} textAnchor="middle">
                      {d.date.slice(8, 10)}
                    </text>
                  ) : null}
                  {/* The hit target: the whole day's slot, far bigger than two thin columns. */}
                  <rect
                    x={i * COL}
                    y={0}
                    width={COL}
                    height={H}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onClick={() => setHover(hover === i ? null : i)}
                  />
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      <figcaption className="cc-tip" aria-live="polite">
        {h ? (
          <>
            <strong>
              {h.date.slice(8, 10)}/{h.date.slice(5, 7)}
            </strong>
            <span>
              <i className="cc-key is-given" aria-hidden="true" /> Given {fmtMoney(h.given)}
            </span>
            <span>
              <i className="cc-key is-collected" aria-hidden="true" /> Collected {fmtMoney(h.collected)}
            </span>
            {h.returned ? <span>Returned {fmtMoney(h.returned)}</span> : null}
          </>
        ) : (
          <span className="cc-tip-hint">Point at a day, or tap it, to see its figures.</span>
        )}
      </figcaption>
    </figure>
  );
}

/**
 * Role-UI kit components.
 *
 * The React half of styles/kit.css — one component per atom in the six
 * approved demo files, with the same props those demos use. Every new role
 * page composes these instead of inventing markup, which is what keeps the
 * six roles looking like one product.
 *
 * Colour is never chosen here. A percentage goes through targetBand() in
 * lib/achievement.ts and comes back as "achieved" | "near" | "behind"; that
 * string becomes a `band-*` class and CSS does the rest. Adding a colour
 * decision to this file would put the 80% threshold in a second place.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { TARGET_BAND_LABEL, targetBand, targetPercent } from "../../lib/achievement";
import type { TargetBand } from "../../lib/achievement";
import { perDayLabel, riskTone } from "../../lib/pacing";
import { COMPARISON_KINDS, COMPARISON_KIND_LABEL, changeLabel, changeTone } from "../../lib/comparison";
import type { ComparisonKind } from "../../lib/comparison";
import type { MetricComparison } from "../../lib/comparison-data";
import type { Pacing } from "../../lib/pacing";

export const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-US");
export { targetPercent as pct };

/* ------------------------------------------------------------------ *
 * Ring — the signature element, used wherever achievement % is shown
 * ------------------------------------------------------------------ */
export function Ring({ value, size = 46, stroke = 5 }: { value: number; size?: number; stroke?: number }) {
  // The arc is clamped to one full turn; the label is not. Printing the
  // clamped number turned a real 112% into "100%", which reads as "exactly on
  // target" and contradicts the 117% shown on the bar right beside it.
  const shown = Math.max(0, Math.round(value));
  const p = Math.min(shown, 100);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <div
      className={`kit-ring band-${targetBand(value)}`}
      style={
        {
          "--kit-ring-size": `${size}px`,
          "--kit-ring-font": `${Math.max(10, size / 4)}px`,
        } as React.CSSProperties
      }
      role="img"
      aria-label={`${shown}% of target`}
    >
      <svg width={size} height={size} aria-hidden="true">
        <circle className="kit-ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle
          className="kit-ring-value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (p / 100) * circumference}
        />
      </svg>
      <span aria-hidden="true">{shown}%</span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Bars
 * ------------------------------------------------------------------ */
export function Bar({ value, thin }: { value: number; thin?: boolean }) {
  return (
    <div className={`kit-bar band-${targetBand(value)}${thin ? " is-thin" : ""}`}>
      <i style={{ width: `${Math.max(0, Math.min(value, 100))}%` }} />
    </div>
  );
}

export function MetricBar({
  label,
  achieved,
  target,
  unit = "",
}: {
  label: string;
  achieved: number;
  target: number;
  unit?: string;
}) {
  const p = targetPercent(achieved, target);
  const band = targetBand(p);
  return (
    <div>
      <div className="kit-metric-head">
        <span className="kit-label">{label}</span>
        <span className="kit-metric-value">
          {/* The unit goes in FRONT and the figure is rounded, matching
              KpiCard. These two sit on the same screens, and until now one
              printed "৳6,478,558" while the other printed "6,478,558.37৳" for
              the very same number. Taka is a prefix currency, and money on a
              performance card is never shown to the paisa. */}
          <b>
            {unit}
            {fmt(Math.round(achieved))}
          </b>
          <span>
            {" "}
            / {unit}
            {fmt(Math.round(target))}
          </span>
          <em className={`band-${band}`}>{p}%</em>
        </span>
      </div>
      <Bar value={p} />
    </div>
  );
}

/** A completion line (SSO/LSO): progress toward a required count, not a percentage of target. */
export function ProgressLine({
  label,
  current,
  target,
  unit = "",
}: {
  label: string;
  current: number;
  target: number;
  unit?: string;
}) {
  const p = targetPercent(current, target);
  return (
    <div>
      <div className="kit-metric-head">
        <span className="kit-label">{label}</span>
        <span className="kit-metric-value">
          <b>
            {unit}
            {current} / {unit}
            {target}
          </b>
        </span>
      </div>
      <Bar value={current >= target ? 100 : Math.min(p, 99)} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Badges
 * ------------------------------------------------------------------ */
export type BadgeTone =
  | TargetBand
  | "active"
  | "inactive"
  | "success"
  | "failed"
  | "processing"
  | "complete"
  | "pending"
  | "online"
  | "loggedout"
  | "neutral";

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`kit-badge tone-${tone}`}>{children}</span>;
}

/** Badge for an achievement percentage, labelled the way the demos label it. */
export function StatusBadge({ percent }: { percent: number }) {
  const band = targetBand(percent);
  return <Badge tone={band}>{TARGET_BAND_LABEL[band]}</Badge>;
}

/* ------------------------------------------------------------------ *
 * Buttons, inputs
 * ------------------------------------------------------------------ */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  block?: boolean;
};

export function Btn({ variant = "primary", size = "md", block, className = "", ...props }: BtnProps) {
  return (
    <button
      {...props}
      className={`kit-btn is-${variant} size-${size}${block ? " is-block" : ""} ${className}`.trim()}
    />
  );
}

export function StatPill({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="kit-stat-pill">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Layout pieces
 * ------------------------------------------------------------------ */
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="kit-page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({
  className = "",
  padded,
  clickable,
  style,
  children,
}: {
  className?: string;
  padded?: boolean | "lg";
  clickable?: boolean;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  const pad = padded === "lg" ? " kit-card-p-lg" : padded ? " kit-card-p" : "";
  return (
    <div className={`kit-card${pad}${clickable ? " is-clickable" : ""} ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}

export function SummaryStrip({ items }: { items: { label: string; value: ReactNode; tone?: "teal" | "amber" }[] }) {
  return (
    <div className="kit-summary-strip">
      {items.map((it) => (
        <div className="kit-card" key={it.label}>
          <span className="kit-label">{it.label}</span>
          <strong className={it.tone ? `tone-${it.tone}` : undefined}>{it.value}</strong>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  positive,
  icon,
}: {
  title: string;
  hint?: string;
  positive?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div className={`kit-empty${positive ? " is-positive" : ""}`}>
      <div className="kit-empty-icon" aria-hidden="true">
        {icon}
      </div>
      <strong>{title}</strong>
      {hint && <p>{hint}</p>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`kit-skeleton ${className}`.trim()} aria-hidden="true" />;
}

export function SectionHead({ title, sub, link }: { title: string; sub?: string; link?: ReactNode }) {
  return (
    <div className="kit-section-head">
      <div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {link}
    </div>
  );
}

/** Navigation tile. `admin` switches the icon to the indigo identity accent. */
export function Tile({
  href,
  icon,
  title,
  sub,
  admin,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  sub?: string;
  admin?: boolean;
}) {
  return (
    <Link href={href} className={`kit-card is-clickable kit-tile${admin ? " is-admin" : ""}`}>
      <span className="kit-tile-icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <strong>{title}</strong>
        {sub && <span>{sub}</span>}
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------------ *
 * Role page patterns
 * ------------------------------------------------------------------ */

/** Centred ring with a status badge and a row of figures beneath. */
export function HeroRing({
  label,
  percent,
  figures,
}: {
  label: string;
  percent: number;
  figures: { label: string; value: ReactNode; tone?: "teal" | "amber" }[];
}) {
  return (
    <Card className="kit-hero-ring">
      <span className="kit-label">{label}</span>
      <Ring value={percent} size={104} stroke={9} />
      <StatusBadge percent={percent} />
      <div className="kit-hero-figures">
        {figures.map((f) => (
          <div key={f.label}>
            <strong className={f.tone ? `tone-${f.tone}` : undefined}>{f.value}</strong>
            <span>{f.label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Initials chip. Used wherever a list shows people rather than metrics. */
export function Avatar({ name }: { name: string }) {
  return (
    <span className="kit-avatar" aria-hidden="true">
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

/**
 * One record per line: icon, title + sub (+ detail), value + sub, and an
 * optional trailing slot.
 *
 * `href` turns the whole row into a link with a chevron — the directory shape
 * the admin screens use — rather than being a second near-identical component.
 */
export function Row({
  icon,
  avatar,
  title,
  sub,
  detail,
  value,
  valueSub,
  after,
  href,
}: {
  icon?: ReactNode;
  avatar?: string;
  title: ReactNode;
  sub?: ReactNode;
  detail?: ReactNode;
  value?: ReactNode;
  valueSub?: ReactNode;
  after?: ReactNode;
  href?: string;
}) {
  const body = (
    <>
      {avatar ? <Avatar name={avatar} /> : null}
      {!avatar && icon ? (
        <span className="kit-row-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <div className="kit-row-main">
        <strong>{title}</strong>
        {sub && <span>{sub}</span>}
        {detail && <small>{detail}</small>}
      </div>
      {(value !== undefined || valueSub) && (
        <div className="kit-row-value">
          {value !== undefined && <strong>{value}</strong>}
          {valueSub && <span>{valueSub}</span>}
        </div>
      )}
      {after}
      {href && (
        <span className="kit-row-chevron" aria-hidden="true">
          ›
        </span>
      )}
    </>
  );
  return href ? (
    <Link href={href} className="kit-row is-link">
      {body}
    </Link>
  ) : (
    <div className="kit-row">{body}</div>
  );
}

/* ------------------------------------------------------------------ *
 * Forms, dialogs and tables — the demos' SelectField / TextField /
 * Modal / SimpleTable, as classes
 * ------------------------------------------------------------------ */

/** Label above a control. The control itself carries .kit-input / .kit-select. */
export function Field({
  label,
  hint,
  wide,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`kit-field${wide ? " is-wide" : ""}`}>
      <span>
        {label}
        {hint && <em>{hint}</em>}
      </span>
      {children}
    </label>
  );
}

/** Centre dialog on desktop, bottom sheet on phones — as in every demo. */
export function Modal({
  title,
  sub,
  onClose,
  footer,
  labelledBy = "kit-modal-title",
  children,
}: {
  title: string;
  sub?: string;
  onClose: () => void;
  footer?: ReactNode;
  labelledBy?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="kit-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.currentTarget === e.target) onClose();
      }}
    >
      <section className="kit-modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <header className="kit-modal-head">
          <div>
            <h2 id={labelledBy}>{title}</h2>
            {sub && <p>{sub}</p>}
          </div>
          <button type="button" className="kit-icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="kit-modal-body">{children}</div>
        {footer && <footer className="kit-modal-foot">{footer}</footer>}
      </section>
    </div>
  );
}

/** A checkbox with its label, sized and coloured like the demos' accent-teal. */
export function Check({
  label,
  sub,
  checked,
  disabled,
  onChange,
}: {
  label?: ReactNode;
  sub?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="kit-check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {(label || sub) && (
        <span className="kit-check-copy">
          {label && <strong>{label}</strong>}
          {sub && <small>{sub}</small>}
        </span>
      )}
    </label>
  );
}

export type Column<T> = {
  key: string;
  label: string;
  align?: "right";
  render?: (row: T) => ReactNode;
};

/**
 * Table on desktop, one card per record below 640px — the demos' SimpleTable.
 * The same cells are rendered twice on purpose: a horizontally scrolling table
 * on a phone is the thing this project's own scroll hint exists to apologise
 * for.
 */
export function Table<T extends { id?: string }>({
  columns,
  rows,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  empty?: ReactNode;
}) {
  if (!rows.length) return <>{empty}</>;
  const cell = (c: Column<T>, r: T) => (c.render ? c.render(r) : ((r as Record<string, ReactNode>)[c.key] ?? null));
  return (
    <>
      <div className="kit-table-wrap">
        <table className="kit-table">
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
            {rows.map((r, i) => (
              <tr key={r.id || i}>
                {columns.map((c) => (
                  <td key={c.key} className={c.align === "right" ? "is-right" : undefined}>
                    {cell(c, r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="kit-table-cards">
        {rows.map((r, i) => (
          <div className="kit-card kit-card-p" key={r.id || i}>
            {columns.map((c) => (
              <div className="kit-table-cell" key={c.key}>
                <span>{c.label}</span>
                <div>{cell(c, r)}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

/** Target-vs-achievement tile: ring, value over target, bar, remaining. */
export function KpiCard({
  label,
  achieved,
  target,
  unit = "",
  pace,
}: {
  label: string;
  achieved: number;
  target: number;
  unit?: string;
  /**
   * Optional pacing, computed by the CALLER rather than here.
   *
   * `pacing()` reads the clock, and this file has no "use client", so a client
   * component importing KpiCard would evaluate it in the browser and could
   * disagree with the server across a day boundary. Passing the finished
   * object keeps the card pure and the clock read on the server, once.
   */
  pace?: Pacing;
}) {
  const p = targetPercent(achieved, target);
  return (
    <Card padded>
      <div className="kit-kpi-top">
        <div className="kit-kpi-meta">
          <span className="kit-label">{label}</span>
          <strong>
            {unit}
            {fmt(Math.round(achieved))}
          </strong>
          <span>
            of {unit}
            {fmt(Math.round(target))}
          </span>
        </div>
        <Ring value={p} size={40} stroke={4} />
      </div>
      <div className="kit-mt-10">
        <Bar value={p} thin />
      </div>
      <p className="kit-kpi-foot">
        Remaining:{" "}
        <b>
          {unit}
          {fmt(Math.max(0, Math.round(target - achieved)))}
        </b>
      </p>
      {pace && <PaceFoot pace={pace} unit={unit} />}
    </Card>
  );
}

/**
 * One period-over-period comparison: the figure, the change, and — always —
 * the two dates it was measured between.
 *
 * The dates are not decoration. Each metric anchors on the last day IT has
 * data for, so GA may be comparing the 29th while C2S compares the 28th.
 * Printing "Today" over that would be a false claim; printing the real dates
 * costs one line and is true.
 */
export function ComparisonCard({ item }: { item: MetricComparison }) {
  const c = item.comparison;
  const tone = changeTone(c);
  const money = (n: number) => `${item.unit}${fmt(Math.round(n))}`;
  return (
    <Card padded>
      <span className="kit-label">{item.label}</span>
      {item.windows ? (
        <>
          <div className="kit-compare-top">
            <strong>{money(c.current)}</strong>
            <span className={`kit-delta tone-${tone}`}>{changeLabel(c)}</span>
          </div>
          <p className="kit-compare-foot">
            {item.windows.current.label} vs {item.windows.previous.label} ({money(c.previous)})
          </p>
        </>
      ) : (
        // No rows at all yet — say so rather than showing a confident zero.
        <>
          <div className="kit-compare-top">
            <strong>—</strong>
          </div>
          <p className="kit-compare-foot">No {item.label} data uploaded yet</p>
        </>
      )}
    </Card>
  );
}

/**
 * How the period switch changes the period.
 *
 * Two modes, because the pages genuinely differ and pretending otherwise would
 * make one of them worse:
 *
 * - `link` — the role pages render the comparison on the server from a
 *   `?compare=` query parameter. A real link keeps the choice in the URL, so
 *   it is bookmarkable, survives a refresh, and works before React has
 *   hydrated.
 * - `select` — `/dashboard` is a client component that fetches its own data
 *   and already holds the reporting month in state. A link there would throw
 *   away that state and re-run the month fetch to change one word, so it calls
 *   back instead.
 */
export type PeriodControl =
  | { mode: "link"; hrefFor: (kind: ComparisonKind) => string }
  | { mode: "select"; onSelect: (kind: ComparisonKind) => void };

/** Day / Week / Month, as three buttons with the active one filled. */
export function PeriodSwitch({ value, control }: { value: ComparisonKind; control: PeriodControl }) {
  const className = (kind: ComparisonKind) => `kit-btn size-sm ${kind === value ? "is-primary" : "is-ghost"}`;
  return (
    <span className="kit-period-switch">
      {COMPARISON_KINDS.map((kind) =>
        control.mode === "link" ? (
          <Link key={kind} href={control.hrefFor(kind)} className={className(kind)}>
            {COMPARISON_KIND_LABEL[kind]}
          </Link>
        ) : (
          <button
            key={kind}
            type="button"
            className={className(kind)}
            aria-pressed={kind === value}
            onClick={() => control.onSelect(kind)}
          >
            {COMPARISON_KIND_LABEL[kind]}
          </button>
        ),
      )}
    </span>
  );
}

/**
 * The whole "compared with the previous period" section: heading, period
 * switch and the row of cards.
 *
 * This is one component rather than three copies because it WAS three copies.
 * v130 shipped the block to /rso, /supervisor and /manager as byte-identical
 * JSX, and v134 was about to paste a fourth onto /dashboard. The heading text
 * matters as much as the markup — it explains why two cards may name different
 * dates, and a fourth copy is a fourth place for that explanation to drift out
 * of step with what the data actually does.
 */
export function ComparisonSection({
  metrics,
  kind,
  control,
  loading,
}: {
  metrics: MetricComparison[];
  kind: ComparisonKind;
  control: PeriodControl;
  /** Client callers only: show placeholders instead of a misleading empty row. */
  loading?: boolean;
}) {
  return (
    <>
      <SectionHead
        title="Compared with the previous period"
        sub="Each figure names the two dates it was measured between, because the feeds do not always arrive together."
        link={<PeriodSwitch value={kind} control={control} />}
      />
      <div className="kit-card-grid kit-mb-20">
        {loading
          ? [1, 2, 3].map((i) => (
              <Card key={i} padded>
                <Skeleton className="kit-skel-num" />
              </Card>
            ))
          : metrics.map((m) => <ComparisonCard key={m.metric} item={m} />)}
      </div>
    </>
  );
}

/**
 * Page controls for a server-paged list.
 *
 * Links, not buttons: the page is part of the URL, so a page can be bookmarked,
 * shared and reopened, and the back button walks back through the pages the way
 * a person expects. `scroll` is left on — moving to page 4 SHOULD return you to
 * the top of the list, unlike a search, where jumping is disorienting.
 *
 * The label always names the true total ("61–120 of 2,431"). The list this
 * replaced said "showing the first 300" and gave no way to reach the 301st,
 * which is the silent-truncation pattern the v132 audit kept finding.
 */
export function Pager({
  page,
  pageCount,
  label,
  hrefFor,
}: {
  page: number;
  pageCount: number;
  /** e.g. "61–120 of 2,431 retailers". */
  label: string;
  hrefFor: (page: number) => string;
}) {
  // A single page still shows the count — it is the answer to "how many are
  // there", not decoration for the controls.
  const first = page <= 1;
  const last = page >= pageCount;
  return (
    <div className="kit-pager no-print">
      <span className="kit-pager-label" aria-live="polite">
        {label}
      </span>
      {pageCount > 1 && (
        <nav className="kit-pager-controls" aria-label="Pagination">
          {first ? (
            <span className="kit-btn size-sm is-ghost is-disabled" aria-disabled="true">
              ← Previous
            </span>
          ) : (
            <Link className="kit-btn size-sm is-ghost" href={hrefFor(page - 1)} rel="prev">
              ← Previous
            </Link>
          )}
          <span className="kit-pager-position">
            Page {page.toLocaleString()} of {pageCount.toLocaleString()}
          </span>
          {last ? (
            <span className="kit-btn size-sm is-ghost is-disabled" aria-disabled="true">
              Next →
            </span>
          ) : (
            <Link className="kit-btn size-sm is-ghost" href={hrefFor(page + 1)} rel="next">
              Next →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}

/**
 * The pacing line under a KPI: what today needs, what the month is doing, and
 * where it lands if nothing changes.
 *
 * Deliberately hidden when there is no target and when the month has not
 * produced a day of data yet — a required-per-day figure against a zero target
 * is noise, and a projection from nothing is a guess dressed as a number.
 */
export function PaceFoot({ pace, unit = "" }: { pace: Pacing; unit?: string }) {
  if (pace.status === "No target") return null;
  const tone = riskTone(pace.status);
  const done = pace.status === "Achieved" || pace.status === "Missed";
  return (
    <div className={`kit-pace tone-${tone}`}>
      <div className="kit-pace-head">
        <span className="kit-pace-status">{pace.status}</span>
        {pace.window.phase === "current" && (
          <span className="kit-pace-days">
            {pace.window.daysRemaining} day{pace.window.daysRemaining === 1 ? "" : "s"} left
          </span>
        )}
      </div>
      {!done && pace.requiredPerDay !== null && (
        <p className="kit-pace-line">
          Need{" "}
          <b>
            {unit}
            {perDayLabel(pace.requiredPerDay)}
          </b>
          /day
          {pace.currentPerDay !== null && (
            <>
              {" · now "}
              <b>
                {unit}
                {perDayLabel(pace.currentPerDay)}
              </b>
              /day
            </>
          )}
        </p>
      )}
      {pace.projected !== null && !done && (
        // "Projected", never "will be": this is an estimate from the current
        // rate, and the wording should not let anyone forget that.
        <p className="kit-pace-line is-muted">
          Projected {unit}
          {fmt(Math.round(pace.projected))}
          {pace.gap !== null && pace.gap < 0 && <> · short by {fmt(Math.round(-pace.gap))}</>}
        </p>
      )}
    </div>
  );
}

/** Clickable count that deep-links into a pre-filtered worklist. */
export function StatusTile({
  href,
  count,
  label,
  tone = "amber",
}: {
  href: string;
  count: number;
  label: string;
  tone?: "amber" | "rose" | "teal";
}) {
  return (
    <Link href={href} className={`kit-card is-clickable kit-status-tile tone-${tone}`}>
      <strong>{fmt(count)}</strong>
      <span>{label}</span>
    </Link>
  );
}

/**
 * Person or outlet card: ring, identity, status, then metric bars.
 * Used for the supervisor's RSO list and the manager's supervisor list.
 */
export function EntityCard({
  href,
  eyebrow,
  name,
  code,
  percent,
  metrics,
  footer,
}: {
  href: string;
  eyebrow?: string;
  name: string;
  code: string;
  percent: number;
  metrics: { label: string; achieved: number; target: number; unit?: string }[];
  footer?: ReactNode;
}) {
  return (
    <Link href={href} className="kit-card kit-card-p is-clickable">
      <div className="kit-entity-top">
        <Ring value={percent} size={54} stroke={5} />
        <div className="kit-entity-main">
          {eyebrow && <p className="kit-eyebrow">{eyebrow}</p>}
          <strong>{name}</strong>
          <span>{code}</span>
        </div>
        <StatusBadge percent={percent} />
      </div>
      {metrics.length > 0 && (
        <div className="kit-entity-metrics">
          {metrics.map((m) => (
            <MetricBar key={m.label} label={m.label} achieved={m.achieved} target={m.target} unit={m.unit} />
          ))}
        </div>
      )}
      {footer}
    </Link>
  );
}

/* ------------------------------------------------------------------ *
 * Upload surfaces
 * ------------------------------------------------------------------ */

/**
 * The demos' dashed file drop target. The real `<input type="file">` stays in
 * the DOM inside the label rather than being replaced by a button, so keyboard
 * focus and the native file picker both keep working.
 */
export function DropZone({
  file,
  accept,
  hint,
  onFile,
  disabled,
}: {
  file: File | null;
  accept: string;
  hint: string;
  onFile: (f: File | null) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`kit-drop${file ? " is-filled" : ""}`}>
      <input type="file" accept={accept} disabled={disabled} onChange={(e) => onFile(e.target.files?.[0] || null)} />
      <strong>{file ? file.name : "Tap to browse a file from your device"}</strong>
      <span>{file ? "Ready for validation" : hint}</span>
    </label>
  );
}

/**
 * An import module on the Upload Center: what it is, what it does to stored
 * data, and the two ways in (workspace, sample file). `note` is the rule that
 * decides whether an upload replaces or appends — the one thing an operator
 * must read before uploading, so it is body text and not a tooltip.
 */
export function ModuleCard({
  index,
  tag,
  icon,
  title,
  sub,
  note,
  href,
  sample,
}: {
  index: string;
  tag: string;
  icon: ReactNode;
  title: string;
  sub: string;
  note: string;
  href: string;
  sample: string;
}) {
  return (
    <Card padded className="kit-module">
      <div className="kit-module-top">
        <span className="kit-module-icon" aria-hidden="true">
          {icon}
        </span>
        <div className="kit-module-main">
          <p className="kit-eyebrow">
            {index} · {tag}
          </p>
          <strong>{title}</strong>
          <span>{sub}</span>
        </div>
      </div>
      <p className="kit-module-note">{note}</p>
      <div className="kit-form-actions">
        <Link className="kit-btn is-primary size-sm" href={href}>
          Open Workspace
        </Link>
        <a className="kit-btn is-secondary size-sm" href={sample}>
          Sample
        </a>
      </div>
    </Card>
  );
}

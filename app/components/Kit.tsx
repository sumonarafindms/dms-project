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
import { AppLink as Link } from "./AppLink";
import { Icon } from "./icons";
import { TARGET_BAND_LABEL, targetBand, targetPercent } from "../../lib/achievement";
import type { TargetBand } from "../../lib/achievement";
import { perDayLabel, riskTone } from "../../lib/pacing";
import { gaTierParts } from "../../lib/ga-category";
import type { GaTiers } from "../../lib/ga-category";
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
  /*
   * The label has to fit inside the ring, and some of these are enormous.
   *
   * The company GA card reads 5,617% of a target set for one supervisor, and
   * at the standard size/4 the digits painted straight over the ring's own
   * stroke on both sides. The figure is not wrong and is not going to be
   * rounded away — it is shown in full on the bar beside it too — so the
   * label shrinks to fit rather than the number being trimmed to suit the
   * label. Four digits and up get a smaller step; the aria-label is untouched,
   * so a screen reader always hears the whole figure.
   */
  const digits = String(shown).length;
  const fontScale = digits >= 5 ? 6 : digits === 4 ? 5 : 4;
  return (
    <div
      className={`kit-ring band-${targetBand(value)}`}
      style={
        {
          "--kit-ring-size": `${size}px`,
          "--kit-ring-font": `${Math.max(8, size / fontScale)}px`,
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
  tiers,
}: {
  label: string;
  achieved: number;
  target: number;
  unit?: string;
  /** For a GA bar: the 170/300 split of `achieved`. */
  tiers?: GaTiers | null;
}) {
  /*
   * No target is not a target of zero — the same ruling KpiCard has followed
   * since v175, applied here in v183.
   *
   * This bar printed "৳1,818,560 / ৳0" and a red "0%" under an empty track for
   * every metric nobody had uploaded a target for. The achievement is real and
   * is still shown; what is missing is named instead of drawn as a failure.
   */
  const hasTarget = target > 0;
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
          {hasTarget ? (
            <>
              <span>
                {" "}
                / {unit}
                {fmt(Math.round(target))}
              </span>
              <em className={`band-${band}`}>{p}%</em>
            </>
          ) : (
            <em className="is-unset">No target</em>
          )}
        </span>
      </div>
      {hasTarget && <Bar value={p} />}
      <TierLine tiers={tiers} />
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

/**
 * Badge for an achievement percentage, labelled the way the demos label it.
 *
 * `null` means no target was ever set, and that is not the same as being at
 * zero percent of one. Until v183 every RSO on a supervisor's list wore a red
 * "Behind Target" for a month nobody had uploaded a recharge target for —
 * seven cards accusing seven people of missing a number that did not exist.
 * `KpiCard` has declined to guess since v175; this is the same ruling applied
 * to the other card.
 */
export function StatusBadge({ percent }: { percent: number | null }) {
  if (percent === null) return <Badge tone="neutral">No target</Badge>;
  const band = targetBand(percent);
  return <Badge tone={band}>{TARGET_BAND_LABEL[band]}</Badge>;
}

/* ------------------------------------------------------------------ *
 * Buttons, inputs
 * ------------------------------------------------------------------ */
type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
type BtnSize = "sm" | "md" | "lg";

/**
 * The button class string, in one place.
 *
 * Two elements wear this look — `<button>` for actions and `<a>`/`<Link>` for
 * navigation — and until v148 only the first had a component. Fifteen links
 * spelled `kit-btn is-primary size-md` out by hand, which is the same drift
 * `Btn` was created to end, just on the other element. They share the formula
 * now; what they must not share is the tag, because a link that is really a
 * button loses middle-click, open-in-new-tab and its meaning to a screen
 * reader.
 */
function btnClass(variant: BtnVariant, size: BtnSize, block?: boolean, extra = "") {
  return `kit-btn is-${variant} size-${size}${block ? " is-block" : ""} ${extra}`.trim();
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: BtnSize;
  block?: boolean;
};

export function Btn({ variant = "primary", size = "md", block, className = "", ...props }: BtnProps) {
  return <button {...props} className={btnClass(variant, size, block, className)} />;
}

/**
 * A number field that a scroll cannot change.
 *
 * ## The bug, and why it is in the kit rather than in a page
 *
 * A focused `<input type="number">` changes its value when the mouse wheel
 * moves over it. On the Targets page that was seven fields per RSO across
 * twenty rows, all saved in one request — scrolling the page could silently
 * rewrite a target and send it to the database with everything else, and
 * nothing in the UI would say so.
 *
 * v153 fixed that page. v155 found the same unguarded input twice more, in the
 * two BP GA target fields, because the fix had been written where the bug was
 * noticed instead of where number fields are made. A hazard that belongs to a
 * control belongs to the component for that control; otherwise every new field
 * starts out broken and waits to be noticed.
 *
 * `onWheel` blurs rather than calling `preventDefault`. Preventing the event
 * would stop the page scrolling whenever the pointer happened to be over a
 * field, which feels broken; blurring lets the scroll through and takes the
 * value out of reach, because an unfocused number input ignores the wheel.
 *
 * `inputMode="numeric"` comes along for free: it is what puts a digits-only
 * keypad in front of the ninety per cent of this app's users who are on a
 * phone.
 */
export function NumberInput({
  className = "kit-input",
  onWheel,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      type="number"
      inputMode={props.inputMode ?? "numeric"}
      className={className}
      onWheel={(e) => {
        e.currentTarget.blur();
        onWheel?.(e);
      }}
    />
  );
}

type LinkBtnProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  variant?: BtnVariant;
  size?: BtnSize;
  block?: boolean;
  /**
   * A dead end that still holds its place — the pager's "Previous" on page 1.
   * Rendered as a `<span>`, because a link that goes nowhere should not be
   * offered to the keyboard or announced as a link.
   */
  disabled?: boolean;
  /**
   * A plain `<a>` instead of `next/link`: file downloads (`/api/samples/…`),
   * and the deliberate full reload out of an error boundary, where routing
   * client-side would keep the broken tree alive.
   */
  external?: boolean;
};

/** A link that looks like a button. Same class formula as `Btn`, different tag. */
export function LinkBtn({
  href,
  variant = "primary",
  size = "md",
  block,
  disabled,
  external,
  className = "",
  children,
  ...rest
}: LinkBtnProps) {
  const cls = btnClass(variant, size, block, `${disabled ? "is-disabled " : ""}${className}`.trim());
  if (disabled)
    return (
      <span className={cls} aria-disabled="true">
        {children}
      </span>
    );
  if (external)
    return (
      <a {...rest} href={href} className={cls}>
        {children}
      </a>
    );
  return (
    <Link {...rest} href={href} className={cls}>
      {children}
    </Link>
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

export function SummaryStrip({
  items,
}: {
  items: { label: string; value: ReactNode; tone?: "brand" | "amber"; note?: ReactNode }[];
}) {
  return (
    <div className="kit-summary-strip">
      {items.map((it) => (
        <div className="kit-card" key={it.label}>
          <span className="kit-label">{it.label}</span>
          <strong className={it.tone ? `tone-${it.tone}` : undefined}>{it.value}</strong>
          {/* `note` carries the 170/300 split under a GA tile. Same class as
              everywhere else the split appears, so it reads the same size. */}
          {it.note ? <p className="kit-tier-line">{it.note}</p> : null}
        </div>
      ))}
    </div>
  );
}

/**
 * The one line that says a daily figure is not from today.
 *
 * Renders nothing when every feed is current, so a caller can drop it in
 * unconditionally and a clean day stays quiet. `role="status"` rather than
 * `alert`: stale data is worth reading, not worth interrupting.
 */
/**
 * The 170 / 300 split under a GA figure.
 *
 * The owner's request: *"ga ar jai block gula thakbe oi gula niche show hobe
 * 170 takar sim koita and 300 takar sim koita — only normal sim"*, so that an
 * RSO or BP can see which SIM is moving and a supervisor can read the market.
 *
 * One component rather than a line of JSX repeated on nine screens, for the
 * reason "Latest GA" ended up on three screens in v175 with no way to change
 * it once. It renders nothing when there is nothing to split, so a caller can
 * drop it in unconditionally and a month with no sales stays quiet instead of
 * printing "GA 170 0 · GA 300 0".
 */
export function TierLine({ tiers }: { tiers: GaTiers | null | undefined }) {
  const parts = gaTierParts(tiers);
  if (!parts) return null;
  return (
    <p className="kit-tier-line">
      {parts.map((part) => (
        <span key={part.label}>
          {part.label} <b>{part.value}</b>
        </span>
      ))}
    </p>
  );
}

export function FeedNote({ note }: { note: string | null }) {
  if (!note) return null;
  return (
    <p className="kit-note is-warn kit-mb-16" role="status">
      {note}
    </p>
  );
}

export function EmptyState({
  title,
  hint,
  positive,
  icon,
}: {
  title: string;
  /** ReactNode, not string: an empty state often has to offer a way out of it. */
  hint?: ReactNode;
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

/**
 * A whole page that exists only to explain why there is nothing to show.
 *
 * Four screens hand-rolled this and a fifth — the RSO home — forgot to, and
 * returned `null` instead: an inactive employee record produced a completely
 * blank page, no heading, no message, no way out, on the role most of this
 * app's users hold. A shared component is how "say something" stops depending
 * on each page remembering to.
 *
 * `role="alert"` is deliberately absent. This is the whole page; there is
 * nothing for it to interrupt.
 */
export function PageNotice({ title, subtitle, hint }: { title: string; subtitle: string; hint?: string }) {
  /*
   * Three lines, each said once: the heading names the problem, the optional
   * detail explains it, and the card carries the one thing the reader can do.
   * The hand-rolled version this replaces put the title in the heading AND in
   * the card, so the screen repeated itself and the action was the only part
   * that was not emphasised.
   */
  return (
    <main className="page">
      <PageHeader title={title} subtitle={hint} />
      <Card>
        <EmptyState title={subtitle} icon={<Icon name="alert" />} />
      </Card>
    </main>
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
  figures: { label: string; value: ReactNode; tone?: "brand" | "amber"; tiers?: GaTiers | null }[];
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
            <TierLine tiers={f.tiers} />
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Initials chip. Used wherever a list shows people rather than metrics. */
/**
 * Initials from the first letters of the first two WORDS, not the first two
 * characters.
 *
 * `name.slice(0, 2)` turned "Md Mashiujjaman shuvo" and "MD SHAHIN RAHMAN
 * KHAN" into the same "MD", and "R.R Enterprise- BP 01" into "R." — a full
 * stop as an avatar. Punctuation is skipped, and a single-word name still
 * falls back to its first two letters.
 */
export function initialsOf(name: string) {
  const words = (name || "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function Avatar({ name }: { name: string }) {
  return (
    <span className="kit-avatar" aria-hidden="true">
      {initialsOf(name)}
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
  tiers,
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
  /**
   * A GA row's 170/300 split.
   *
   * It goes in the MAIN column, not beside the figure: the value column is a
   * couple of characters wide on a phone, and "GA 170 5 · GA 300 2" wrapped
   * there would push the row's own name to an ellipsis.
   */
  tiers?: GaTiers | null;
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
        <TierLine tiers={tiers} />
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

/** A checkbox with its label, sized and coloured in the brand accent. */
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
      {/*
        tabIndex + a name, because this scrolls sideways.

        An `overflow-x: auto` box is reachable with a mouse or a thumb and with
        nothing else: a keyboard user cannot scroll it, so the columns past the
        fold are simply unavailable to them (axe: scrollable-region-focusable).
        Making it focusable gives the arrow keys somewhere to land, and the
        label says what they have landed on instead of announcing an anonymous
        group.
      */}
      <div className="kit-table-wrap" tabIndex={0} role="group" aria-label="Table, scrolls sideways">
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
  tiers,
}: {
  label: string;
  achieved: number;
  target: number;
  unit?: string;
  /** For a GA card: the 170/300 split of `achieved`. */
  tiers?: GaTiers | null;
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
  /*
   * A missing target is not a target of zero.
   *
   * `targetPercent(a, 0)` is 0 by design — there is no honest percentage of
   * nothing — and this card used to print that 0 into a ring, a bar and a
   * "0 of 0 · Remaining 0". An RSO whose month had no target uploaded read
   * five tiles telling them they were at zero percent, in the band colour the
   * app uses for failing, and nothing anywhere said a target was missing.
   * `PaceFoot` already declines to guess for this case; the ring did not.
   *
   * So when there is no target there is no ring and no bar: the achievement is
   * shown, because it is real, and the gap is named instead of drawn.
   */
  const hasTarget = target > 0;
  const p = targetPercent(achieved, target);
  return (
    <Card padded>
      {/*
        The label and the ring share the top line; the figure gets the whole
        card width below them.

        It used to be a two-column flex — text on the left, ring on the right —
        which meant the number was competing with the ring for width on a
        390px phone. That is why `.kit-kpi-grid` could not go to two columns
        below 480px, and why an RSO's home was three screens of scrolling with
        one card per row. A long currency figure now wraps under the label
        instead of being ellipsed next to the ring, so two cards fit a phone
        row and every figure is readable in full.
      */}
      <div className="kit-kpi-head">
        <span className="kit-label">{label}</span>
        {hasTarget && <Ring value={p} size={36} stroke={4} />}
      </div>
      <strong className="kit-kpi-value">
        {unit}
        {fmt(Math.round(achieved))}
      </strong>
      {/*
        One line for the empty state, not two.

        This used to print "No target set" here and "Ask Admin to upload this
        month's target." again underneath, and an RSO's home renders five of
        these cards — so the same sentence appeared five times on one screen,
        in two halves. Both facts still reach the reader; they now cost one
        line per card instead of two.
      */}
      <span className="kit-kpi-of">
        {hasTarget ? (
          <>
            of {unit}
            {fmt(Math.round(target))}
          </>
        ) : (
          "No target — ask Admin"
        )}
      </span>
      <TierLine tiers={tiers} />
      {hasTarget ? (
        <>
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
        </>
      ) : null}
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
  const variant = (kind: ComparisonKind) => (kind === value ? "primary" : "ghost");
  return (
    <span className="kit-period-switch">
      {COMPARISON_KINDS.map((kind) =>
        control.mode === "link" ? (
          <LinkBtn key={kind} href={control.hrefFor(kind)} variant={variant(kind)} size="sm">
            {COMPARISON_KIND_LABEL[kind]}
          </LinkBtn>
        ) : (
          <Btn
            key={kind}
            type="button"
            variant={variant(kind)}
            size="sm"
            aria-pressed={kind === value}
            onClick={() => control.onSelect(kind)}
          >
            {COMPARISON_KIND_LABEL[kind]}
          </Btn>
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
      {/* `is-compact`: these three carry one figure each, so they tile two to a
          phone row. The plain grid stays one-up because it also carries entity
          cards, which do not. */}
      <div className="kit-card-grid is-compact kit-mb-20">
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
          <LinkBtn variant="ghost" size="sm" disabled={first} href={first ? "#" : hrefFor(page - 1)} rel="prev">
            ← Previous
          </LinkBtn>
          <span className="kit-pager-position">
            Page {page.toLocaleString("en-US")} of {pageCount.toLocaleString("en-US")}
          </span>
          <LinkBtn variant="ghost" size="sm" disabled={last} href={last ? "#" : hrefFor(page + 1)} rel="next">
            Next →
          </LinkBtn>
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
  tone?: "amber" | "rose" | "brand";
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
  /** `null` when this entity has no headline target — see StatusBadge. */
  percent: number | null;
  metrics: { label: string; achieved: number; target: number; unit?: string; tiers?: GaTiers | null }[];
  footer?: ReactNode;
}) {
  return (
    <Link href={href} className="kit-card kit-card-p is-clickable">
      <div className="kit-entity-top">
        {percent === null ? (
          // The ring's space is kept rather than collapsed, so a list of cards
          // where some have targets and some do not still reads as a column.
          <span className="kit-ring-empty" aria-hidden="true">
            —
          </span>
        ) : (
          <Ring value={percent} size={54} stroke={5} />
        )}
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
            <MetricBar
              key={m.label}
              label={m.label}
              achieved={m.achieved}
              target={m.target}
              unit={m.unit}
              tiers={m.tiers}
            />
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
        <LinkBtn size="sm" href={href}>
          Open Workspace
        </LinkBtn>
        <LinkBtn variant="secondary" size="sm" external href={sample}>
          Sample
        </LinkBtn>
      </div>
    </Card>
  );
}

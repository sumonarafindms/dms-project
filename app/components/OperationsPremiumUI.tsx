"use client";

/**
 * The shared import-workspace shell — migrated to the role-UI kit.
 *
 * Behind /ga, /c2c, /c2s and /ob. (Accounts had wrappers under
 * /accounts/operations until v197; uploading is IT's job.)
 * Export names and prop shapes are unchanged on purpose: the four pages carry
 * dense operator tables whose cell markup is theirs, and rewriting those into
 * a column API would be a much larger change than restyling the shell.
 */

import type { ReactNode } from "react";
import { AppLink as Link } from "./AppLink";
import { TableScrollHint } from "./TableScrollHint";
import { Icon } from "./icons";
import { Badge, Card, EmptyState as KitEmptyState, LinkBtn, PageHeader, SectionHead } from "./Kit";
import type { BadgeTone } from "./Kit";
import { fmtDate, fmtDateTime } from "../../lib/format";
import { OPS_LEVELS, OPS_LEVEL_LABEL, type OpsLevel } from "../../lib/ops-rollup";

export function OpsHeader({
  title,
  subtitle,
  from,
  to,
  onFrom,
  onTo,
  badge,
}: {
  title: string;
  subtitle: string;
  from?: string;
  to?: string;
  onFrom?: (v: string) => void;
  onTo?: (v: string) => void;
  badge: string;
}) {
  const back = "/admin/upload";
  // A native date input reports "" both while a date is being typed by hand and
  // for any value a min/max attribute rejects. Passing that "" through wiped the
  // range and made the picker look dead, so empty values are ignored here and the
  // TO field has no min: choosing an earlier day pulls FROM back instead of being
  // silently refused. See claude/v102.
  const pickFrom = (v: string) => {
    if (!v || !onFrom) return;
    onFrom(v);
    if (to && to < v && onTo) onTo(v);
  };
  const pickTo = (v: string) => {
    if (!v || !onTo) return;
    onTo(v);
    if (from && v < from && onFrom) onFrom(v);
  };

  return (
    <>
      <Link href={back} className="kit-detail-back">
        <Icon name="arrow" /> Upload Center
      </Link>
      <PageHeader title={title} subtitle={subtitle} action={<Badge tone="neutral">{badge}</Badge>} />
      {from && to && onFrom && onTo ? (
        <div className="kit-filter-bar no-print">
          <label className="kit-field">
            <span>From</span>
            <input className="kit-input" type="date" value={from} onChange={(e) => pickFrom(e.target.value)} />
          </label>
          <label className="kit-field">
            <span>To</span>
            <input className="kit-input" type="date" value={to} onChange={(e) => pickTo(e.target.value)} />
          </label>
          <span className="kit-filter-note">Reporting range</span>
        </div>
      ) : null}
    </>
  );
}

export function OpsUpload({
  title,
  subtitle,
  sample,
  children,
  rule,
  message,
}: {
  title: string;
  subtitle: string;
  sample: string;
  children: ReactNode;
  rule: ReactNode;
  message?: string;
}) {
  // Success is tested FIRST. The old order asked "does this mention failure?"
  // before "did it succeed?", and every successful import message ends with
  // "... 0 failed row(s)" — so a clean GA import has always been painted as an
  // error. A completion word now wins; only a message with no completion word
  // and a failure word is an error.
  const tone = message
    ? /complete|completed|updated|replaced|imported|success/i.test(message)
      ? "ok"
      : /failed|invalid|missing|error|stopped/i.test(message)
        ? "bad"
        : "warn"
    : null;
  return (
    <>
      <SectionHead
        title={title}
        sub={subtitle}
        link={
          // A real <a>: this is a file download from an API route, and <Link>
          // would client-side navigate to it instead.
          <LinkBtn href={sample} external variant="secondary" size="sm">
            Sample File
          </LinkBtn>
        }
      />
      <Card className="kit-mb-20" padded="lg">
        {children}
        <div className="kit-guide">
          <strong>Before anything is written</strong>
          <ol>
            <li>Choose the source file.</li>
            <li>Required headings are checked.</li>
            <li>Row values, dates and mapping are verified.</li>
            <li>Verified rows are imported and counted back to you.</li>
          </ol>
          <p>{rule}</p>
        </div>
        {message && tone && (
          <div className={`kit-note is-${tone} is-last`} role={tone === "bad" ? "alert" : "status"}>
            <Icon name={tone === "ok" ? "check" : tone === "bad" ? "alert" : "info"} />
            <span>{message}</span>
          </div>
        )}
      </Card>
    </>
  );
}

export function OpsSectionTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return <SectionHead title={title} sub={subtitle} link={right} />;
}

/**
 * One figure with a label and a note.
 *
 * `tone` and `icon` were props here, both dead — the kit renders one figure
 * style and the glyphs went with the premium layer. Thirty arguments across the
 * four operations pages were still being written into them. A prop the type
 * accepts and the body ignores is worse than no prop: the caller believes they
 * set something.
 */
export function OpsMetric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card padded>
      <span className="kit-label">{label}</span>
      <strong className="kit-figure">{value}</strong>
      {note ? <span className="kit-figure-sub">{note}</span> : null}
    </Card>
  );
}

export function OpsDataCard({
  title,
  subtitle,
  count,
  tabs,
  children,
}: {
  title: string;
  subtitle?: string;
  count?: string;
  /** Rendered between the heading and the table — see OpsLevelTabs. */
  tabs?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <SectionHead
        title={title}
        sub={subtitle}
        link={count ? <span className="kit-filter-note">{count}</span> : undefined}
      />
      <Card className="kit-mb-20" padded>
        {tabs}
        {children}
      </Card>
    </>
  );
}

/**
 * Retailer / RSO / Supervisor, over one feed.
 *
 * The same numbers at three levels of the same tree. Before this, /ob offered
 * only the retailer level — an operator wanting an RSO's total balance had to
 * page through 2,190 outlets and add them up by hand — while /ga, /c2c and
 * /c2s offered two levels as two separate cards stacked down the page, so the
 * same question was answered in a different shape on every screen.
 *
 * A segmented control rather than links: switching level is a view change, not
 * a different dataset, and the page already has everything it needs.
 */
export function OpsLevelTabs({
  value,
  onChange,
  counts,
  levels = OPS_LEVELS,
}: {
  value: OpsLevel;
  onChange: (next: OpsLevel) => void;
  /** How many rows each level holds, printed on its tab. */
  counts: Partial<Record<OpsLevel, number>>;
  levels?: readonly OpsLevel[];
}) {
  return (
    <div className="ops-level-tabs" role="tablist" aria-label="Group this feed by">
      {levels.map((level) => {
        const active = level === value;
        const n = counts[level];
        return (
          <button
            key={level}
            type="button"
            role="tab"
            aria-selected={active}
            className={`ops-level-tab${active ? " is-active" : ""}`}
            onClick={() => onChange(level)}
          >
            <span>{OPS_LEVEL_LABEL[level]}</span>
            {n === undefined ? null : <em>{n.toLocaleString("en-US")}</em>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * These operator tables are wide by nature — supervisor, employee, retailer and
 * six metric columns. They scroll horizontally rather than becoming one card
 * per row, which for a few hundred rows would be unreadable; TableScrollHint is
 * what tells a phone user that is what is happening.
 */
/**
 * The operator tables scroll horizontally by design. `wide` picks the width
 * below which scrolling starts: the default suits the four-to-six column
 * feeds, and `wide` is for /c2c, which carries more. It is a class rather
 * than an inline min-width so the page ships no style attribute.
 */
export function OpsTable({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <>
      {/* Focusable and named — see the note in Kit.tsx's Table. */}
      <div className="kit-table-wrap is-always" tabIndex={0} role="group" aria-label="Table, scrolls sideways">
        <table className={`kit-table ${wide ? "is-w1120" : "is-w900"}`}>{children}</table>
      </div>
      <TableScrollHint />
    </>
  );
}

export function PersonCell({ name, sub }: { name: string; sub?: string }) {
  return (
    <div className="kit-cell-person">
      <span className="kit-avatar" aria-hidden="true">
        {initials(name)}
      </span>
      <div>
        <b>{name}</b>
        {sub ? <small>{sub}</small> : null}
      </div>
    </div>
  );
}

/**
 * A progress bar in a table cell — or the words "No target", when there is none.
 *
 * `targetPercent(a, 0)` is 0 by design: there is no honest percentage of
 * nothing. v175 stopped KpiCard painting that 0 as failure and v183 did the
 * same for the entity cards, the status badges and the metric bars. These four
 * operator tables were the last place still doing it: an RSO with no GA target
 * uploaded read "1,666 achieved · 0 target · 0%" with an empty red bar, in a
 * column headed "GA Progress".
 *
 * `target` is optional only so a caller that genuinely has no target figure to
 * hand keeps the old behaviour; every caller in this app passes one.
 */
export function ProgressCell({ value, target }: { value: number; target?: number }) {
  if (target !== undefined && !(target > 0)) return <span className="kit-cell-unset">No target</span>;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="kit-cell-progress">
      <div className="kit-bar is-thin">
        <i style={{ width: `${pct}%` }} />
      </div>
      <b>{value}%</b>
    </div>
  );
}

export function EmptyState({ title, subtitle, icon = "info" }: { title: string; subtitle: string; icon?: string }) {
  // The old signature took a glyph string; map the ones the pages pass onto
  // real icons and fall back to the neutral one.
  const named = ["sim", "wallet", "chart", "balance", "upload", "search", "info"].includes(icon) ? icon : "info";
  return <KitEmptyState title={title} hint={subtitle} icon={<Icon name={named} />} />;
}

const STATUS_TONE: Record<string, BadgeTone> = {
  SUCCESS: "success",
  COMPLETE: "complete",
  COMPLETED: "complete",
  FAILED: "failed",
  ERROR: "failed",
  PROCESSING: "processing",
  RUNNING: "processing",
  PENDING: "pending",
};

export function StatusPill({ value }: { value: string }) {
  return <Badge tone={STATUS_TONE[value.toUpperCase()] || "neutral"}>{value}</Badge>;
}

function initials(value: string) {
  return (value || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((v) => v[0])
    .join("")
    .toUpperCase();
}

/** "Did the newest source file land?" — the first question on any of these pages. */
export function OpsFreshness({
  label,
  businessDate,
  uploadedAt,
  fileName,
  range,
}: {
  label: string;
  businessDate?: string | null;
  uploadedAt?: string | null;
  fileName?: string | null;
  range?: string;
}) {
  return (
    <Card className="kit-mb-20" padded>
      <div className="kit-feed-head">
        <div className="kit-min0">
          <span className="kit-label">Latest {label} data</span>
          <strong className="kit-figure">{fmtDate(businessDate, "No import yet")}</strong>
          {range ? <span className="kit-figure-sub">{range}</span> : null}
        </div>
        <Badge tone={businessDate ? "complete" : "pending"}>{businessDate ? "Imported" : "No data"}</Badge>
      </div>
      <p className="kit-feed-file" title={fileName || ""}>
        {fileName || "Upload a source file"}
      </p>
      <p className="kit-figure-sub">
        {uploadedAt ? `Imported ${fmtDateTime(uploadedAt)}` : "No import history available"}
      </p>
    </Card>
  );
}

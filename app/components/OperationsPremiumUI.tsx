"use client";

/**
 * The shared import-workspace shell — migrated to the role-UI kit.
 *
 * Behind /ga, /c2c, /c2s and /ob (and their /accounts/operations wrappers).
 * Export names and prop shapes are unchanged on purpose: the four pages carry
 * dense operator tables whose cell markup is theirs, and rewriting those into
 * a column API would be a much larger change than restyling the shell.
 */

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { TableScrollHint } from "./TableScrollHint";
import { Icon } from "./icons";
import { Badge, Card, EmptyState as KitEmptyState, PageHeader, SectionHead } from "./Kit";
import type { BadgeTone } from "./Kit";

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
  const path = usePathname(),
    accounts = path.startsWith("/accounts/");
  const back = accounts ? "/accounts/operations" : "/admin/upload";
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
        <Icon name="arrow" /> {accounts ? "Operations" : "Upload Center"}
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
          <a href={sample} className="kit-btn is-secondary size-sm">
            Sample File
          </a>
        }
      />
      <Card padded="lg" style={{ marginBottom: "1.25rem" }}>
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
          <div
            className={`kit-note is-${tone}`}
            role={tone === "bad" ? "alert" : "status"}
            style={{ margin: "1rem 0 0" }}
          >
            <Icon name={tone === "ok" ? "check" : tone === "bad" ? "alert" : "info"} />
            <span>{message}</span>
          </div>
        )}
      </Card>
    </>
  );
}

export function OpsSectionTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  /** Ignored — the kit heading has no decorative glyph. Kept so callers compile. */
  icon?: string;
  right?: ReactNode;
}) {
  return <SectionHead title={title} sub={subtitle} link={right} />;
}

/** One figure with a label and a note. `tone` is decorative and no longer used. */
export function OpsMetric({
  label,
  value,
  note,
}: {
  tone?: string;
  label: string;
  value: string;
  note?: string;
  icon?: string;
}) {
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
  children,
}: {
  title: string;
  subtitle?: string;
  count?: string;
  children: ReactNode;
}) {
  return (
    <>
      <SectionHead
        title={title}
        sub={subtitle}
        link={count ? <span className="kit-filter-note">{count}</span> : undefined}
      />
      <Card padded style={{ marginBottom: "1.25rem" }}>
        {children}
      </Card>
    </>
  );
}

/**
 * These operator tables are wide by nature — supervisor, employee, retailer and
 * six metric columns. They scroll horizontally rather than becoming one card
 * per row, which for a few hundred rows would be unreadable; TableScrollHint is
 * what tells a phone user that is what is happening.
 */
export function OpsTable({ children, minWidth = 900 }: { children: ReactNode; minWidth?: number }) {
  return (
    <>
      <div className="kit-table-wrap is-always">
        <table className="kit-table" style={{ minWidth }}>
          {children}
        </table>
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

export function ProgressCell({ value }: { value: number }) {
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
    <Card padded style={{ marginBottom: "1.25rem" }}>
      <div className="kit-feed-head">
        <div style={{ minWidth: 0 }}>
          <span className="kit-label">Latest {label} data</span>
          <strong className="kit-figure">
            {businessDate ? new Date(businessDate).toLocaleDateString() : "No import yet"}
          </strong>
          {range ? <span className="kit-figure-sub">{range}</span> : null}
        </div>
        <Badge tone={businessDate ? "complete" : "pending"}>{businessDate ? "Imported" : "No data"}</Badge>
      </div>
      <p className="kit-feed-file" title={fileName || ""}>
        {fileName || "Upload a source file"}
      </p>
      <p className="kit-figure-sub">
        {uploadedAt ? `Imported ${new Date(uploadedAt).toLocaleString()}` : "No import history available"}
      </p>
    </Card>
  );
}

/**
 * The SSO and LSO worklists, shared.
 *
 * These pages did not exist before — the RSO demo specifies them and the app
 * only had the adjacent `/rso/attention`. The two are the same worklist over
 * different completion rules, so they are one component.
 *
 * The ordering rule from the demo is preserved exactly: pending retailers are
 * grouped first and completed ones follow in their own de-emphasised section,
 * still visible so the count can be checked. Only the default "Pending first"
 * sort groups this way; every other sort shows one flat list.
 *
 * Thresholds are never hardcoded here — they arrive from lib/business-rules
 * through the caller, so SSO's "2 standard GA in a month" and LSO's "৳500 and
 * 7 transactions" stay defined in one place.
 */

import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, ProgressLine, SummaryStrip } from "../components/Kit";
import { Icon } from "../components/icons";

export type WorklistRow = {
  id: string;
  name: string;
  code: string;
  bpName: string;
  current: number;
  remaining: string;
  complete: boolean;
};

const SORTS = [
  { key: "pending", label: "Pending First" },
  { key: "low", label: "Lowest Progress" },
  { key: "high", label: "Highest Progress" },
  { key: "name", label: "Name A–Z" },
] as const;
export type WorklistSort = (typeof SORTS)[number]["key"];

export function resolveSort(value?: string): WorklistSort {
  return (SORTS.find((s) => s.key === value)?.key ?? "pending") as WorklistSort;
}

function WorklistCard({
  row,
  progressLabel,
  required,
  month,
}: {
  row: WorklistRow;
  progressLabel: string;
  required: number;
  month: string;
}) {
  return (
    <Link
      href={`/rso/retailers/${row.id}?month=${month}`}
      className={`kit-card kit-card-p is-clickable${row.complete ? " is-done" : ""}`}
    >
      <div className="kit-row-between is-top">
        <div className="kit-min0">
          <strong className="kit-rowtitle is-block">
            {row.name}
          </strong>
          <span className="kit-hint">
            {row.code} · BP: {row.bpName}
          </span>
        </div>
        <Badge tone={row.complete ? "complete" : "pending"}>{row.complete ? "Complete" : "Pending"}</Badge>
      </div>
      <div className="kit-mt-12">
        <ProgressLine label={progressLabel} current={row.current} target={required} />
      </div>
      {!row.complete && <p className="kit-remaining">Remaining: {row.remaining}</p>}
    </Link>
  );
}

export function OperationalWorklist({
  title,
  requirement,
  progressLabel,
  required,
  rows,
  month,
  sort,
  basePath,
  statusFilter,
}: {
  title: string;
  requirement: string;
  progressLabel: string;
  required: number;
  rows: WorklistRow[];
  month: string;
  sort: WorklistSort;
  basePath: string;
  statusFilter: "all" | "pending" | "complete";
}) {
  const total = rows.length;
  const complete = rows.filter((r) => r.complete).length;

  const visible = rows.filter((r) =>
    statusFilter === "all" ? true : statusFilter === "complete" ? r.complete : !r.complete,
  );

  const sortFn = (a: WorklistRow, b: WorklistRow) => {
    switch (sort) {
      case "low":
        return a.current - b.current || a.name.localeCompare(b.name);
      case "high":
        return b.current - a.current || a.name.localeCompare(b.name);
      case "name":
        return a.name.localeCompare(b.name);
      default:
        return 0;
    }
  };

  const pending = visible.filter((r) => !r.complete).sort(sortFn);
  const done = visible.filter((r) => r.complete).sort(sortFn);
  const grouped = sort === "pending";

  const link = (params: Record<string, string>) =>
    `${basePath}?${new URLSearchParams({ month, ...params }).toString()}`;

  return (
    <main className="page">
      <PageHeader title={title} subtitle={`${requirement} · ${total} retailers`} />

      <SummaryStrip
        items={[
          { label: "Total Retailers", value: total.toLocaleString() },
          { label: `${title} Complete`, value: complete.toLocaleString(), tone: "teal" },
          { label: `${title} Pending`, value: (total - complete).toLocaleString(), tone: "amber" },
          { label: "Completion", value: total ? `${Math.round((complete / total) * 100)}%` : "—" },
        ]}
      />

      <div className="kit-report-presets kit-mb-8">
        {(["all", "pending", "complete"] as const).map((s) => (
          <Link
            key={s}
            href={link({ ...(s === "all" ? {} : { status: s }), ...(sort === "pending" ? {} : { sort }) })}
            className={`kit-preset${statusFilter === s ? " is-active" : ""}`}
          >
            {s === "all" ? "All" : s === "pending" ? "Pending" : "Complete"}
          </Link>
        ))}
      </div>
      <div className="kit-report-presets kit-mb-16">
        {SORTS.map((s) => (
          <Link
            key={s.key}
            href={link({
              ...(statusFilter === "all" ? {} : { status: statusFilter }),
              ...(s.key === "pending" ? {} : { sort: s.key }),
            })}
            className={`kit-preset${sort === s.key ? " is-active" : ""}`}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            positive
            title={`All ${title} complete`}
            hint={`No ${title} work is outstanding for the retailers matching this filter.`}
            icon={<Icon name="check" />}
          />
        </Card>
      ) : grouped ? (
        <>
          <div className="kit-group-head">
            <span className="kit-group-dot" aria-hidden="true" />
            <h3>Pending ({pending.length})</h3>
          </div>
          {pending.length ? (
            <div className="kit-card-grid kit-mb-24">
              {pending.map((r) => (
                <WorklistCard key={r.id} row={r} progressLabel={progressLabel} required={required} month={month} />
              ))}
            </div>
          ) : (
            <Card className="kit-mb-24">
              <EmptyState
                positive
                title={`No pending ${title} retailers`}
                hint="Every outlet has met the requirement this month."
                icon={<Icon name="check" />}
              />
            </Card>
          )}

          <div className="kit-group-head">
            <span className="kit-group-dot is-done" aria-hidden="true" />
            <h3>Completed ({done.length})</h3>
          </div>
          {done.length ? (
            <div className="kit-card-grid">
              {done.map((r) => (
                <WorklistCard key={r.id} row={r} progressLabel={progressLabel} required={required} month={month} />
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState title="No completed retailers yet" icon={<Icon name="shop" />} />
            </Card>
          )}
        </>
      ) : (
        <div className="kit-card-grid">
          {[...visible].sort(sortFn).map((r) => (
            <WorklistCard key={r.id} row={r} progressLabel={progressLabel} required={required} month={month} />
          ))}
        </div>
      )}
    </main>
  );
}

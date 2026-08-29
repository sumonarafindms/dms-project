/**
 * Activity Log — migrated to the role-UI kit.
 *
 * Login, account, permission and administrative history. Timestamps render in
 * Asia/Dhaka because that is the business day every other figure in DMS is
 * counted against; "today" is the Dhaka day, not the server's UTC day.
 */

import Link from "next/link";
import { LiveFilterForm } from "../../components/LiveFilterForm";
import { Icon } from "../../components/icons";
import { requireUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { Card, EmptyState, PageHeader, SectionHead, SummaryStrip } from "../../components/Kit";
import type { Prisma } from "@prisma/client";

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Dhaka",
  }).format(d);

/** Midnight in Dhaka (UTC+6), expressed as the UTC instant to compare against. */
function dhakaDayStartUtc() {
  const shifted = new Date(Date.now() + 6 * 3600000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - 6 * 3600000);
}

const SHOWN_LIMIT = 250;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; module?: string; action?: string }>;
}) {
  await requireUser(["ADMIN", "IT"]);
  const sp = await searchParams,
    q = (sp.q || "").trim(),
    moduleFilter = (sp.module || "").trim(),
    actionFilter = (sp.action || "").trim();

  const where: Prisma.AuditLogWhereInput = {};
  if (moduleFilter) where.module = moduleFilter;
  if (actionFilter) where.action = actionFilter;
  if (q)
    where.OR = [
      { actorName: { contains: q, mode: "insensitive" } },
      { targetName: { contains: q, mode: "insensitive" } },
      { detail: { contains: q, mode: "insensitive" } },
      { action: { contains: q, mode: "insensitive" } },
    ];

  const [rows, total, today, logins] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: SHOWN_LIMIT }),
    prisma.auditLog.count(),
    prisma.auditLog.count({ where: { createdAt: { gte: dhakaDayStartUtc() } } }),
    prisma.auditLog.count({ where: { action: "LOGIN", createdAt: { gte: dhakaDayStartUtc() } } }),
  ]);
  const modules = await prisma.auditLog.findMany({
    distinct: ["module"],
    select: { module: true },
    orderBy: { module: "asc" },
  });
  const actions = await prisma.auditLog.findMany({
    distinct: ["action"],
    select: { action: true },
    orderBy: { action: "asc" },
  });

  const filtered = Boolean(q || moduleFilter || actionFilter);

  return (
    <main className="page">
      <PageHeader
        title="Activity Log"
        subtitle="Login, account, permission and administrative history. Times are Asia/Dhaka."
      />

      <SummaryStrip
        items={[
          { label: "Total Events", value: total.toLocaleString() },
          { label: "Today", value: today.toLocaleString(), tone: "teal" },
          { label: "Logins Today", value: logins.toLocaleString() },
          { label: "Shown", value: rows.length.toLocaleString() },
        ]}
      />

      <LiveFilterForm className="kit-filter-bar no-print">
        <div className="kit-search">
          <Icon name="search" />
          <input
            className="kit-input"
            name="q"
            defaultValue={q}
            placeholder="Search user, target or activity"
            autoComplete="off"
            aria-label="Search activity"
          />
        </div>
        <label className="kit-field">
          <span>Module</span>
          <select className="kit-select" name="module" defaultValue={moduleFilter}>
            <option value="">All modules</option>
            {modules.map((x) => (
              <option key={x.module}>{x.module}</option>
            ))}
          </select>
        </label>
        <label className="kit-field">
          <span>Action</span>
          <select className="kit-select" name="action" defaultValue={actionFilter}>
            <option value="">All actions</option>
            {actions.map((x) => (
              <option key={x.action}>{x.action}</option>
            ))}
          </select>
        </label>
        <span className="kit-filter-note">
          <Icon name="filter" /> Live filter
        </span>
        {filtered && (
          <Link className="kit-btn is-ghost size-sm" href="/admin/audit">
            Clear
          </Link>
        )}
      </LiveFilterForm>

      <SectionHead
        title={filtered ? `${rows.length} matching events` : "Recent activity"}
        sub={
          rows.length === SHOWN_LIMIT
            ? `Newest ${SHOWN_LIMIT} shown — narrow the filters to see older events.`
            : "Newest first."
        }
      />
      <Card padded>
        {rows.length ? (
          <div className="kit-timeline">
            {rows.map((x) => (
              <div className="kit-timeline-row" key={x.id}>
                <div className="kit-timeline-main">
                  <strong>{x.actorName}</strong>
                  <em>{x.actorRole}</em>
                  <p>
                    {x.action.replaceAll("_", " ")}
                    {x.targetName ? (
                      <>
                        {" · "}
                        <b>{x.targetName}</b>
                      </>
                    ) : null}
                  </p>
                  {(x.detail || x.module) && <small>{x.detail || x.module}</small>}
                </div>
                <div className="kit-timeline-meta">
                  <b>{x.module}</b>
                  <span>{fmt(x.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No matching activity"
            hint={filtered ? "Try a different search, module or action." : "Activity will appear here as it happens."}
            icon={<Icon name="search" />}
          />
        )}
      </Card>
    </main>
  );
}

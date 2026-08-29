/**
 * Activity Log — migrated to the role-UI kit.
 *
 * Login, account, permission and administrative history. Timestamps render in
 * Asia/Dhaka because that is the business day every other figure in DMS is
 * counted against; "today" is the Dhaka day, not the server's UTC day.
 */

import Link from "next/link";
import { ServerSearchBar, ServerSelect } from "../../components/ServerSearchBar";
import { Icon } from "../../components/icons";
import { requireUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { ASSIGNMENT_MODULE } from "../../../lib/assignment-history";
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
  // Assignment history is excluded from the default view on purpose. One
  // retailer master upload can move thousands of retailers, and each move is
  // its own row — left in, a single upload would fill all 250 shown rows and
  // bury the login, permission and account events this page exists for. It is
  // one click away in the Module filter, and the count is shown below so it is
  // never hidden, only separated.
  if (moduleFilter) where.module = moduleFilter;
  else where.module = { not: ASSIGNMENT_MODULE };
  if (actionFilter) where.action = actionFilter;
  if (q)
    where.OR = [
      { actorName: { contains: q, mode: "insensitive" } },
      { targetName: { contains: q, mode: "insensitive" } },
      { detail: { contains: q, mode: "insensitive" } },
      { action: { contains: q, mode: "insensitive" } },
    ];

  const [rows, total, today, logins, assignmentEvents] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: SHOWN_LIMIT }),
    prisma.auditLog.count(),
    prisma.auditLog.count({ where: { createdAt: { gte: dhakaDayStartUtc() } } }),
    prisma.auditLog.count({ where: { action: "LOGIN", createdAt: { gte: dhakaDayStartUtc() } } }),
    prisma.auditLog.count({ where: { module: ASSIGNMENT_MODULE } }),
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

      {assignmentEvents > 0 && moduleFilter !== ASSIGNMENT_MODULE && (
        <div className="kit-note is-info kit-mb-20" role="note">
          <Icon name="info" />
          <span>
            {assignmentEvents.toLocaleString()} assignment change
            {assignmentEvents === 1 ? "" : "s"} recorded (retailer &rarr; RSO, RSO &rarr; supervisor, supervisor &rarr;
            manager). Kept out of this list so one master upload cannot bury everything else.{" "}
            <Link href={`/admin/audit?module=${ASSIGNMENT_MODULE}`}>View assignment history</Link>
          </span>
        </div>
      )}

      {/* Server-side search, because the Activity Log can hold years of rows
          and filtering only the 250 on screen would quietly miss the entry
          someone came here to find. The navigation is soft, so the input keeps
          focus and the page does not reload — see ServerSearchBar. */}
      <ServerSearchBar placeholder="Search user, target or activity" resultCount={rows.length} resultNoun="event">
        <ServerSelect paramName="module" label="Module" allLabel="All modules" options={modules.map((x) => x.module)} />
        <ServerSelect paramName="action" label="Action" allLabel="All actions" options={actions.map((x) => x.action)} />
        {filtered && (
          <Link className="kit-btn is-ghost size-sm" href="/admin/audit">
            Clear
          </Link>
        )}
      </ServerSearchBar>

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

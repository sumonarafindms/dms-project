import { prisma } from "./prisma";
import type { AuditActor } from "./audit";

/**
 * Who was assigned to whom, and when it changed.
 *
 * ## The problem this exists for
 *
 * `Retailer.employeeId` and `Employee.supervisorId` are plain foreign keys with
 * no dates on them. Every retailer master upload overwrites them, so when a
 * retailer moves from one RSO to another the previous owner is simply gone —
 * `lib/master-import.ts` even DETECTS the change (it counts the row as
 * updated) but has never written the old value anywhere.
 *
 * The consequence is not cosmetic. A July report run today attributes July's
 * GA, C2S and C2C to whoever owns the retailer TODAY, so past performance
 * silently changes under people's feet: an RSO's completed month can be
 * reassigned to a colleague by an upload that has nothing to do with July.
 * Targets, achievement and any "who did well last month" conversation inherit
 * the error.
 *
 * ## Why this is only half the fix, deliberately
 *
 * The full fix is effective-dated relationships — `assignedFrom` /
 * `assignedTo` columns, with the reports reading them by date, exactly as
 * `BpAssignment` and `lib/bp-period.ts` already do for BP. That needs a schema
 * migration.
 *
 * This module is the half that needs no migration and therefore can ship
 * immediately: it stops the loss. From now on every change is written to the
 * `AuditLog` table that already exists, with the old and new owner, so the
 * history is being ACCUMULATED. When the dated columns are added later they
 * can be backfilled from these rows instead of starting from an empty past.
 *
 * Waiting was the expensive option: each upload that happens before this is in
 * place destroys history that cannot be recovered afterwards.
 *
 * ## What "when" means here
 *
 * `createdAt` is when the change was RECORDED, which for a master upload is
 * the upload time — not necessarily the day the retailer actually moved in the
 * field. That is the best available signal and it is honest to say so: it is
 * accurate to the day the business system learned about the move. If the
 * source file ever carries a real effective date, pass it through and prefer
 * it.
 */

/** Its own module so the Activity Log can separate it from human actions. */
export const ASSIGNMENT_MODULE = "assignment";

export type AssignmentKind = "RETAILER_RSO" | "RSO_SUPERVISOR" | "SUPERVISOR_MANAGER";

export type AssignmentChange = {
  kind: AssignmentKind;
  /** The thing that moved: retailer id, employee id, supervisor id. */
  entityId: string;
  /** How a human recognises it — a code, a name, or both. */
  entityName: string;
  fromId: string | null;
  fromName: string | null;
  toId: string | null;
  toName: string | null;
};

const ACTION: Record<AssignmentKind, string> = {
  RETAILER_RSO: "REASSIGN_RETAILER_RSO",
  RSO_SUPERVISOR: "REASSIGN_RSO_SUPERVISOR",
  SUPERVISOR_MANAGER: "REASSIGN_SUPERVISOR_MANAGER",
};

const LABEL: Record<AssignmentKind, { entity: string; owner: string }> = {
  RETAILER_RSO: { entity: "Retailer", owner: "RSO" },
  RSO_SUPERVISOR: { entity: "RSO", owner: "Supervisor" },
  SUPERVISOR_MANAGER: { entity: "Supervisor", owner: "Manager" },
};

/** "moved from Karim to Rahim" / "assigned to Rahim" / "unassigned from Karim" */
export function describeChange(c: AssignmentChange) {
  const { entity, owner } = LABEL[c.kind];
  const from = c.fromName || (c.fromId ? "(unknown)" : null);
  const to = c.toName || (c.toId ? "(unknown)" : null);
  if (from && to) return `${entity} ${c.entityName}: ${owner} changed from ${from} to ${to}`;
  if (to) return `${entity} ${c.entityName}: ${owner} set to ${to}`;
  if (from) return `${entity} ${c.entityName}: removed from ${owner} ${from}`;
  return `${entity} ${c.entityName}: ${owner} unchanged`;
}

/** Only real moves are worth a row. */
export const isRealChange = (c: AssignmentChange) => c.fromId !== c.toId;

/**
 * Write the changes. Returns how many rows were written.
 *
 * Never throws. A failure to record history must not fail an otherwise valid
 * import — the same choice `lib/audit.ts` makes — but it is logged loudly
 * because a silent gap in history is exactly the problem this module exists to
 * end.
 */
export async function recordAssignmentChanges(
  actor: AuditActor | null,
  changes: AssignmentChange[],
  source?: string,
): Promise<number> {
  const real = changes.filter(isRealChange);
  if (!real.length) return 0;
  const rows = real.map((c) => ({
    actorId: actor?.id || null,
    actorName: actor?.displayName || "System",
    actorRole: actor?.role || "SYSTEM",
    action: ACTION[c.kind],
    module: ASSIGNMENT_MODULE,
    targetType: LABEL[c.kind].entity,
    targetId: c.entityId,
    targetName: c.entityName,
    detail: describeChange(c),
    metadata: {
      kind: c.kind,
      fromId: c.fromId,
      fromName: c.fromName,
      toId: c.toId,
      toName: c.toName,
      ...(source ? { source } : {}),
    },
  }));
  try {
    // Chunked: a first retailer master upload can move thousands of rows at
    // once, and one enormous INSERT is where that would fall over.
    let written = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const slice = rows.slice(i, i + 500);
      const res = await prisma.auditLog.createMany({ data: slice });
      written += res.count;
    }
    return written;
  } catch (e) {
    console.error(`Assignment history NOT recorded for ${rows.length} change(s)`, e);
    return 0;
  }
}

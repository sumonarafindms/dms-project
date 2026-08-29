import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getCurrentUser } from "../../../../lib/auth";
import { recordAssignmentChanges, type AssignmentChange } from "../../../../lib/assignment-history";

export async function PATCH(req: Request) {
  const me = await getCurrentUser();
  if (!me || !["ADMIN", "IT"].includes(me.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json(),
    supervisorId = String(b.supervisorId || ""),
    rsoIds = Array.isArray(b.rsoIds) ? b.rsoIds.map(String) : [];
  const sup = await prisma.supervisor.findUnique({ where: { id: supervisorId } });
  if (!sup) return NextResponse.json({ error: "Supervisor not found" }, { status: 404 });

  // Read the affected RSOs BEFORE the write: this endpoint moves people in two
  // directions at once — some joining this supervisor, some being removed from
  // them — and after the update the previous owner is unrecoverable.
  const affected = await prisma.employee.findMany({
    where: { OR: [{ supervisorId }, { id: { in: rsoIds } }] },
    select: { id: true, name: true, employeeCode: true, rsoMsisdn: true, supervisorId: true },
  });
  const priorIds = [...new Set(affected.map((e) => e.supervisorId).filter(Boolean))] as string[];
  const priorNames = new Map(
    (await prisma.supervisor.findMany({ where: { id: { in: priorIds } }, select: { id: true, name: true } })).map(
      (s) => [s.id, s.name],
    ),
  );

  await prisma.$transaction([
    prisma.employee.updateMany({ where: { supervisorId, id: { notIn: rsoIds } }, data: { supervisorId: null } }),
    prisma.employee.updateMany({ where: { id: { in: rsoIds } }, data: { supervisorId } }),
  ]);

  const wanted = new Set(rsoIds);
  const changes: AssignmentChange[] = affected.map((e) => {
    const toId = wanted.has(e.id) ? supervisorId : null;
    return {
      kind: "RSO_SUPERVISOR" as const,
      entityId: e.id,
      entityName: `${e.employeeCode || e.rsoMsisdn} — ${e.name}`,
      fromId: e.supervisorId,
      fromName: e.supervisorId ? (priorNames.get(e.supervisorId) ?? null) : null,
      toId,
      toName: toId ? sup.name : null,
    };
  });
  // recordAssignmentChanges drops the no-ops, so an RSO who was already on this
  // team and stayed produces no row.
  const recorded = await recordAssignmentChanges(me, changes, "supervisor team editor");

  return NextResponse.json({ ok: true, count: rsoIds.length, reassigned: recorded });
}

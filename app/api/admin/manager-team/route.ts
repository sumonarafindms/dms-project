import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getCurrentUser } from "../../../../lib/auth";
import { recordAssignmentChanges, type AssignmentChange } from "../../../../lib/assignment-history";

export async function PATCH(req: Request) {
  const me = await getCurrentUser();
  if (!me || !["ADMIN", "IT"].includes(me.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json(),
    managerId = String(b.managerId || ""),
    supervisorIds = Array.isArray(b.supervisorIds) ? b.supervisorIds.map(String) : [];
  const manager = await prisma.user.findUnique({ where: { id: managerId } });
  if (!manager || manager.role !== "MANAGER") return NextResponse.json({ error: "Manager not found" }, { status: 404 });

  // Before the write, for the same reason as the supervisor team editor: this
  // both adds and removes, and the previous manager is gone afterwards.
  const affected = await prisma.managerSupervisor.findMany({
    where: { OR: [{ managerId }, { supervisorId: { in: supervisorIds } }] },
    select: { managerId: true, supervisorId: true },
  });
  const supervisorNames = new Map(
    (
      await prisma.supervisor.findMany({
        where: { id: { in: [...new Set([...affected.map((a) => a.supervisorId), ...supervisorIds])] } },
        select: { id: true, name: true },
      })
    ).map((s) => [s.id, s.name]),
  );
  const managerNames = new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: [...new Set([...affected.map((a) => a.managerId), managerId])] } },
        select: { id: true, displayName: true },
      })
    ).map((u) => [u.id, u.displayName]),
  );
  const priorManager = new Map(affected.map((a) => [a.supervisorId, a.managerId]));

  await prisma.$transaction(async (tx) => {
    await tx.managerSupervisor.deleteMany({ where: { managerId, supervisorId: { notIn: supervisorIds } } });
    for (const supervisorId of supervisorIds) {
      await tx.managerSupervisor.upsert({
        where: { supervisorId },
        update: { managerId },
        create: { managerId, supervisorId },
      });
    }
  });

  const wanted = new Set(supervisorIds);
  const touched = new Set([...affected.map((a) => a.supervisorId), ...supervisorIds]);
  const changes: AssignmentChange[] = [...touched].map((supervisorId) => {
    const fromId = priorManager.get(supervisorId) ?? null;
    const toId = wanted.has(supervisorId) ? managerId : null;
    return {
      kind: "SUPERVISOR_MANAGER" as const,
      entityId: supervisorId,
      entityName: supervisorNames.get(supervisorId) ?? supervisorId,
      fromId,
      fromName: fromId ? (managerNames.get(fromId) ?? null) : null,
      toId,
      toName: toId ? (managerNames.get(toId) ?? null) : null,
    };
  });
  const recorded = await recordAssignmentChanges(me, changes, "manager team editor");

  return NextResponse.json({ ok: true, count: supervisorIds.length, reassigned: recorded });
}

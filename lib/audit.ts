import { prisma } from "./prisma";
export type AuditActor = { id: string; displayName: string; role: string };
export async function audit(
  actor: AuditActor | null,
  action: string,
  module: string,
  opts?: {
    targetType?: string;
    targetId?: string;
    targetName?: string;
    detail?: string;
    metadata?: Record<string, unknown>;
  },
) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actor?.id || null,
        actorName: actor?.displayName || "System",
        actorRole: actor?.role || "SYSTEM",
        action,
        module,
        targetType: opts?.targetType || null,
        targetId: opts?.targetId || null,
        targetName: opts?.targetName || null,
        detail: opts?.detail || null,
        metadata: opts?.metadata as any,
      },
    });
  } catch (e) {
    console.error("Audit log failed", e);
  }
}

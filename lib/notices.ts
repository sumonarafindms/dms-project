/**
 * v203 — the notice board, read side. See prisma/schema.prisma `Notice` and
 * lib/notice-rules.ts for what a notice is and who may post one.
 */

import { prisma } from "./prisma";
import { managerScope } from "./manager-scope";
import { dhakaTodayYmd } from "./business-time";
import type { NoticeView } from "./notice-rules";

type Reader = {
  id: string;
  role: string;
  employeeId?: string | null;
  supervisorId?: string | null;
  bpRetailerId?: string | null;
};

/** The teams (supervisor ids) a reader belongs to, for notices a Manager aimed at their teams. */
async function teamsOf(r: Reader): Promise<string[]> {
  if (r.role === "SUPERVISOR") return r.supervisorId ? [r.supervisorId] : [];
  if (r.role === "RSO" && r.employeeId) {
    const e = await prisma.employee.findUnique({ where: { id: r.employeeId }, select: { supervisorId: true } });
    return e?.supervisorId ? [e.supervisorId] : [];
  }
  if (r.role === "BP" && r.bpRetailerId) {
    const a = await prisma.bpAssignment.findMany({
      where: { retailerId: r.bpRetailerId, active: true },
      select: { employee: { select: { supervisorId: true } } },
    });
    return [...new Set(a.map((x) => x.employee.supervisorId).filter((x): x is string => !!x))];
  }
  if (r.role === "MANAGER") return (await managerScope(r.id)).supervisorIds;
  return [];
}

const view = (n: {
  id: string;
  title: string;
  body: string;
  urgent: boolean;
  expiresOn: Date | null;
  createdAt: Date;
  createdByName: string;
}): NoticeView => ({
  id: n.id,
  title: n.title,
  body: n.body,
  urgent: n.urgent,
  expiresOn: n.expiresOn ? n.expiresOn.toISOString().slice(0, 10) : null,
  createdAt: n.createdAt.toISOString(),
  createdByName: n.createdByName,
});

/** The notices this person should see today, urgent first, newest first. */
export async function noticesFor(reader: Reader): Promise<NoticeView[]> {
  const today = new Date(`${dhakaTodayYmd()}T00:00:00.000Z`);
  const [rows, teams] = await Promise.all([
    prisma.notice.findMany({
      where: {
        active: true,
        audience: { has: reader.role },
        OR: [{ expiresOn: null }, { expiresOn: { gte: today } }],
      },
      orderBy: [{ urgent: "desc" }, { createdAt: "desc" }],
      take: 20,
    }),
    teamsOf(reader),
  ]);
  return rows.filter((n) => !n.supervisorIds.length || n.supervisorIds.some((s) => teams.includes(s))).map(view);
}

export type ManagedNotice = NoticeView & { audience: string[]; active: boolean; live: boolean; teamOnly: boolean };

/** Every notice a poster may manage: all of them, or a Manager's own. */
export async function noticesToManage(poster: { id: string; role: string }): Promise<ManagedNotice[]> {
  const today = dhakaTodayYmd();
  const rows = await prisma.notice.findMany({
    where: poster.role === "MANAGER" ? { createdById: poster.id } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((n) => {
    const v = view(n);
    return {
      ...v,
      audience: n.audience,
      active: n.active,
      live: n.active && (!v.expiresOn || v.expiresOn >= today),
      teamOnly: n.supervisorIds.length > 0,
    };
  });
}

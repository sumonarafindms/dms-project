/**
 * v205 — Due reminders: everyone in the viewer's scope who owes money, with
 * the last time money came in from them and the last time they were reminded.
 *
 * The due is the ledger's own (`holderDues`), per person, never summed into a
 * figure presented as anybody's. "Reminded" is read from the audit log
 * (action REMIND_DUE), written when a reminder is sent from the list — no new
 * table, and the log is where "who chased whom, when" belongs anyway.
 */

import { prisma } from "./prisma";
import { holderDues, holderKey, type StockScope } from "./stock-data";
import type { HolderType } from "./stock";

export type ReminderRow = {
  key: string;
  type: HolderType;
  id: string;
  name: string;
  code: string | null;
  supervisorName: string | null;
  inactive: boolean;
  due: number;
  phone: string | null;
  phones: string[];
  lastDeposit: string | null;
  lastAmount: number | null;
  lastReminded: string | null;
  lastRemindedBy: string | null;
};

export async function dueReminders(scope: StockScope): Promise<ReminderRow[]> {
  const dues = (await holderDues(scope)).filter((h) => h.due > 0);
  if (!dues.length) return [];
  const [deposits, reminded] = await Promise.all([
    prisma.$queryRaw<{ holderType: string; holderId: string; date: Date; amount: string }[]>`
      SELECT DISTINCT ON ("holderType", "holderId")
             "holderType"::text AS "holderType", "holderId", "date", ("cash" + "bank") AS amount
        FROM "CashDeposit"
       WHERE "cash" > 0 OR "bank" > 0
       ORDER BY "holderType", "holderId", "date" DESC`,
    prisma.auditLog.findMany({
      where: { action: "REMIND_DUE", targetId: { in: dues.map((d) => holderKey(d.type, d.id)) } },
      orderBy: { createdAt: "desc" },
      select: { targetId: true, createdAt: true, actorName: true },
      take: 2000,
    }),
  ]);
  const lastDep = new Map(deposits.map((d) => [holderKey(d.holderType as HolderType, d.holderId), d]));
  const lastRem = new Map<string, { at: Date; by: string }>();
  for (const r of reminded)
    if (r.targetId && !lastRem.has(r.targetId)) lastRem.set(r.targetId, { at: r.createdAt, by: r.actorName });

  return dues.map((h) => {
    const key = holderKey(h.type, h.id);
    const dep = lastDep.get(key);
    const rem = lastRem.get(key);
    return {
      key,
      type: h.type,
      id: h.id,
      name: h.name,
      code: h.code,
      supervisorName: h.supervisorName,
      inactive: !!h.inactive,
      due: h.due,
      phone: h.loginPhone ?? h.phones?.[0] ?? null,
      phones: h.phones ?? [],
      lastDeposit: dep ? dep.date.toISOString().slice(0, 10) : null,
      lastAmount: dep ? Number(dep.amount) : null,
      lastReminded: rem ? rem.at.toISOString() : null,
      lastRemindedBy: rem?.by ?? null,
    };
  });
}

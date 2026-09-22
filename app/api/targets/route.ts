import { apiUser, apiPermission } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { monthBounds } from "@/lib/month";
import { audit } from "@/lib/audit";
import { RATE_LIMITS, consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { bpDisplayName } from "@/lib/bp-name";

function monthFromParam(value: string | null) {
  const fallback = new Date();
  const text =
    value && /^\d{4}-\d{2}$/.test(value)
      ? `${value}-01T00:00:00.000Z`
      : `${fallback.getUTCFullYear()}-${String(fallback.getUTCMonth() + 1).padStart(2, "0")}-01T00:00:00.000Z`;
  return monthBounds(text).start;
}

export async function GET(request: NextRequest) {
  if (!(await apiUser(["ADMIN", "IT"])))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await apiPermission("targets", "view"))) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const month = monthFromParam(request.nextUrl.searchParams.get("month"));

  const { end } = monthBounds(month.toISOString());
  const [employees, bpAssignments, supervisors] = await Promise.all([
    prisma.employee.findMany({
      where: { active: true },
      include: {
        supervisor: true,
        targets: { where: { month } },
        manualMetrics: { where: { month } },
        _count: { select: { retailers: true } },
      },
      orderBy: [{ supervisor: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.bpAssignment.findMany({
      where: { startDate: { lt: end }, OR: [{ endDate: null }, { endDate: { gte: month } }] },
      include: {
        retailer: { select: { retailerCode: true, retailerName: true, bpName: true } },
        employee: { select: { name: true, rsoMsisdn: true, supervisorId: true } },
        monthlyTargets: { where: { month }, take: 1 },
      },
      orderBy: { createdAt: "asc" },
    }),
    /*
     * Every active supervisor, with their own target for this month.
     *
     * `_count.employees` is what lets the page say "8 RSOs" beside the figure,
     * so an operator setting a supervisor's target can see the size of the team
     * it covers without leaving the screen.
     */
    prisma.supervisor.findMany({
      where: { active: true },
      include: { targets: { where: { month }, take: 1 }, _count: { select: { employees: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  return NextResponse.json({
    month: month.toISOString().slice(0, 7),
    /*
     * The supervisor rows carry no reference figure of their own.
     *
     * The page works out "what this used to add up to" from `rows` and
     * `bpRows`, which it already has — hence `supervisorId` on both below.
     * Computing it here would mean repeating the RSO-plus-BP arithmetic in a
     * second place, and that arithmetic having lived in several places at once
     * is most of what v181 is fixing.
     */
    supRows: supervisors.map((s) => {
      const t = s.targets[0];
      return {
        supervisorId: s.id,
        name: s.name,
        rsoCount: s._count.employees,
        /** False when no row exists: the page shows "not set", not a zero. */
        set: Boolean(t),
        gaTarget: t?.gaTarget ?? 0,
        c2cTarget: Number(t?.c2cTarget ?? 0),
        scTarget: Number(t?.scTarget ?? 0),
        totalRechargeTarget: Number(t?.totalRechargeTarget ?? 0),
        ssoTarget: t?.ssoTarget ?? 0,
        lsoTarget: t?.lsoTarget ?? 0,
      };
    }),
    bpRows: bpAssignments.map((a) => ({
      assignmentId: a.id,
      bpCode: a.retailer.retailerCode,
      bpName: bpDisplayName(a.retailer),
      rsoName: a.employee.name,
      rsoMsisdn: a.employee.rsoMsisdn,
      supervisorId: a.employee.supervisorId,
      gaTarget: a.monthlyTargets[0]?.gaTarget ?? a.gaTarget,
    })),
    rows: employees.map((employee) => {
      const target = employee.targets[0];
      const manual = employee.manualMetrics[0];
      return {
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        rsoMsisdn: employee.rsoMsisdn,
        name: employee.name,
        supervisor: employee.supervisor?.name ?? "Unassigned",
        supervisorId: employee.supervisorId,
        retailerCount: employee._count.retailers,
        gaTarget: target?.gaTarget ?? 0,
        c2cTarget: Number(target?.c2cTarget ?? 0),
        scTarget: Number(target?.scTarget ?? 0),
        totalRechargeTarget: Number(target?.totalRechargeTarget ?? 0),
        ssoTarget: target?.ssoTarget ?? 0,
        lsoTarget: target?.lsoTarget ?? 0,
        scAchieved: Number(manual?.scAchieved ?? 0),
      };
    }),
  });
}

export async function POST(request: NextRequest) {
  const actor = await apiUser(["ADMIN", "IT"]);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await apiPermission("targets", "update")))
    return NextResponse.json({ error: "You do not have permission to update targets." }, { status: 403 });
  const rl = await consumeRateLimit(RATE_LIMITS.mutation, actor.id);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl.retryAfterSeconds);
    return NextResponse.json(r.body, r.init);
  }
  const body = await request.json();
  if (!body?.month || !/^\d{4}-\d{2}$/.test(body.month) || !Array.isArray(body.rows)) {
    return NextResponse.json({ error: "Invalid month or rows" }, { status: 400 });
  }

  const month = monthBounds(`${body.month}-01T00:00:00.000Z`).start;
  const employeeIds = body.rows.map((row: any) => String(row.employeeId ?? "")).filter(Boolean);
  const validEmployees = await prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true } });
  const validIds = new Set(validEmployees.map((employee) => employee.id));

  let saved = 0;
  let supervisorsSaved = 0;
  await prisma.$transaction(async (tx) => {
    for (const row of body.rows) {
      const employeeId = String(row.employeeId ?? "");
      if (!validIds.has(employeeId)) continue;

      const gaTarget = Math.max(0, Math.trunc(Number(row.gaTarget) || 0));
      const c2cTarget = Math.max(0, Number(row.c2cTarget) || 0);
      const scTarget = Math.max(0, Number(row.scTarget) || 0);
      const totalRechargeTarget = Math.max(0, Number(row.totalRechargeTarget) || c2cTarget + scTarget);
      const ssoTarget = Math.max(0, Math.trunc(Number(row.ssoTarget) || 0));
      const lsoTarget = Math.max(0, Math.trunc(Number(row.lsoTarget) || 0));
      const scAchieved = Math.max(0, Number(row.scAchieved) || 0);

      await tx.monthlyTarget.upsert({
        where: { employeeId_month: { employeeId, month } },
        update: { gaTarget, c2cTarget, scTarget, totalRechargeTarget, ssoTarget, lsoTarget },
        create: { employeeId, month, gaTarget, c2cTarget, scTarget, totalRechargeTarget, ssoTarget, lsoTarget },
      });

      await tx.manualMetric.upsert({
        where: { employeeId_month: { employeeId, month } },
        update: { scAchieved },
        create: { employeeId, month, scAchieved },
      });
      saved += 1;
    }
    /*
     * Supervisor targets.
     *
     * Same shape as an RSO row and saved in the same transaction, because an
     * operator setting a month's targets is doing one thing: a save that wrote
     * the RSO rows and then failed on the supervisors would leave the two
     * halves of one month disagreeing with each other.
     */
    if (Array.isArray(body.supRows)) {
      const ids = body.supRows.map((row: { supervisorId?: unknown }) => String(row.supervisorId ?? "")).filter(Boolean);
      const valid = new Set(
        (await tx.supervisor.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((x) => x.id),
      );
      for (const row of body.supRows as Record<string, unknown>[]) {
        const supervisorId = String(row.supervisorId ?? "");
        if (!valid.has(supervisorId)) continue;
        /*
         * Only rows somebody actually set.
         *
         * The page posts every supervisor it is showing, set or not. Upserting
         * all of them turned "no target set" into "a target of zero" for every
         * supervisor on the first press of Save — which destroys the one
         * distinction this feature rests on, and does it silently. `set` is
         * true from the moment a person edits the row (see applyDraft).
         */
        if (row.set !== true) continue;
        const gaTarget = Math.max(0, Math.trunc(Number(row.gaTarget) || 0));
        const c2cTarget = Math.max(0, Number(row.c2cTarget) || 0);
        const scTarget = Math.max(0, Number(row.scTarget) || 0);
        const totalRechargeTarget = Math.max(0, Number(row.totalRechargeTarget) || c2cTarget + scTarget);
        const ssoTarget = Math.max(0, Math.trunc(Number(row.ssoTarget) || 0));
        const lsoTarget = Math.max(0, Math.trunc(Number(row.lsoTarget) || 0));
        await tx.supervisorMonthlyTarget.upsert({
          where: { supervisorId_month: { supervisorId, month } },
          update: { gaTarget, c2cTarget, scTarget, totalRechargeTarget, ssoTarget, lsoTarget },
          create: { supervisorId, month, gaTarget, c2cTarget, scTarget, totalRechargeTarget, ssoTarget, lsoTarget },
        });
        supervisorsSaved += 1;
      }
    }
    if (Array.isArray(body.bpRows)) {
      for (const row of body.bpRows) {
        const assignmentId = String(row.assignmentId || "");
        if (!assignmentId) continue;
        const exists = await tx.bpAssignment.findUnique({ where: { id: assignmentId }, select: { id: true } });
        if (!exists) continue;
        await tx.bpMonthlyTarget.upsert({
          where: { assignmentId_month: { assignmentId, month } },
          update: { gaTarget: Math.max(0, Math.trunc(Number(row.gaTarget) || 0)) },
          create: { assignmentId, month, gaTarget: Math.max(0, Math.trunc(Number(row.gaTarget) || 0)) },
        });
      }
    }
  });

  await audit(actor, "UPDATE_TARGETS", "targets", {
    detail: `Updated ${saved} RSO and ${supervisorsSaved} supervisor target row(s) for ${body.month}`,
    metadata: { month: body.month, saved, supervisorsSaved },
  });
  return NextResponse.json({ saved, supervisorsSaved, month: body.month });
}

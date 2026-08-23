import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { monthBounds } from "@/lib/month";

function monthFromParam(value: string | null) {
  const fallback = new Date();
  const text = value && /^\d{4}-\d{2}$/.test(value)
    ? `${value}-01T00:00:00.000Z`
    : `${fallback.getUTCFullYear()}-${String(fallback.getUTCMonth() + 1).padStart(2, "0")}-01T00:00:00.000Z`;
  return monthBounds(text).start;
}

export async function GET(request: NextRequest) {
  const month = monthFromParam(request.nextUrl.searchParams.get("month"));

  const employees = await prisma.employee.findMany({
    where: { active: true },
    include: {
      supervisor: true,
      targets: { where: { month } },
      manualMetrics: { where: { month } },
      _count: { select: { retailers: true } },
    },
    orderBy: [{ supervisor: { name: "asc" } }, { name: "asc" }],
  });

  return NextResponse.json({
    month: month.toISOString().slice(0, 7),
    rows: employees.map((employee) => {
      const target = employee.targets[0];
      const manual = employee.manualMetrics[0];
      return {
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        rsoMsisdn: employee.rsoMsisdn,
        name: employee.name,
        supervisor: employee.supervisor?.name ?? "Unassigned",
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
  const body = await request.json();
  if (!body?.month || !/^\d{4}-\d{2}$/.test(body.month) || !Array.isArray(body.rows)) {
    return NextResponse.json({ error: "Invalid month or rows" }, { status: 400 });
  }

  const month = monthBounds(`${body.month}-01T00:00:00.000Z`).start;
  const employeeIds = body.rows.map((row: any) => String(row.employeeId ?? "")).filter(Boolean);
  const validEmployees = await prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true } });
  const validIds = new Set(validEmployees.map((employee) => employee.id));

  let saved = 0;
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
  });

  return NextResponse.json({ saved, month: body.month });
}

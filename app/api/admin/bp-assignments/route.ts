import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getCurrentUser } from "../../../../lib/auth";
import { dhakaTodayYmd } from "../../../../lib/business-time";
function parseDay(value: unknown) {
  const s = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || !["ADMIN", "IT"].includes(me.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json();
  const employeeId = String(b.employeeId || ""),
    retailerId = String(b.retailerId || ""),
    startDate = parseDay(b.startDate),
    gaTarget = Math.max(0, Math.trunc(Number(b.gaTarget) || 0));
  if (!employeeId || !retailerId || !startDate)
    return NextResponse.json({ error: "RSO, retailer and effective date are required." }, { status: 400 });
  const retailer = await prisma.retailer.findUnique({
    where: { id: retailerId },
    select: { id: true, retailerCode: true, employeeId: true, active: true },
  });
  if (!retailer?.active) return NextResponse.json({ error: "Retailer was not found or is inactive." }, { status: 400 });
  if (retailer.employeeId !== employeeId)
    return NextResponse.json({ error: "This retailer is not assigned under the selected RSO." }, { status: 400 });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const old = await tx.bpAssignment.findFirst({
        where: { employeeId, active: true },
        include: { retailer: { select: { id: true } } },
      });
      const other = await tx.bpAssignment.findFirst({
        where: { retailerId, active: true, employeeId: { not: employeeId } },
      });
      if (other) throw new Error("This retailer is already an active BP under another RSO.");
      if (old?.retailerId === retailerId) {
        const same = await tx.bpAssignment.update({ where: { id: old.id }, data: { startDate, gaTarget } });
        return { assignment: same, transferredLogin: false };
      }
      if (old)
        await tx.bpAssignment.update({
          where: { id: old.id },
          data: { active: false, endDate: new Date(startDate.getTime() - 86400000) },
        });
      let transferredLogin = false;
      if (old) {
        const user = await tx.user.findFirst({ where: { role: "BP", bpRetailerId: old.retailerId, active: true } });
        if (user) {
          const collision = await tx.user.findFirst({ where: { bpRetailerId: retailerId, id: { not: user.id } } });
          if (collision) throw new Error("The new retailer already has a BP login linked to it.");
          await tx.user.update({ where: { id: user.id }, data: { bpRetailerId: retailerId } });
          transferredLogin = true;
        }
      }
      const assignment = await tx.bpAssignment.create({
        data: { employeeId, retailerId, startDate, gaTarget, active: true },
      });
      return { assignment, transferredLogin };
    });
    return NextResponse.json({
      ok: true,
      id: result.assignment.id,
      code: retailer.retailerCode,
      transferredLogin: result.transferredLogin,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not assign BP." }, { status: 400 });
  }
}
export async function PATCH(req: Request) {
  const me = await getCurrentUser();
  if (!me || !["ADMIN", "IT"].includes(me.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json();
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ error: "Assignment is required" }, { status: 400 });
  const a = await prisma.bpAssignment.findUnique({ where: { id } });
  if (!a) return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  const endDate = parseDay(b.endDate) || new Date(`${dhakaTodayYmd()}T00:00:00.000Z`);
  await prisma.$transaction(async (tx) => {
    await tx.bpAssignment.update({ where: { id }, data: { active: false, endDate } });
    await tx.user.updateMany({ where: { role: "BP", bpRetailerId: a.retailerId }, data: { bpRetailerId: null } });
  });
  return NextResponse.json({ ok: true });
}

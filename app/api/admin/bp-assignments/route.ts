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
  /*
   * An RSO may hold SEVERAL Business Partners at once.
   *
   * This route used to enforce one. Adding a BP found that RSO's existing
   * active assignment, ended it with `endDate = startDate - 1`, and moved its
   * BP login to the new retailer — all silently, reported as a successful
   * "assign". So an owner who added a second BP got a second BP and lost the
   * first, and the target list showed one name where they expected two. That
   * is what "the new BP's name does not appear" actually was: it did appear,
   * and the other one had gone.
   *
   * The only real constraint is on the RETAILER: one outlet cannot be an
   * active BP twice, under this RSO or another. Ending an assignment is its
   * own deliberate action (PATCH below), which is where it belongs — a
   * side-effect of adding is not a decision anyone made.
   */
  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.bpAssignment.findFirst({ where: { retailerId, active: true } });
      if (existing && existing.employeeId !== employeeId)
        throw new Error("This retailer is already an active BP under another RSO.");
      // Re-assigning the same retailer to the same RSO edits the assignment in
      // place rather than creating a duplicate.
      if (existing) {
        const same = await tx.bpAssignment.update({ where: { id: existing.id }, data: { startDate, gaTarget } });
        return { assignment: same, updated: true };
      }
      const assignment = await tx.bpAssignment.create({
        data: { employeeId, retailerId, startDate, gaTarget, active: true },
      });
      return { assignment, updated: false };
    });
    return NextResponse.json({
      ok: true,
      id: result.assignment.id,
      code: retailer.retailerCode,
      updated: result.updated,
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

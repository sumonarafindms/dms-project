import { NextResponse } from "next/server";
import { bpNameToStore } from "@/lib/bp-name";
import { prisma } from "../../../../lib/prisma";
import { getCurrentUser } from "../../../../lib/auth";
import { RATE_LIMITS, consumeRateLimit, rateLimitResponse } from "../../../../lib/rate-limit";
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
  const rl = await consumeRateLimit(RATE_LIMITS.mutation, me.id);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl.retryAfterSeconds);
    return NextResponse.json(r.body, r.init);
  }
  const b = await req.json();
  const employeeId = String(b.employeeId || ""),
    retailerId = String(b.retailerId || ""),
    startDate = parseDay(b.startDate),
    gaTarget = Math.max(0, Math.trunc(Number(b.gaTarget) || 0)),
    /*
     * The third door onto a BP, and until v181 the only one with no name
     * field at all — so a BP created here had nothing but the master file's
     * retailer name, whatever an operator meant to call it. Blank leaves the
     * stored name exactly as it was; it does not wipe one set elsewhere.
     */
    bpName = bpNameToStore(b.bpName);
  if (!employeeId || !retailerId || !startDate)
    return NextResponse.json({ error: "RSO, retailer and effective date are required." }, { status: 400 });
  const retailer = await prisma.retailer.findUnique({
    where: { id: retailerId },
    select: { id: true, retailerCode: true, employeeId: true, active: true },
  });
  if (!retailer?.active) return NextResponse.json({ error: "Retailer was not found or is inactive." }, { status: 400 });
  /*
   * BP and RSO are MANY-TO-MANY. Both directions, and neither is a mistake.
   *
   * One RSO may hold several Business Partners — that was v139, after adding a
   * second BP was found to be silently ending the first.
   *
   * One BP may now be held by several RSOs, which is this version. Two
   * constraints used to stand in the way and both are gone:
   *
   *   - The retailer had to be owned by the selected RSO
   *     (`retailer.employeeId !== employeeId`). At most one RSO owns a
   *     retailer in the master list, so this made a second RSO impossible by
   *     construction.
   *   - An outlet could be an active BP only once
   *     ("already an active BP under another RSO").
   *
   * What remains is the one rule that is still true: the SAME retailer under
   * the SAME RSO cannot exist twice. That is not a business rule so much as
   * arithmetic — two identical live assignments would target and count the
   * same outlet twice for one person.
   *
   * Ending an assignment stays its own deliberate action (PATCH below). A
   * side-effect of adding is not a decision anyone made.
   */
  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.bpAssignment.findFirst({ where: { retailerId, employeeId, active: true } });
      // Re-assigning the same retailer to the same RSO edits the assignment in
      // place rather than creating a duplicate.
      if (existing) {
        const same = await tx.bpAssignment.update({ where: { id: existing.id }, data: { startDate, gaTarget } });
        if (bpName) await tx.retailer.update({ where: { id: retailerId }, data: { bpName } });
        return { assignment: same, updated: true };
      }
      const assignment = await tx.bpAssignment.create({
        data: { employeeId, retailerId, startDate, gaTarget, active: true },
      });
      if (bpName) await tx.retailer.update({ where: { id: retailerId }, data: { bpName } });
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
  const rl = await consumeRateLimit(RATE_LIMITS.mutation, me.id);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl.retryAfterSeconds);
    return NextResponse.json(r.body, r.init);
  }
  const b = await req.json();
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ error: "Assignment is required" }, { status: 400 });
  const a = await prisma.bpAssignment.findUnique({ where: { id } });
  if (!a) return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  const endDate = parseDay(b.endDate) || new Date(`${dhakaTodayYmd()}T00:00:00.000Z`);
  await prisma.$transaction(async (tx) => {
    await tx.bpAssignment.update({ where: { id }, data: { active: false, endDate } });
    /*
     * The login belongs to the RETAILER, not to this assignment.
     *
     * A retailer can now be a BP under several RSOs at once, so ending one of
     * those assignments must not take the BP's login away while the others are
     * still live — that would lock a working BP out of their own screen
     * because an unrelated RSO stopped working with them.
     *
     * Cleared only when this was the last one standing.
     */
    const stillActive = await tx.bpAssignment.count({ where: { retailerId: a.retailerId, active: true } });
    if (stillActive === 0)
      await tx.user.updateMany({ where: { role: "BP", bpRetailerId: a.retailerId }, data: { bpRetailerId: null } });
  });
  return NextResponse.json({ ok: true });
}

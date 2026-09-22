import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getCurrentUser } from "../../../../lib/auth";
import { audit } from "../../../../lib/audit";
import { RATE_LIMITS, consumeRateLimit, rateLimitResponse } from "../../../../lib/rate-limit";

/**
 * Which of an RSO's outlets earn the Sim Support SLAB.
 *
 * The whole request is one RSO's list, not one toggle: replacing the set in a
 * single write means a save can never leave a half-applied list behind, and the
 * screen and the database agree after every request.
 *
 * ## No cap
 *
 * v189 enforced two per RSO. The owner's ruling is that the number must not
 * live in the code at all — *"multiple code select korar option raikho... Bar
 * bar update korte hobe na"* — so any number may be picked and the screens
 * simply say how many. Two is what the office picks today; a rule change should
 * not need a release.
 *
 * This is the SLAB only. The SSO offer counts every outlet under the RSO,
 * picked or not — see the note at the top of lib/sim-support-data.ts.
 */
const CAN_WRITE = ["ADMIN", "IT", "MANAGER"];

/**
 * What the office usually picks. A HINT for the screens, never a limit — the
 * API refuses nothing on this number.
 */
export const SUPPORT_CODES_USUAL = 2;

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || !CAN_WRITE.includes(me.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await consumeRateLimit(RATE_LIMITS.mutation, me.id);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl.retryAfterSeconds);
    return NextResponse.json(r.body, r.init);
  }
  const b = (await req.json()) as { employeeId?: unknown; retailerIds?: unknown };
  const employeeId = String(b.employeeId || "");
  const retailerIds = Array.isArray(b.retailerIds) ? [...new Set(b.retailerIds.map((x) => String(x)))] : null;
  if (!employeeId || !retailerIds)
    return NextResponse.json({ error: "Which RSO, and which outlets?" }, { status: 400 });
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, name: true } });
  if (!employee) return NextResponse.json({ error: "That RSO no longer exists." }, { status: 404 });

  /*
   * Every id must be an outlet this RSO actually owns. Without the check a
   * request could mark somebody else's outlet, and the day's support would pay
   * one RSO for another's SIMs — a number that looks exactly like a correct one.
   */
  if (retailerIds.length) {
    const owned = await prisma.retailer.count({ where: { id: { in: retailerIds }, employeeId } });
    if (owned !== retailerIds.length)
      return NextResponse.json({ error: "One of those outlets is not under this RSO." }, { status: 400 });
  }

  await prisma.$transaction([
    // Clear first: an outlet dropped from the list has to stop earning.
    prisma.retailer.updateMany({ where: { employeeId, supportEligible: true }, data: { supportEligible: false } }),
    ...(retailerIds.length
      ? [prisma.retailer.updateMany({ where: { id: { in: retailerIds } }, data: { supportEligible: true } })]
      : []),
  ]);

  await audit(me, "SET_SUPPORT_CODES", "support", {
    targetType: "Employee",
    targetId: employeeId,
    targetName: employee.name,
    metadata: { codes: retailerIds.length },
  });
  return NextResponse.json({ ok: true, codes: retailerIds.length });
}

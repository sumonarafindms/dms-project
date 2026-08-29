import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getCurrentUser, hashCredential } from "../../../../lib/auth";
import { audit } from "../../../../lib/audit";
import { RATE_LIMITS, consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";
const roles = ["IT", "MANAGER", "SUPERVISOR", "ACCOUNTS", "RSO", "BP"] as const;
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || !["ADMIN", "IT"].includes(me.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json();
  const role = String(b.role || "") as (typeof roles)[number];
  if (!roles.includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  const displayName = String(b.displayName || "").trim(),
    mobileNumber = String(b.mobileNumber || "").trim(),
    pin = String(b.pin || "").trim();
  if (!displayName || !mobileNumber || pin.length < 4)
    return NextResponse.json({ error: "Name, mobile number and at least 4-digit PIN are required." }, { status: 400 });
  const employeeId = b.employeeId ? String(b.employeeId) : null,
    supervisorId = b.supervisorId ? String(b.supervisorId) : null,
    bpRetailerId = b.bpRetailerId ? String(b.bpRetailerId) : null;
  if (role === "RSO" && !employeeId)
    return NextResponse.json({ error: "Select the RSO employee for this login." }, { status: 400 });
  if (role === "SUPERVISOR" && !supervisorId)
    return NextResponse.json({ error: "Select the supervisor for this login." }, { status: 400 });
  if (role === "BP" && !bpRetailerId)
    return NextResponse.json({ error: "Select an active BP retailer for this login." }, { status: 400 });
  if (role === "BP") {
    const activeBpRetailerId = bpRetailerId as string;
    const assignment = await prisma.bpAssignment.findFirst({ where: { retailerId: activeBpRetailerId, active: true } });
    if (!assignment)
      return NextResponse.json({ error: "That retailer is not currently assigned as a BP." }, { status: 400 });
  }
  try {
    const user = await prisma.user.create({
      data: {
        displayName,
        mobileNumber,
        credentialHash: await hashCredential(pin),
        role,
        employeeId: role === "RSO" ? employeeId : null,
        supervisorId: role === "SUPERVISOR" ? supervisorId : null,
        bpRetailerId: role === "BP" ? bpRetailerId : null,
      },
    });
    await audit(me, "CREATE_USER", "accounts", {
      targetType: "User",
      targetId: user.id,
      targetName: user.displayName,
      detail: `Created ${role} login`,
    });
    return NextResponse.json({ ok: true, id: user.id });
  } catch (e: any) {
    return NextResponse.json(
      {
        error:
          e?.code === "P2002" ? "This mobile number or role mapping is already assigned." : "Could not create user.",
      },
      { status: 400 },
    );
  }
}
export async function PATCH(req: Request) {
  const me = await getCurrentUser();
  if (!me || !["ADMIN", "IT"].includes(me.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // This route can reset any account's PIN, so it is limited per acting admin
  // whether or not this particular call carries one.
  const rl = await consumeRateLimit(RATE_LIMITS.credential, me.id);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl.retryAfterSeconds);
    return NextResponse.json(r.body, r.init);
  }
  const b = await req.json();
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ error: "User is required" }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  const data: any = {};
  if (typeof b.active === "boolean") data.active = b.active;

  const editingDetails =
    typeof b.displayName === "string" || typeof b.mobileNumber === "string" || typeof b.role === "string";
  if (editingDetails) {
    const role = String(b.role || existing.role) as (typeof roles)[number];
    if (!roles.includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    const displayName = String(b.displayName ?? existing.displayName).trim();
    const mobileNumber = String(b.mobileNumber ?? existing.mobileNumber ?? "").trim();
    if (!displayName || !mobileNumber)
      return NextResponse.json({ error: "Display name and mobile number are required." }, { status: 400 });

    const employeeId = b.employeeId ? String(b.employeeId) : null;
    const supervisorId = b.supervisorId ? String(b.supervisorId) : null;
    const bpRetailerId = b.bpRetailerId ? String(b.bpRetailerId) : null;
    if (role === "RSO" && !employeeId)
      return NextResponse.json({ error: "Select the RSO employee for this login." }, { status: 400 });
    if (role === "SUPERVISOR" && !supervisorId)
      return NextResponse.json({ error: "Select the supervisor for this login." }, { status: 400 });
    if (role === "BP" && !bpRetailerId)
      return NextResponse.json({ error: "Select an active BP retailer for this login." }, { status: 400 });
    if (role === "BP") {
      const assignment = await prisma.bpAssignment.findFirst({
        where: { retailerId: bpRetailerId as string, active: true },
      });
      if (!assignment)
        return NextResponse.json({ error: "That retailer is not currently assigned as a BP." }, { status: 400 });
    }

    data.displayName = displayName;
    data.mobileNumber = mobileNumber;
    data.role = role;
    data.employeeId = role === "RSO" ? employeeId : null;
    data.supervisorId = role === "SUPERVISOR" ? supervisorId : null;
    data.bpRetailerId = role === "BP" ? bpRetailerId : null;
  }

  const pin = typeof b.pin === "string" ? b.pin.trim() : "";
  if (pin && pin.length < 4)
    return NextResponse.json({ error: "PIN must contain at least 4 characters." }, { status: 400 });
  if (pin) data.credentialHash = await hashCredential(pin);

  try {
    const target = await prisma.user.update({ where: { id }, data });
    const securityChanged = Boolean(pin) || editingDetails || b.active === false;
    if (securityChanged) await prisma.session.deleteMany({ where: { userId: id } });
    const action = pin
      ? "RESET_PIN"
      : editingDetails
        ? "UPDATE_USER"
        : typeof b.active === "boolean"
          ? b.active
            ? "ACTIVATE_USER"
            : "DEACTIVATE_USER"
          : "UPDATE_USER";
    await audit(me, action, "accounts", {
      targetType: "User",
      targetId: target.id,
      targetName: target.displayName,
      detail: editingDetails ? `Updated ${target.role} login details` : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      {
        error:
          e?.code === "P2002"
            ? "This mobile number or role mapping is already assigned to another account."
            : "Could not update user.",
      },
      { status: 400 },
    );
  }
}

import { NextResponse } from "next/server";
import { bpDisplayName, bpNameToStore } from "@/lib/bp-name";
import { prisma } from "../../../../../lib/prisma";
import { getCurrentUser, hashCredential } from "../../../../../lib/auth";
import { recordAssignmentChanges } from "../../../../../lib/assignment-history";
import { phoneKey } from "../../../../../lib/phone";
import { dhakaTodayYmd } from "../../../../../lib/business-time";
import { RATE_LIMITS, consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { PIN_REQUIREMENT, validatePin } from "@/lib/credential-policy";

const clean = (v: unknown) => String(v ?? "").trim();
const nullable = (v: unknown) => {
  const x = clean(v);
  return x || null;
};
function day(v: unknown) {
  const s = clean(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
async function admin() {
  const u = await getCurrentUser();
  return u && ["ADMIN", "IT"].includes(u.role) ? u : null;
}

export async function POST(req: Request, { params }: { params: Promise<{ role: string }> }) {
  const actor = await admin();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Creating an employee creates a login with a PIN, so it shares the
  // credential budget with PATCH. PATCH had this and POST did not — the
  // half of the pair that mints new credentials was the unlimited one.
  const rl = await consumeRateLimit(RATE_LIMITS.credential, actor.id);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl.retryAfterSeconds);
    return NextResponse.json(r.body, r.init);
  }
  const { role } = await params,
    b = await req.json(),
    r = role.toLowerCase();
  try {
    if (r === "managers") {
      const name = clean(b.name),
        mobile = clean(b.mobile),
        pin = clean(b.pin);
      if (!name || !mobile) return NextResponse.json({ error: "Name and mobile are required." }, { status: 400 });
      const pinError = validatePin(pin);
      if (pinError) return NextResponse.json({ error: pinError }, { status: 400 });
      const user = await prisma.user.create({
        data: {
          displayName: name,
          mobileNumber: mobile,
          credentialHash: await hashCredential(pin),
          role: "MANAGER",
          active: b.active !== false,
        },
      });
      return NextResponse.json({ ok: true, id: user.id });
    }
    if (r === "supervisors") {
      const name = clean(b.name),
        mobile = clean(b.mobile),
        pin = clean(b.pin);
      if (!name) return NextResponse.json({ error: "Supervisor name is required." }, { status: 400 });
      if ((mobile && !pin) || validatePin(pin, { allowEmpty: true }))
        return NextResponse.json(
          { error: `Provide a mobile number and a PIN together. ${PIN_REQUIREMENT}` },
          { status: 400 },
        );
      const result = await prisma.$transaction(async (tx) => {
        const supervisor = await tx.supervisor.create({ data: { name, active: b.active !== false } });
        if (mobile)
          await tx.user.create({
            data: {
              displayName: name,
              mobileNumber: mobile,
              credentialHash: await hashCredential(pin),
              role: "SUPERVISOR",
              supervisorId: supervisor.id,
              active: b.active !== false,
            },
          });
        return supervisor;
      });
      return NextResponse.json({ ok: true, id: result.id });
    }
    if (r === "rsos") {
      const name = clean(b.name),
        rsoMsisdn = clean(b.rsoMsisdn),
        employeeCode = nullable(b.employeeCode),
        supervisorId = nullable(b.supervisorId),
        mobile = clean(b.mobile),
        pin = clean(b.pin);
      if (!name || !rsoMsisdn)
        return NextResponse.json({ error: "RSO name and RSO MSISDN are required." }, { status: 400 });
      const existingPhones = await prisma.employee.findMany({ select: { id: true, rsoMsisdn: true } });
      if (existingPhones.some((x) => phoneKey(x.rsoMsisdn) === phoneKey(rsoMsisdn)))
        return NextResponse.json({ error: "This RSO MSISDN is already assigned." }, { status: 400 });
      if ((mobile && !pin) || validatePin(pin, { allowEmpty: true }))
        return NextResponse.json(
          { error: `Provide a mobile number and a PIN together. ${PIN_REQUIREMENT}` },
          { status: 400 },
        );
      const result = await prisma.$transaction(async (tx) => {
        const employee = await tx.employee.create({
          data: { name, rsoMsisdn, employeeCode, supervisorId, active: b.active !== false },
        });
        if (mobile)
          await tx.user.create({
            data: {
              displayName: name,
              mobileNumber: mobile,
              credentialHash: await hashCredential(pin),
              role: "RSO",
              employeeId: employee.id,
              active: b.active !== false,
            },
          });
        return employee;
      });
      return NextResponse.json({ ok: true, id: result.id });
    }
    if (r === "bps") {
      const employeeId = clean(b.employeeId),
        retailerId = clean(b.retailerId),
        startDate = day(b.startDate),
        gaTarget = Math.max(0, Math.trunc(Number(b.gaTarget) || 0)),
        name = clean(b.name),
        mobile = clean(b.mobile),
        pin = clean(b.pin);
      if (!employeeId || !retailerId || !startDate)
        return NextResponse.json({ error: "RSO, retailer code and effective date are required." }, { status: 400 });
      const today = new Date(`${dhakaTodayYmd()}T00:00:00.000Z`);
      if (startDate > today)
        return NextResponse.json(
          { error: "Future BP assignment dates are not supported yet. Use today or an earlier valid date." },
          { status: 400 },
        );
      if ((mobile && !pin) || validatePin(pin, { allowEmpty: true }))
        return NextResponse.json(
          { error: `Provide a mobile number and a PIN together. ${PIN_REQUIREMENT}` },
          { status: 400 },
        );
      const retailer = await prisma.retailer.findUnique({
        where: { id: retailerId },
        select: { id: true, retailerCode: true, retailerName: true, employeeId: true, active: true },
      });
      if (!retailer?.active) return NextResponse.json({ error: "Selected retailer must be active." }, { status: 400 });
      /*
       * The SECOND door onto BP creation, and it must stay level with the
       * first (/api/admin/bp-assignments). Every time these two have differed,
       * the app's behaviour has depended on which screen you happened to use,
       * which is worse than a rule nobody implemented.
       *
       * BP and RSO are many-to-many: several BPs under one RSO (v139), and now
       * several RSOs over one BP. Two checks were dropped to allow the second
       * direction — that the retailer belongs to the selected RSO, and that no
       * other RSO already holds it. The first made a second RSO impossible by
       * construction, since only one RSO owns a retailer in the master list.
       *
       * The surviving rule is the same retailer under the same RSO, which
       * would target and count one outlet twice for one person.
       */
      const result = await prisma.$transaction(async (tx) => {
        const other = await tx.bpAssignment.findFirst({ where: { retailerId, employeeId, active: true } });
        if (other) throw new Error("This retailer is already an active BP under this RSO.");
        const assignment = await tx.bpAssignment.create({
          data: { employeeId, retailerId, startDate, gaTarget, active: true },
        });
        /*
         * The BP display name goes on the RETAILER, not only on the login.
         *
         * It used to be written solely to `User.displayName`, which exists
         * only when a mobile number and PIN are supplied — so a BP without a
         * phone had the name typed into this form dropped in silence. It also
         * meant the name could not be read by any screen that was not looking
         * at the login, which is why every list went on showing the master
         * file's name. See lib/bp-name.ts.
         */
        if (name) await tx.retailer.update({ where: { id: retailerId }, data: { bpName: name } });
        if (mobile)
          await tx.user.create({
            data: {
              // The login's own label is kept in step with the BP's name, so
              // the BP's home greeting and every list agree.
              displayName: bpDisplayName({ ...retailer, bpName: name }),
              mobileNumber: mobile,
              credentialHash: await hashCredential(pin),
              role: "BP",
              bpRetailerId: retailerId,
              active: b.active !== false,
            },
          });
        // No login transfer: nothing was ended, so there is no login to move.
        return assignment;
      });
      return NextResponse.json({ ok: true, id: result.id });
    }
    return NextResponse.json({ error: "Unsupported employee role" }, { status: 404 });
  } catch (e: any) {
    return NextResponse.json(
      {
        error:
          e?.code === "P2002"
            ? "A unique code, mobile number, name, or mapping is already in use."
            : e?.message || "Could not create employee.",
      },
      { status: 400 },
    );
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ role: string }> }) {
  const actor = await admin();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Employee edits can carry a PIN reset, so they share the credential budget.
  const rl = await consumeRateLimit(RATE_LIMITS.credential, actor.id);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl.retryAfterSeconds);
    return NextResponse.json(r.body, r.init);
  }
  const { role } = await params,
    b = await req.json(),
    r = role.toLowerCase(),
    id = clean(b.id);
  if (!id) return NextResponse.json({ error: "Record id is required." }, { status: 400 });
  try {
    if (r === "managers") {
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user || user.role !== "MANAGER") return NextResponse.json({ error: "Manager not found." }, { status: 404 });
      const data: any = { displayName: clean(b.name) || user.displayName, active: b.active !== false };
      if (clean(b.mobile)) data.mobileNumber = clean(b.mobile);
      if (clean(b.pin)) {
        if (validatePin(clean(b.pin))) return NextResponse.json({ error: PIN_REQUIREMENT }, { status: 400 });
        data.credentialHash = await hashCredential(clean(b.pin));
      }
      await prisma.user.update({ where: { id }, data });
      if (clean(b.pin) || b.active === false) await prisma.session.deleteMany({ where: { userId: id } });
      return NextResponse.json({ ok: true });
    }
    if (r === "supervisors") {
      const supervisor = await prisma.supervisor.findUnique({ where: { id }, include: { user: true } });
      if (!supervisor) return NextResponse.json({ error: "Supervisor not found." }, { status: 404 });
      const name = clean(b.name) || supervisor.name,
        active = b.active !== false,
        mobile = clean(b.mobile),
        pin = clean(b.pin);
      if (!active) {
        const activeRsos = await prisma.employee.count({ where: { supervisorId: id, active: true } });
        if (activeRsos)
          return NextResponse.json(
            { error: `Reassign or deactivate ${activeRsos} active RSO(s) before deactivating this Supervisor.` },
            { status: 400 },
          );
      }
      await prisma.$transaction(async (tx) => {
        await tx.supervisor.update({ where: { id }, data: { name, active } });
        if (supervisor.user) {
          const udata: any = { displayName: name, active };
          if (mobile) udata.mobileNumber = mobile;
          if (pin) {
            if (validatePin(pin)) throw new Error(validatePin(pin)!);
            udata.credentialHash = await hashCredential(pin);
          }
          await tx.user.update({ where: { id: supervisor.user.id }, data: udata });
          if (pin || !active) await tx.session.deleteMany({ where: { userId: supervisor.user.id } });
        } else if (mobile) {
          if (validatePin(pin)) throw new Error(validatePin(pin)!);
          await tx.user.create({
            data: {
              displayName: name,
              mobileNumber: mobile,
              credentialHash: await hashCredential(pin),
              role: "SUPERVISOR",
              supervisorId: id,
              active,
            },
          });
        }
      });
      return NextResponse.json({ ok: true });
    }
    if (r === "rsos") {
      const employee = await prisma.employee.findUnique({ where: { id }, include: { user: true } });
      if (!employee) return NextResponse.json({ error: "RSO not found." }, { status: 404 });
      const name = clean(b.name) || employee.name,
        rsoMsisdn = clean(b.rsoMsisdn) || employee.rsoMsisdn,
        employeeCode = nullable(b.employeeCode),
        supervisorId = nullable(b.supervisorId),
        active = b.active !== false,
        mobile = clean(b.mobile),
        pin = clean(b.pin);
      const phoneConflicts = await prisma.employee.findMany({
        where: { id: { not: id } },
        select: { rsoMsisdn: true },
      });
      if (phoneConflicts.some((x) => phoneKey(x.rsoMsisdn) === phoneKey(rsoMsisdn)))
        return NextResponse.json(
          { error: "This RSO MSISDN is already assigned to another employee." },
          { status: 400 },
        );
      if (!active) {
        const [activeRetailers, activeBps] = await Promise.all([
          prisma.retailer.count({ where: { employeeId: id, active: true } }),
          prisma.bpAssignment.count({ where: { employeeId: id, active: true } }),
        ]);
        if (activeRetailers || activeBps)
          return NextResponse.json(
            {
              error: `Reassign ${activeRetailers} active retailer(s) and ${activeBps} active BP assignment(s) before deactivating this RSO.`,
            },
            { status: 400 },
          );
      }
      // Captured before the transaction: `employee.supervisorId` is the only
      // record of who owned this RSO, and the update overwrites it.
      const previousSupervisorId = employee.supervisorId;
      await prisma.$transaction(async (tx) => {
        await tx.employee.update({ where: { id }, data: { name, rsoMsisdn, employeeCode, supervisorId, active } });
        if (employee.user) {
          const udata: any = { displayName: name, active };
          if (mobile) udata.mobileNumber = mobile;
          if (pin) {
            if (validatePin(pin)) throw new Error(validatePin(pin)!);
            udata.credentialHash = await hashCredential(pin);
          }
          await tx.user.update({ where: { id: employee.user.id }, data: udata });
          if (pin || !active) await tx.session.deleteMany({ where: { userId: employee.user.id } });
        } else if (mobile) {
          if (validatePin(pin)) throw new Error(validatePin(pin)!);
          await tx.user.create({
            data: {
              displayName: name,
              mobileNumber: mobile,
              credentialHash: await hashCredential(pin),
              role: "RSO",
              employeeId: id,
              active,
            },
          });
        }
      });
      if (previousSupervisorId !== supervisorId) {
        const names = new Map(
          (
            await prisma.supervisor.findMany({
              where: { id: { in: [previousSupervisorId, supervisorId].filter(Boolean) as string[] } },
              select: { id: true, name: true },
            })
          ).map((x) => [x.id, x.name]),
        );
        await recordAssignmentChanges(
          actor,
          [
            {
              kind: "RSO_SUPERVISOR",
              entityId: id,
              entityName: `${employeeCode || employee.employeeCode || rsoMsisdn} — ${name}`,
              fromId: previousSupervisorId,
              fromName: previousSupervisorId ? (names.get(previousSupervisorId) ?? null) : null,
              toId: supervisorId,
              toName: supervisorId ? (names.get(supervisorId) ?? null) : null,
            },
          ],
          "RSO edit",
        );
      }
      return NextResponse.json({ ok: true });
    }
    if (r === "bps") {
      const a = await prisma.bpAssignment.findUnique({
        where: { id },
        include: { retailer: { include: { bpUser: true } } },
      });
      if (!a) return NextResponse.json({ error: "BP assignment not found." }, { status: 404 });
      const gaTarget = Math.max(0, Math.trunc(Number(b.gaTarget) || 0)),
        active = b.active !== false,
        mobile = clean(b.mobile),
        pin = clean(b.pin),
        /*
         * Blank means blank.
         *
         * This used to fall back to `retailerName` when the field was empty,
         * which made the BP name impossible to CLEAR once set — an operator
         * who wanted the master file's name back had no way to ask for it.
         * `bpNameToStore` returns null instead, and the fallback then happens
         * at read time where it belongs (lib/bp-name.ts).
         */
        bpName = bpNameToStore(b.name),
        name = bpDisplayName({ ...a.retailer, bpName });
      await prisma.$transaction(async (tx) => {
        const endDate = !active && a.active ? new Date(`${dhakaTodayYmd()}T00:00:00.000Z`) : undefined;
        await tx.bpAssignment.update({ where: { id }, data: { gaTarget, active, ...(endDate ? { endDate } : {}) } });
        await tx.retailer.update({ where: { id: a.retailerId }, data: { bpName } });
        if (a.retailer.bpUser) {
          const udata: any = { displayName: name, active };
          if (mobile) udata.mobileNumber = mobile;
          if (pin) {
            if (validatePin(pin)) throw new Error(validatePin(pin)!);
            udata.credentialHash = await hashCredential(pin);
          }
          await tx.user.update({ where: { id: a.retailer.bpUser.id }, data: udata });
          if (pin || !active) await tx.session.deleteMany({ where: { userId: a.retailer.bpUser.id } });
        } else if (mobile && active) {
          if (validatePin(pin)) throw new Error(validatePin(pin)!);
          await tx.user.create({
            data: {
              displayName: name,
              mobileNumber: mobile,
              credentialHash: await hashCredential(pin),
              role: "BP",
              bpRetailerId: a.retailerId,
              active: true,
            },
          });
        }
      });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unsupported employee role" }, { status: 404 });
  } catch (e: any) {
    return NextResponse.json(
      {
        error:
          e?.code === "P2002"
            ? "A unique code, mobile number, name, or mapping is already in use."
            : e?.message || "Could not update employee.",
      },
      { status: 400 },
    );
  }
}

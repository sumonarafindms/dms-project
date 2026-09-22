import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getCurrentUser } from "../../../lib/auth";
import { audit } from "../../../lib/audit";
import { RATE_LIMITS, consumeRateLimit, rateLimitResponse } from "../../../lib/rate-limit";
import { CAMPAIGN_SCOPES, type CampaignScope } from "../../../lib/campaign";

/**
 * Campaign create, edit and archive.
 *
 * IT, Admin and Manager, which is the owner's ruling and not the usual
 * ADMIN/IT pair every other admin route carries: a campaign is a field
 * instrument and the manager is the person who runs the field.
 */
const CAN_WRITE = ["ADMIN", "IT", "MANAGER"];

function parseDay(value: unknown) {
  const s = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** A target typed as blank is "not set", which is not the same as zero. */
function parseTarget(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

type Body = {
  id?: unknown;
  name?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  scope?: unknown;
  totalTarget?: unknown;
  perEmployeeTarget?: unknown;
  note?: unknown;
  active?: unknown;
  /** Per-employee overrides, keyed on employee id. A blank value removes one. */
  targets?: unknown;
};

function validate(b: Body) {
  const name = String(b.name || "").trim();
  const startDate = parseDay(b.startDate);
  const endDate = parseDay(b.endDate);
  const scope = String(b.scope || "") as CampaignScope;
  if (!name) return { error: "A campaign needs a name." };
  if (!startDate || !endDate) return { error: "Start and end date are both required." };
  /*
   * A backwards window is refused rather than swapped. The report date bar
   * swaps them because a reader dragging two pickers means a range; a campaign
   * is a commitment somebody typed, and quietly changing its dates would move
   * a deadline nobody agreed to.
   */
  if (endDate < startDate) return { error: "The end date cannot be before the start date." };
  if (!CAMPAIGN_SCOPES.includes(scope)) return { error: "Choose whether this is a distribution total or per RSO." };
  const totalTarget = parseTarget(b.totalTarget);
  const perEmployeeTarget = parseTarget(b.perEmployeeTarget);
  if (scope === "DISTRIBUTION" && !(totalTarget && totalTarget > 0))
    return { error: "A distribution campaign needs a total number of SIMs." };
  if (scope === "PER_EMPLOYEE" && !(perEmployeeTarget && perEmployeeTarget > 0))
    return { error: "A per-RSO campaign needs a number for each RSO." };
  return {
    data: {
      name,
      startDate,
      endDate,
      scope,
      // Only the field this scope uses is stored; the other stays null so a
      // campaign switched from one scope to the other cannot keep a stale
      // number that no screen reads but an export might.
      totalTarget: scope === "DISTRIBUTION" ? totalTarget : null,
      perEmployeeTarget: scope === "PER_EMPLOYEE" ? perEmployeeTarget : null,
      note: String(b.note || "").trim() || null,
    },
  };
}

/** `{ employeeId: number | "" }` → rows to write and ids to delete. */
function parseOverrides(raw: unknown) {
  const set: { employeeId: string; target: number }[] = [];
  const clear: string[] = [];
  if (!raw || typeof raw !== "object") return { set, clear };
  for (const [employeeId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!employeeId) continue;
    if (value === null || value === undefined || String(value).trim() === "") {
      clear.push(employeeId);
      continue;
    }
    const n = Number(value);
    // Zero is kept. "This RSO is out of this campaign" is a decision.
    if (Number.isFinite(n) && n >= 0) set.push({ employeeId, target: Math.trunc(n) });
  }
  return { set, clear };
}

/**
 * The writer, or null.
 *
 * The RATE LIMIT is deliberately NOT in here. Each handler calls
 * `consumeRateLimit` itself, where it can be read at the point a request
 * enters — and `tests/api-authorization.smoke.test.ts` reads each handler's own
 * body, so a limiter one call deeper would leave that guard unable to see it.
 * A security control a test cannot find is one nobody notices losing.
 */
async function writer() {
  const me = await getCurrentUser();
  return me && CAN_WRITE.includes(me.role) ? me : null;
}

const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const tooMany = (retryAfterSeconds: number) => {
  const r = rateLimitResponse(retryAfterSeconds);
  return NextResponse.json(r.body, r.init);
};

export async function POST(req: Request) {
  const me = await writer();
  if (!me) return unauthorized();
  const rl = await consumeRateLimit(RATE_LIMITS.mutation, me.id);
  if (!rl.allowed) return tooMany(rl.retryAfterSeconds);
  const b = (await req.json()) as Body;
  const v = validate(b);
  if (v.error) return NextResponse.json({ error: v.error }, { status: 400 });
  const created = await prisma.campaign.create({ data: { ...v.data!, createdById: me.id } });
  await audit(me, "CREATE_CAMPAIGN", "campaigns", {
    targetType: "Campaign",
    targetId: created.id,
    targetName: created.name,
    metadata: { scope: created.scope, startDate: b.startDate, endDate: b.endDate },
  });
  return NextResponse.json({ ok: true, id: created.id });
}

export async function PATCH(req: Request) {
  const me = await writer();
  if (!me) return unauthorized();
  const rl = await consumeRateLimit(RATE_LIMITS.mutation, me.id);
  if (!rl.allowed) return tooMany(rl.retryAfterSeconds);
  const b = (await req.json()) as Body;
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ error: "Which campaign?" }, { status: 400 });
  const existing = await prisma.campaign.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!existing) return NextResponse.json({ error: "That campaign no longer exists." }, { status: 404 });

  // Archiving is its own action and carries no other field, so a request that
  // only turns a campaign off cannot fail validation on dates it did not send.
  if (typeof b.active === "boolean" && b.name === undefined) {
    await prisma.campaign.update({ where: { id }, data: { active: b.active } });
    await audit(me, b.active ? "RESTORE_CAMPAIGN" : "ARCHIVE_CAMPAIGN", "campaigns", {
      targetType: "Campaign",
      targetId: id,
      targetName: existing.name,
    });
    return NextResponse.json({ ok: true });
  }

  const v = validate(b);
  if (v.error) return NextResponse.json({ error: v.error }, { status: 400 });
  const { set, clear } = parseOverrides(b.targets);
  await prisma.$transaction(async (tx) => {
    await tx.campaign.update({
      where: { id },
      data: { ...v.data!, ...(typeof b.active === "boolean" ? { active: b.active } : {}) },
    });
    if (clear.length) await tx.campaignTarget.deleteMany({ where: { campaignId: id, employeeId: { in: clear } } });
    for (const row of set)
      await tx.campaignTarget.upsert({
        where: { campaignId_employeeId: { campaignId: id, employeeId: row.employeeId } },
        create: { campaignId: id, employeeId: row.employeeId, target: row.target },
        update: { target: row.target },
      });
    /*
     * A campaign switched to DISTRIBUTION keeps no per-person rows. They would
     * be invisible and then reappear if it were switched back — a number
     * nobody could see deciding a target later.
     */
    if (v.data!.scope === "DISTRIBUTION") await tx.campaignTarget.deleteMany({ where: { campaignId: id } });
  });
  await audit(me, "UPDATE_CAMPAIGN", "campaigns", {
    targetType: "Campaign",
    targetId: id,
    targetName: v.data!.name,
    metadata: { overridesSet: set.length, overridesCleared: clear.length },
  });
  return NextResponse.json({ ok: true });
}

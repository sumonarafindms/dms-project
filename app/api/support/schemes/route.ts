import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getCurrentUser } from "../../../../lib/auth";
import { audit } from "../../../../lib/audit";
import { RATE_LIMITS, consumeRateLimit, rateLimitResponse } from "../../../../lib/rate-limit";

/**
 * A day's Sim Support offer: create, replace, archive.
 *
 * IT, Admin and Manager — the same three who own campaigns, and for the same
 * reason. Accounts, who own every other money screen in this app, deliberately
 * do not: this is a field incentive, not a ledger.
 */
const CAN_WRITE = ["ADMIN", "IT", "MANAGER"];

function parseDay(value: unknown) {
  const s = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseMoney(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/**
 * The slabs, cleaned.
 *
 * Two thresholds at the same count is the one shape that cannot be rendered
 * honestly — `slabFor` would have to pick one and the reader could not tell
 * which — so it is refused rather than silently deduplicated.
 */
function parseSlabs(raw: unknown) {
  if (!Array.isArray(raw)) return { error: "Add at least one slab, or an SSO rate." };
  const slabs: { minSims: number; ratePerSim: number }[] = [];
  for (const row of raw) {
    const minSims = Number((row as { minSims?: unknown })?.minSims);
    const ratePerSim = parseMoney((row as { ratePerSim?: unknown })?.ratePerSim);
    // A blank pair is an empty row in the form, not an error.
    if (!Number.isFinite(minSims) && ratePerSim === null) continue;
    if (!Number.isFinite(minSims) || minSims < 1) return { error: "Every slab needs a SIM count of 1 or more." };
    if (ratePerSim === null || ratePerSim <= 0) return { error: "Every slab needs a rate above zero." };
    if (slabs.some((s) => s.minSims === Math.trunc(minSims)))
      return { error: `Two slabs both start at ${Math.trunc(minSims)} SIMs. Each slab needs its own count.` };
    slabs.push({ minSims: Math.trunc(minSims), ratePerSim });
  }
  return { slabs };
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

type Body = {
  id?: unknown;
  date?: unknown;
  name?: unknown;
  note?: unknown;
  ssoRatePerSim?: unknown;
  ssoMinSimsSameDay?: unknown;
  slabs?: unknown;
  active?: unknown;
};

export async function POST(req: Request) {
  const me = await writer();
  if (!me) return unauthorized();
  const rl = await consumeRateLimit(RATE_LIMITS.mutation, me.id);
  if (!rl.allowed) return tooMany(rl.retryAfterSeconds);
  const b = (await req.json()) as Body;
  const date = parseDay(b.date);
  if (!date) return NextResponse.json({ error: "Which day is this offer for?" }, { status: 400 });
  const parsed = parseSlabs(b.slabs);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const ssoRatePerSim = parseMoney(b.ssoRatePerSim);
  const slabs = parsed.slabs!;
  if (!slabs.length && !(ssoRatePerSim && ssoRatePerSim > 0))
    return NextResponse.json(
      { error: "An offer with no slab and no SSO rate pays nothing. Add one or the other." },
      { status: 400 },
    );

  const minSameDay = Number(b.ssoMinSimsSameDay);
  const data = {
    date,
    name: String(b.name || "").trim() || null,
    note: String(b.note || "").trim() || null,
    ssoRatePerSim,
    ssoMinSimsSameDay: Number.isFinite(minSameDay) && minSameDay > 1 ? Math.trunc(minSameDay) : null,
  };

  /*
   * One offer per day, replaced in place.
   *
   * The unique key is the date, so a second POST for the same day is an edit,
   * not a duplicate — which is how the operator thinks about it ("today's
   * support is 10 taka, no wait, 20"). The slabs are deleted and rewritten
   * rather than merged: a slab removed from the form must disappear, and an
   * upsert per row would silently keep it.
   */
  const scheme = await prisma.$transaction(async (tx) => {
    const existing = await tx.supportScheme.findUnique({ where: { date }, select: { id: true } });
    const row = existing
      ? await tx.supportScheme.update({ where: { id: existing.id }, data: { ...data, active: true } })
      : await tx.supportScheme.create({ data: { ...data, createdById: me.id } });
    await tx.supportSlab.deleteMany({ where: { schemeId: row.id } });
    if (slabs.length) await tx.supportSlab.createMany({ data: slabs.map((s) => ({ ...s, schemeId: row.id })) });
    return row;
  });

  await audit(me, "SET_SUPPORT_SCHEME", "support", {
    targetType: "SupportScheme",
    targetId: scheme.id,
    targetName: scheme.name || String(b.date),
    metadata: { slabs: slabs.length, ssoRatePerSim, date: String(b.date) },
  });
  return NextResponse.json({ ok: true, id: scheme.id });
}

export async function PATCH(req: Request) {
  const me = await writer();
  if (!me) return unauthorized();
  const rl = await consumeRateLimit(RATE_LIMITS.mutation, me.id);
  if (!rl.allowed) return tooMany(rl.retryAfterSeconds);
  const b = (await req.json()) as Body;
  const id = String(b.id || "");
  if (!id || typeof b.active !== "boolean")
    return NextResponse.json({ error: "Which offer, and on or off?" }, { status: 400 });
  const existing = await prisma.supportScheme.findUnique({
    where: { id },
    select: { id: true, name: true, date: true },
  });
  if (!existing) return NextResponse.json({ error: "That offer no longer exists." }, { status: 404 });
  await prisma.supportScheme.update({ where: { id }, data: { active: b.active } });
  await audit(me, b.active ? "RESTORE_SUPPORT_SCHEME" : "ARCHIVE_SUPPORT_SCHEME", "support", {
    targetType: "SupportScheme",
    targetId: id,
    targetName: existing.name || existing.date.toISOString().slice(0, 10),
  });
  return NextResponse.json({ ok: true });
}

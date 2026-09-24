import { isYmd } from "@/lib/business-time";
import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getCurrentUser } from "../../../../lib/auth";
import { hasPermission } from "../../../../lib/permissions";
import { audit } from "../../../../lib/audit";
import { RATE_LIMITS, consumeRateLimit, rateLimitResponse } from "../../../../lib/rate-limit";
import { readJson } from "@/lib/request-body";

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
  if (!isYmd(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseMoney(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(value);
  // v200: inside Decimal(10,2); a larger rate was a database overflow and a 500.
  return Number.isFinite(n) && n >= 0 && n < 1_000_000 ? Math.round(n * 100) / 100 : null;
}

/**
 * The slabs, cleaned.
 *
 * Two thresholds at the same count is the one shape that cannot be rendered
 * honestly — `slabFor` would have to pick one and the reader could not tell
 * which — so it is refused rather than silently deduplicated.
 */
const TIERS = ["ALL", "GA_170", "GA_300"] as const;
type Tier = (typeof TIERS)[number];
const TIER_WORD: Record<Tier, string> = { ALL: "", GA_170: "170৳ SIM ", GA_300: "300৳ SIM " };

/*
 * v198: a slab names its ladder. A row with no tier is the original single
 * ladder (`ALL`), so a client that predates the split still saves what it
 * always saved. The two shapes are never mixed in one offer: a SIM paid on
 * the ALL ladder AND its own type's ladder would be paid twice.
 */
function parseSlabs(raw: unknown) {
  if (!Array.isArray(raw)) return { error: "Add at least one slab, or an SSO rate." };
  const slabs: { minSims: number; ratePerSim: number; tier: Tier }[] = [];
  for (const row of raw) {
    const minSims = Number((row as { minSims?: unknown })?.minSims);
    const ratePerSim = parseMoney((row as { ratePerSim?: unknown })?.ratePerSim);
    const rawTier = (row as { tier?: unknown })?.tier;
    const tier = (rawTier === undefined || rawTier === null || rawTier === "" ? "ALL" : String(rawTier)) as Tier;
    if (!TIERS.includes(tier)) return { error: "A slab is for every SIM, 170৳ SIMs or 300৳ SIMs." };
    // A blank pair is an empty row in the form, not an error.
    if (!Number.isFinite(minSims) && ratePerSim === null) continue;
    if (!Number.isFinite(minSims) || minSims < 1 || minSims > 100_000)
      return { error: "Every slab needs a GA count of 1 or more." };
    if (ratePerSim === null || ratePerSim <= 0) return { error: "Every slab needs a rate above zero." };
    if (slabs.some((s) => s.tier === tier && s.minSims === Math.trunc(minSims)))
      return {
        error: `Two ${TIER_WORD[tier]}slabs both start at ${Math.trunc(minSims)} GA. Each slab needs its own count.`,
      };
    slabs.push({ minSims: Math.trunc(minSims), ratePerSim, tier });
  }
  if (slabs.some((s) => s.tier === "ALL") && slabs.some((s) => s.tier !== "ALL"))
    return { error: "Use one ladder for every SIM, or separate 170 and 300 ladders — not both in one offer." };
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
async function writer(action: "add" | "edit" | "either") {
  const me = await getCurrentUser();
  if (!me || !CAN_WRITE.includes(me.role)) return null;
  /*
   * v200: the role AND the person's own permission. The pages check
   * requirePagePermission(..., "support", action); the API checked only the role,
   * so a manager whose add/edit was switched off in Permissions could still
   * post straight to this route.
   */
  if (action === "either")
    return (await hasPermission(me.id, me.role, "support", "add")) ||
      (await hasPermission(me.id, me.role, "support", "edit"))
      ? me
      : null;
  return (await hasPermission(me.id, me.role, "support", action)) ? me : null;
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
  slabBasis?: unknown;
  dailyTarget?: unknown;
  slabs?: unknown;
  active?: unknown;
};

export async function POST(req: Request) {
  // A POST creates a day's offer or replaces it; which permission it needs is
  // decided below, once the day is known (v200).
  const me = await writer("either");
  if (!me) return unauthorized();
  const rl = await consumeRateLimit(RATE_LIMITS.mutation, me.id);
  if (!rl.allowed) return tooMany(rl.retryAfterSeconds);
  const b = (await readJson(req)) as Body;
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
  /*
   * v203: every offer is stored as OWN — each SIM type climbs its own ladder.
   * The owner ruled the day's total never picks a step; see lib/sim-support.ts.
   */
  const basis = "OWN";
  const target = String(b.dailyTarget ?? "").trim() === "" ? null : Number(b.dailyTarget);
  if (target !== null && (!Number.isFinite(target) || target < 1 || target > 100_000))
    return NextResponse.json({ error: "The day's target is a GA count of 1 or more, or blank." }, { status: 400 });
  const data = {
    date,
    name: String(b.name || "").trim() || null,
    note: String(b.note || "").trim() || null,
    ssoRatePerSim,
    ssoMinSimsSameDay: Number.isFinite(minSameDay) && minSameDay > 1 ? Math.min(100_000, Math.trunc(minSameDay)) : null,
    slabBasis: basis as "TOTAL" | "OWN",
    dailyTarget: target === null ? null : Math.trunc(target),
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
  /*
   * v200: an edit stays on its own day. The edit form's date was editable and
   * this route upserts by DATE, so moving the 22 Sep offer to the 23rd left
   * the 22nd live and paying, and silently replaced whatever the 23rd had.
   */
  const editingId = typeof b.id === "string" && b.id ? b.id : null;
  if (editingId) {
    const own = await prisma.supportScheme.findUnique({ where: { id: editingId }, select: { date: true } });
    if (!own) return NextResponse.json({ error: "That offer no longer exists." }, { status: 404 });
    if (own.date.getTime() !== date.getTime())
      return NextResponse.json(
        { error: "An offer's day cannot be changed. Create a new offer for the other day instead." },
        { status: 400 },
      );
  }
  const dayTaken = await prisma.supportScheme.findUnique({ where: { date }, select: { id: true } });
  if (!(await hasPermission(me.id, me.role, "support", dayTaken ? "edit" : "add"))) return unauthorized();

  /*
   * v202: two first saves for the same day at the same moment both saw no
   * offer, both created one, and the second hit the one-offer-per-day rule as
   * a 500. The loser now gets a plain "saved a moment ago" and can re-open it.
   */
  let scheme;
  try {
    scheme = await prisma.$transaction(async (tx) => {
      const existing = await tx.supportScheme.findUnique({ where: { date }, select: { id: true } });
      const row = existing
        ? await tx.supportScheme.update({ where: { id: existing.id }, data: { ...data, active: true } })
        : await tx.supportScheme.create({ data: { ...data, createdById: me.id } });
      await tx.supportSlab.deleteMany({ where: { schemeId: row.id } });
      if (slabs.length) await tx.supportSlab.createMany({ data: slabs.map((s) => ({ ...s, schemeId: row.id })) });
      return row;
    });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002")
      return NextResponse.json(
        { error: "Someone saved an offer for this day a moment ago. Open it again to see theirs." },
        { status: 409 },
      );
    throw e;
  }

  await audit(me, "SET_SUPPORT_SCHEME", "support", {
    targetType: "SupportScheme",
    targetId: scheme.id,
    targetName: scheme.name || String(b.date),
    metadata: {
      slabs: slabs.length,
      split: slabs.some((s) => s.tier !== "ALL"),
      slabBasis: data.slabBasis,
      dailyTarget: data.dailyTarget,
      ssoRatePerSim,
      date: String(b.date),
    },
  });
  return NextResponse.json({ ok: true, id: scheme.id });
}

export async function PATCH(req: Request) {
  const me = await writer("edit");
  if (!me) return unauthorized();
  const rl = await consumeRateLimit(RATE_LIMITS.mutation, me.id);
  if (!rl.allowed) return tooMany(rl.retryAfterSeconds);
  const b = (await readJson(req)) as Body;
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

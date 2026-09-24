/**
 * v203 — Quick search. Read-only, scoped by lib/quick-search.ts to exactly the
 * people the signed-in role's own pages would show.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { quickSearch } from "@/lib/quick-search";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROLES = ["ADMIN", "IT", "ACCOUNTS", "MANAGER", "SUPERVISOR", "RSO", "BP"];

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me || !ROLES.includes(me.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const hits = await quickSearch(me, q);
  return NextResponse.json({ hits }, { headers: { "Cache-Control": "no-store" } });
}

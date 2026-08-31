import { NextRequest, NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { apiError } from "@/lib/http-errors";
import { parseComparisonKind } from "@/lib/comparison";
import { performanceComparison } from "@/lib/comparison-data";

/**
 * Company-wide period-over-period figures for /dashboard.
 *
 * ## Why this endpoint exists at all
 *
 * /rso, /supervisor and /manager are server components, so they call
 * `performanceComparison()` directly and need no route. /dashboard is a client
 * component — it has to be, because its reporting-month picker refetches
 * without a navigation — and a client component cannot reach Prisma. So the
 * same function is reached over HTTP instead. This route holds no logic of its
 * own beyond auth and parsing; every rule about anchors, windows and
 * zero-previous still lives in lib/comparison-data.ts and lib/comparison.ts,
 * which is what keeps the dashboard's numbers identical to the role pages'.
 *
 * ## Scope
 *
 * No employee filter: /dashboard is the ADMIN/IT view of the whole company, and
 * `performanceComparison()` treats an omitted `employeeIds` as company-wide.
 * That default is deliberate here and dangerous elsewhere — see the ownership
 * note at the top of lib/report-data.ts. If this route ever serves a scoped
 * role, the scope must be passed explicitly rather than inherited from the
 * session by accident.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (!(await apiUser(["ADMIN", "IT"]))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    // Unrecognised input falls back to "day" rather than erroring: the switch
    // can only ever send one of three values, so anything else is a stale
    // bookmark, and a working daily comparison beats a 400.
    const kind = parseComparisonKind(req.nextUrl.searchParams.get("kind"));
    const result = await performanceComparison(kind);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error(error);
    const e = apiError(error, "Failed to load the period comparison.");
    return NextResponse.json({ error: e.error }, { status: e.status });
  }
}

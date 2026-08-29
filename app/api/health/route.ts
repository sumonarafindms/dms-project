import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getCurrentUser } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness probe.
 *
 * Two audiences, two answers. An uptime monitor needs a status code and
 * nothing else; an operator debugging a slow morning needs the latency and the
 * driver's error text. This used to give everyone the second answer, which
 * told an anonymous caller whether the database was reachable and how loaded
 * it was — a free oracle for anyone probing the deployment.
 *
 * So: unauthenticated callers get 200 or 503 and a bare `ok`. Signed-in
 * ADMIN/IT users get the diagnostics.
 */
const NO_STORE = { "cache-control": "no-store" };

async function canSeeDiagnostics() {
  try {
    const user = await getCurrentUser();
    return user?.role === "ADMIN" || user?.role === "IT";
  } catch {
    // The session lookup uses the same database this route is testing. If it
    // is down, the caller is simply treated as anonymous rather than turning
    // a health check into a 500.
    return false;
  }
}

export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - started;
    if (!(await canSeeDiagnostics())) return NextResponse.json({ ok: true }, { headers: NO_STORE });
    return NextResponse.json(
      { ok: true, database: "connected", latencyMs, timestamp: new Date().toISOString() },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("healthcheck database failure", error);
    const latencyMs = Date.now() - started;
    // Always 503 here. The old code ran this through apiError, which returned
    // 500 for anything it did not recognise as a connectivity failure — a
    // health check that answers 500 reads as "the app is broken" rather than
    // "its database is", and monitors treat those differently.
    if (!(await canSeeDiagnostics())) return NextResponse.json({ ok: false }, { status: 503, headers: NO_STORE });
    return NextResponse.json(
      {
        ok: false,
        database: "unavailable",
        latencyMs,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 503, headers: NO_STORE },
    );
  }
}

/**
 * Spreadsheet export for the stock module.
 *
 * One route for six files, and each file carries the SCOPE of the page it
 * belongs to — resolved here, from the session, never taken from the URL:
 *
 *   dues, stock      everyone who may open /stock, scoped as /stock scopes them
 *   simcheck         Accounts, IT, Admin, Manager, Supervisor — team-scoped
 *   margin, expenses, daily   Accounts, IT and Admin only: the buying side
 *
 * A file the page would have refused is a file this route refuses. That is the
 * same rule /api/reports/export follows for the Reporting Center, and for the
 * same reason: a report must not become reachable through a URL that its page
 * would have turned away.
 *
 * Whole reports only. No `page`, no `q` — see lib/stock-export.ts.
 */

import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { RATE_LIMITS, consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { reportWorkbook } from "@/lib/report-workbook";
import { resolveRange } from "@/lib/report-range";
import { dhakaMonth, dhakaTodayYmd, isYm, isYmd } from "@/lib/business-time";
import { mayOpen, stockScope } from "@/lib/stock-data";
import { BOOKS_READ_ROLES, SIM_CHECK_ROLES, simCheckScope } from "@/lib/lifting-data";
import {
  dailyReportExport,
  expenseExport,
  holderLedgerExport,
  holderStatementExport,
  holderStockExport,
  marginExport,
  simCheckExport,
  type StockExport,
} from "@/lib/stock-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STOCK_ROLES = ["ACCOUNTS", "ADMIN", "BP", "IT", "MANAGER", "RSO", "SUPERVISOR"];

export async function GET(req: Request) {
  const actor = await apiUser(STOCK_ROLES);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await consumeRateLimit(RATE_LIMITS.download, actor.id);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl.retryAfterSeconds);
    return NextResponse.json(r.body, r.init);
  }

  const url = new URL(req.url);
  const p = (k: string) => url.searchParams.get(k) ?? undefined;
  const report = p("report") ?? "";
  const books = BOOKS_READ_ROLES.includes(actor.role);
  const deny = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let built: StockExport | null = null;

  if (report === "dues") {
    built = await holderLedgerExport(await stockScope(actor));
  } else if (report === "stock") {
    const type = String(p("type") || "").toUpperCase();
    const id = String(p("id") || "");
    if (type !== "RSO" && type !== "SUPERVISOR" && type !== "BP") return deny();
    const scope = await stockScope(actor);
    if (!mayOpen(scope, type, id)) return deny();
    built = await holderStockExport(scope, type, id);
  } else if (report === "statement") {
    // v203: one person's month — the same scope as their ledger.
    const type = String(p("type") || "").toUpperCase();
    const id = String(p("id") || "");
    if (type !== "RSO" && type !== "SUPERVISOR" && type !== "BP") return deny();
    const scope = await stockScope(actor);
    if (!mayOpen(scope, type, id)) return deny();
    const thisMonth = dhakaMonth();
    const month = isYm(p("month")) && p("month")! <= thisMonth ? p("month")! : thisMonth;
    const [y, m] = month.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    built = await holderStatementExport(type, id, `${month}-01`, month === thisMonth ? dhakaTodayYmd() : last);
  } else if (report === "simcheck") {
    if (!SIM_CHECK_ROLES.includes(actor.role)) return deny();
    built = await simCheckExport(await simCheckScope(actor), resolveRange(p("from"), p("to")));
  } else if (report === "margin") {
    if (!books) return deny();
    built = await marginExport(resolveRange(p("from"), p("to")));
  } else if (report === "expenses") {
    if (!books) return deny();
    built = await expenseExport(resolveRange(p("from"), p("to")));
  } else if (report === "daily") {
    if (!books) return deny();
    const date = isYmd(p("date")) ? p("date")! : dhakaTodayYmd();
    built = await dailyReportExport(date);
  } else {
    return NextResponse.json({ error: "Unknown report" }, { status: 404 });
  }

  if (!built) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Empty is a 204, not an empty workbook — a header row with nothing under
  // it is indistinguishable from a report that failed to run.
  if (!built.rows.length) return new NextResponse(null, { status: 204 });

  const bytes = await reportWorkbook(built.rows, built.sheet);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${built.filename}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

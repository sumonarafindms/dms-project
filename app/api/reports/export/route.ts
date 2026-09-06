/**
 * Spreadsheet export for every Reporting Center report.
 *
 * ## Why this route exists
 *
 * The Export Excel button used to build the workbook in the browser. That
 * meant the page had to carry every row of the report as a prop to a client
 * component, whether or not anyone pressed the button — and it did, in the RSC
 * flight payload, on every single page load. Measured before this change,
 * `/it/reports/performance/retailer` was 1,018,255 bytes with 260 retailers,
 * 69% of it that payload.
 *
 * Paging the table alone would not have fixed it: sixty rows on screen and
 * every row still attached to the button is the same download. Moving the
 * workbook here is what lets the page carry a page.
 *
 * It also takes `xlsx` (~400 KB) out of the browser bundle entirely, and
 * replaces a `blob:` download with an ordinary attachment response.
 *
 * The workbook itself is built by `lib/report-workbook.ts` — bold frozen
 * header, a width per column taken from its widest value, autofilter, and
 * numbers stored as numbers. See that file for why it does not use `xlsx`.
 *
 * ## The rule this route must never break
 *
 * **The export is the whole report, not the page being viewed.** Paging the
 * screen and paging the file would mean a user on page 1 exports sixty rows
 * and believes they have the report. `?page=` is deliberately not read here,
 * and `tests/report-export.smoke.test.ts` fails if it ever is.
 *
 * The rows come from `lib/report-builders.ts` — the same functions the pages
 * render from — so the file and the screen cannot disagree about ordering,
 * filtering or column values.
 */

import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { RATE_LIMITS, consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { buildExport } from "@/lib/report-builders";
import { reportWorkbook } from "@/lib/report-workbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Same gate as every Reporting Center page. A report is company-wide data;
  // it must not become reachable through a URL that the page it belongs to
  // would have refused.
  const actor = await apiUser(["ADMIN", "IT"]);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Each call aggregates a period and builds a workbook in memory. The limit
  // is generous enough that a person clicking Export will never see it, and
  // low enough that a script cannot use this as a way to run the reporting
  // aggregates in a loop.
  const rl = await consumeRateLimit(RATE_LIMITS.download, actor.id);
  if (!rl.allowed) {
    const r = rateLimitResponse(rl.retryAfterSeconds);
    return NextResponse.json(r.body, r.init);
  }

  const url = new URL(req.url);
  const p = (k: string) => url.searchParams.get(k) ?? undefined;
  const key = p("report") ?? "";

  const built = await buildExport(key, {
    from: p("from"),
    to: p("to"),
    group: p("group"),
    level: p("level"),
    view: p("view"),
    kind: p("kind"),
    fields: p("fields"),
  });
  if (!built) return NextResponse.json({ error: "Unknown report" }, { status: 404 });

  // An empty report is a 204, not an empty workbook. A spreadsheet with a
  // header row and nothing under it looks like a report that ran and found
  // nothing, which is indistinguishable from one that failed to run.
  if (!built.rows.length) return new NextResponse(null, { status: 204 });

  const bytes = await reportWorkbook(built.rows);

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${built.filename}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

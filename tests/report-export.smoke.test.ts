import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { REPORTS, reportExportHref } from "../lib/report-builders";
import { REPORT_PAGE_SIZE, pageOf, parseReportPage, reportPageHref, reportPageLabel } from "../lib/report-paging";

/**
 * The Reporting Center pages its tables and exports the whole report.
 *
 * ## Why these two facts have to be guarded together
 *
 * Before v152 the reports rendered every row and handed every row to the
 * export button as a prop. `/it/reports/performance/retailer` answered with
 * 1,018,255 bytes for 260 retailers — each row present three times over
 * (desktop table, mobile cards, RSC flight payload) plus the export array.
 *
 * The fix pages the screen and moves the workbook to `/api/reports/export`.
 * That creates a failure mode that did not exist before, and it is a quiet
 * one: **if the export URL ever carried the page number, a reader on page 1
 * would download sixty rows and have no way to tell from the file that the
 * other two thousand were missing.** A truncated spreadsheet does not look
 * truncated. It looks like the answer.
 *
 * So: paging is guarded because it is the point, and the export's completeness
 * is guarded because paging is what put it at risk.
 *
 * ## Why the assertions read source rather than run the app
 *
 * Rendering a report needs a database, which this suite does not have. What
 * can be checked without one is the wiring: that every page hands its table a
 * `paging` prop, that every `exportHref` comes from the helper that cannot
 * emit a page number, and that every report key a page names exists in the
 * registry the export route looks up.
 */

const ROOT = path.join(__dirname, "..");

/**
 * Source with comments removed.
 *
 * A guard that greps raw source reads the explanation of a bug as the bug.
 * The first run of the rank assertion below failed on the comment that
 * describes what `rows.findIndex(...)` used to do — the fix was already in
 * place. Comments explain; only code is evidence.
 */
const codeOf = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const REPORTS_DIR = path.join(ROOT, "app", "it", "reports");

/** Every page.tsx under the Reporting Center, plus the shared report bodies. */
function reportSources(): { file: string; src: string }[] {
  const out: { file: string; src: string }[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".tsx"))
        out.push({ file: path.relative(ROOT, full), src: fs.readFileSync(full, "utf8") });
    }
  };
  walk(REPORTS_DIR);
  return out;
}

/**
 * The files that actually render a report table.
 *
 * The Reporting Center index (`reports/page.tsx`) is a menu of cards, not a
 * report, and the two shared view components receive `paging` from their
 * callers. Everything else must page.
 */
const rendersATable = (f: { file: string; src: string }) =>
  /<ReportTable\b/.test(f.src) || /<GroupedReportView\b/.test(f.src) || /<RetailerReportView\b/.test(f.src);

describe("report paging", () => {
  it("uses the same page size as the retailer directory", () => {
    const retailerList = fs.readFileSync(path.join(ROOT, "lib", "retailer-list.ts"), "utf8");
    const m = retailerList.match(/export const PAGE_SIZE = (\d+)/);
    expect(m, "lib/retailer-list.ts no longer declares PAGE_SIZE").toBeTruthy();
    // Two lists of the same retailers from the same database should not
    // disagree about how many fit on a page.
    expect(REPORT_PAGE_SIZE).toBe(Number(m![1]));
  });

  it("every report that renders a table passes paging to it", () => {
    const offenders = reportSources()
      .filter(rendersATable)
      .filter((f) => !/paging=\{/.test(f.src))
      .map((f) => f.file);
    expect(offenders, `these report views render rows without paging them:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });

  it("clamps a page past the end instead of rendering nothing", () => {
    const rows = Array.from({ length: 130 }, (_, i) => i);
    // A blank table reads as "this report has no rows", which is a different
    // and much worse claim than "you asked for page 99 of 3".
    const far = pageOf(rows, 99);
    expect(far.page).toBe(3);
    expect(far.rows).toEqual([120, 121, 122, 123, 124, 125, 126, 127, 128, 129]);
    expect(far.total).toBe(130);
  });

  it("treats unparseable page numbers as page 1", () => {
    for (const bad of ["abc", "", "-4", "0", null, undefined, {}, "1e9999"]) {
      expect(parseReportPage(bad as unknown), `?page=${String(bad)}`).toBeGreaterThanOrEqual(1);
    }
    expect(parseReportPage("abc")).toBe(1);
    expect(parseReportPage("3")).toBe(3);
  });

  it("labels the page with the true total, not the rows on screen", () => {
    const label = reportPageLabel(
      pageOf(
        Array.from({ length: 2431 }, (_, i) => i),
        2,
      ),
      "retailer",
    );
    // The total is what makes paging honest — the reader can see that these
    // sixty are sixty of two thousand, and that Export gives all of them.
    expect(label).toBe("61–120 of 2,431 retailers");
    expect(reportPageLabel(pageOf([], 1), "retailer")).toBe("No retailers");
    expect(reportPageLabel(pageOf([1], 1), "retailer")).toBe("1–1 of 1 retailer");
  });

  it("keeps page 1 on the URL it had before paging existed", () => {
    const first = reportPageHref("/it/reports/lso", { from: "2026-08-01", to: "2026-08-31" }, 1);
    expect(first).not.toContain("page=");
    expect(reportPageHref("/it/reports/lso", { from: "2026-08-01", to: "2026-08-31" }, 4)).toContain("page=4");
  });

  it("carries the view and grouping through the pager", () => {
    // Losing either would page a different report than the one on screen.
    const href = reportPageHref("/it/reports/low-c2s", { from: "a", to: "b", view: "zero" }, 2);
    expect(href).toContain("view=zero");
    expect(href).toContain("page=2");
  });
});

describe("report export", () => {
  it("never puts a page number in an export URL", () => {
    // The single most important assertion in this file. Sixty rows on screen,
    // every row in the file.
    const href = reportExportHref("low-c2s", { from: "2026-08-01", to: "2026-08-31" }, { view: "zero", page: "3" });
    expect(href).not.toMatch(/[?&]page=/);
    expect(href).toContain("view=zero");
    expect(href).toContain("report=low-c2s");
  });

  it("does not let the export route read a page parameter", () => {
    const route = codeOf(fs.readFileSync(path.join(ROOT, "app", "api", "reports", "export", "route.ts"), "utf8"));
    // Belt and braces: even if a caller appended one, the route must ignore it.
    expect(route).not.toMatch(/searchParams\.get\(\s*["']page["']\s*\)/);
    expect(route).not.toMatch(/\bp\(\s*["']page["']\s*\)/);
  });

  it("every report key a page exports exists in the registry", () => {
    const used = new Set<string>();
    for (const { src } of reportSources()) {
      for (const m of src.matchAll(/reportExportHref\(\s*(?:"([^"]+)"|`([^`$]*)`|\{?\s*metric\s*\}?)/g)) {
        const key = m[1] ?? m[2];
        if (key) used.add(key);
      }
    }
    // c2c/c2s come through a `metric` variable in ValueReport, so they are
    // named here rather than matched out of the source.
    used.add("c2c");
    used.add("c2s");
    expect(used.size, "no export links found — did the helper get renamed?").toBeGreaterThan(8);
    const missing = [...used].filter((k) => !(k in REPORTS));
    expect(missing, `pages export report keys the registry does not have: ${missing.join(", ")}`).toEqual([]);
  });

  it("every registry entry is reachable from a page", () => {
    const src = reportSources()
      .map((f) => f.src)
      .join("\n");
    // A registry entry nothing links to is either a dead report or a missing
    // Export button; both are worth failing over.
    const unreferenced = Object.keys(REPORTS).filter(
      (k) => !src.includes(`reportExportHref("${k}"`) && !["c2c", "c2s"].includes(k),
    );
    expect(unreferenced, `registry reports with no Export button: ${unreferenced.join(", ")}`).toEqual([]);
  });

  it("the export route gates on the same roles as the pages", () => {
    const route = fs.readFileSync(path.join(ROOT, "app", "api", "reports", "export", "route.ts"), "utf8");
    // A report is company-wide data. It must not become reachable through a
    // URL that the page it belongs to would have refused.
    expect(route).toMatch(/apiUser\(\[\s*"ADMIN"\s*,\s*"IT"\s*\]\)/);
    for (const { file, src } of reportSources()) {
      if (!/export default async function/.test(src)) continue;
      expect(src, `${file} does not gate on ADMIN/IT`).toMatch(/requireUser\(\[\s*"ADMIN"\s*,\s*"IT"\s*\]\)/);
    }
  });

  it("builds the workbook on the server, not in the browser", () => {
    const shell = codeOf(fs.readFileSync(path.join(ROOT, "app", "components", "ReportShell.tsx"), "utf8"));
    expect(shell).toContain('"use client"');
    // ~400 KB of spreadsheet library, in a browser, to format numbers the
    // server already had.
    expect(shell).not.toMatch(/import\(\s*["']xlsx["']\s*\)/);
    expect(shell).not.toMatch(/from\s+["']xlsx["']/);
  });
});

describe("report rank", () => {
  it("does not recompute a row's position while rendering it", () => {
    const perf = codeOf(
      fs.readFileSync(path.join(ROOT, "app", "it", "reports", "performance", "[kind]", "page.tsx"), "utf8"),
    );
    /*
     * `render: (r) => ordered.indexOf(r) + 1` is a linear scan per row — and
     * ReportTable renders every row twice, once for the table and once for the
     * mobile card. That is 2n² reference comparisons to number rows the sort
     * had already put in order.
     */
    expect(perf).not.toMatch(/\.indexOf\(\s*r\s*\)/);
    expect(perf).not.toMatch(/\.findIndex\(/);

    const targets = codeOf(fs.readFileSync(path.join(ROOT, "app", "targets", "page.tsx"), "utf8"));
    // Same shape, and worse: it ran inside a client component on every
    // keystroke in every target cell.
    expect(targets).not.toMatch(/rows\.findIndex\(/);
  });
});

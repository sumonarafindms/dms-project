import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { rel as relativeTo } from "./paths";
import { foldDigits, reportExportHref, searchReport } from "../lib/report-builders";
import type { Built } from "../lib/report-builders";

/**
 * Every report has a search, and the export is not affected by it.
 *
 * ## Why these belong in one file
 *
 * Adding a search created a way for the app to lie without ever erroring: the
 * screen shows the eleven rows matching "Shaheen", the Export button hands over
 * two hundred and sixty, and nothing anywhere says why the two disagree.
 *
 * That disagreement is deliberate — the owner chose an export that always
 * gives the whole report, so what the button does never depends on something
 * typed a minute ago. A predictable rule is worth having. But a rule nobody is
 * told about is indistinguishable from a bug, so the same feature that adds the
 * search has to add the sentence explaining it, and both are guarded here.
 */

const ROOT = path.join(__dirname, "..");
const REPORTS_DIR = path.join(ROOT, "app", "it", "reports");

const codeOf = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function reportSources(): { file: string; src: string }[] {
  const out: { file: string; src: string }[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".tsx")) out.push({ file: relativeTo(ROOT)(full), src: fs.readFileSync(full, "utf8") });
    }
  };
  walk(REPORTS_DIR);
  return out;
}

/** Files that render a report table — the index is a menu of cards, not a report. */
const rendersATable = (f: { src: string }) =>
  /<ReportTable\b/.test(f.src) || /<GroupedReportView\b/.test(f.src) || /<RetailerReportView\b/.test(f.src);

/**
 * The two shared bodies, which render a table but are not a report.
 *
 * They take `search` as a prop and render the box; they never read the URL and
 * never call `searchReport`, because the page that owns the URL does both. The
 * assertions below about reading `?q=` are page-level rules, so these are
 * excluded from them — and only from them. They are still required to render
 * the box, which is the assertion that would catch the search disappearing.
 */
const SHARED_VIEWS = ["GroupedReportView.tsx", "RetailerReportView.tsx"];
const isPage = (f: { file: string }) => !SHARED_VIEWS.some((v) => f.file.endsWith(v));

/** Rows shaped like a report's, so `searchReport` can be run for real. */
const built = (): Built<{ id: string; name: string }> => ({
  rows: [
    { id: "1", name: "Retailer A" },
    { id: "2", name: "Retailer B" },
    { id: "3", name: "Retailer C" },
  ],
  exportRows: [
    { Retailer: "Retailer A", Supervisor: "Shuvo", RSO: "Pranto", "RSO Wallet": "01937614431", SSO: "Pending" },
    { Retailer: "Retailer B", Supervisor: "Shaheen", RSO: "Dipu", "RSO Wallet": "01915309504", SSO: "Complete" },
    { Retailer: "Retailer C", Supervisor: "Shaheen", RSO: "Fahim", "RSO Wallet": "01984224556", SSO: "Pending" },
  ],
});

describe("searchReport", () => {
  it("keeps the rows whose columns contain the query", () => {
    const out = searchReport(built(), "shaheen");
    expect(out.rows.map((r) => r.id)).toEqual(["2", "3"]);
    expect(out.matched).toBe(2);
    expect(out.unfiltered).toBe(3);
  });

  it("keeps the display rows and the export rows aligned", () => {
    /*
     * The two arrays are filtered by the same index list. If they ever drift,
     * the screen would show one retailer's name against another's numbers —
     * which is worse than an error, because it looks like data.
     */
    const out = searchReport(built(), "shaheen");
    expect(out.rows).toHaveLength(out.exportRows.length);
    expect(out.exportRows[0].Retailer).toBe("Retailer B");
    expect(out.exportRows[1].Retailer).toBe("Retailer C");
  });

  it("searches every column, not only the name", () => {
    // A wallet number and a status are things people search for.
    expect(searchReport(built(), "01915309504").matched).toBe(1);
    expect(searchReport(built(), "complete").matched).toBe(1);
    expect(searchReport(built(), "Fahim").matched).toBe(1);
  });

  it("ignores case and surrounding spaces", () => {
    expect(searchReport(built(), "  SHAHEEN  ").matched).toBe(2);
  });

  it("returns everything for an empty search", () => {
    for (const q of ["", "   ", undefined]) {
      const out = searchReport(built(), q);
      expect(out.matched).toBe(3);
      expect(out.matched).toBe(out.unfiltered);
    }
  });

  it("finds a wallet typed in Bengali digits", () => {
    /*
     * Wallets are stored as the carrier's spreadsheet wrote them — Latin
     * digits. An operator on a Bengali keyboard types ০১৯১৫৩০৯৫০৪, which shares
     * not one character with 01915309504. Without folding, the search returns
     * nothing and looks broken.
     */
    expect(searchReport(built(), "০১৯১৫৩০৯৫০৪").matched).toBe(1);
    expect(searchReport(built(), "০১৯১৫৩০৯৫০৪").exportRows[0].Retailer).toBe("Retailer B");
    // And the other way round, for data that arrives in Bengali digits.
    const bengaliData = {
      rows: [{ id: "1", name: "x" }],
      exportRows: [{ Retailer: "x", "RSO Wallet": "০১৭০০০০০০০১" }],
    };
    expect(searchReport(bengaliData, "01700000001").matched).toBe(1);
  });

  it("folds only digits, never letters", () => {
    // Bengali script must survive untouched, or every name search breaks.
    expect(foldDigits("রহিম স্টোর")).toBe("রহিম স্টোর");
    expect(foldDigits("০১৭")).toBe("017");
    expect(foldDigits("৫০০ টাকা")).toBe("500 টাকা");
    expect(foldDigits("01700000001")).toBe("01700000001");
  });

  it("cannot match across a column boundary", () => {
    // Values are joined with a space, so "Shuvo Pranto" must not match merely
    // because two adjacent columns hold those words.
    expect(searchReport(built(), "ShuvoPranto").matched).toBe(0);
  });

  it("passes the builder's own summary figures through untouched", () => {
    /*
     * The strip above a table describes the whole period. Searching for one
     * supervisor must not make "Total Retailers: 2,431" read as 40 — and the
     * first version of this helper erased those extras entirely by returning
     * `Built<T>` instead of the builder's own type.
     */
    const withExtras = { ...built(), sellers: 260, complete: 12, totalC2s: 99_000 };
    const out = searchReport(withExtras, "shaheen");
    expect(out.sellers).toBe(260);
    expect(out.complete).toBe(12);
    expect(out.totalC2s).toBe(99_000);
    expect(out.rows).toHaveLength(2);
  });
});

describe("every report offers a search", () => {
  it("renders a search box on each one", () => {
    const offenders = reportSources()
      .filter(rendersATable)
      .filter((f) => !/search=\{|<ReportSearch\b/.test(f.src))
      .map((f) => f.file);
    expect(offenders, `these reports have no search:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });

  it("reads the query from the URL, so a search is a link", () => {
    const offenders = reportSources()
      .filter(rendersATable)
      .filter(isPage)
      .filter((f) => !/q\?: string/.test(f.src))
      .map((f) => f.file);
    expect(offenders, `these reports do not accept ?q=:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });

  it("narrows through the shared helper rather than each page inventing one", () => {
    const offenders = reportSources()
      .filter(rendersATable)
      .filter(isPage)
      .filter((f) => !/searchReport\(/.test(codeOf(f.src)))
      .map((f) => f.file);
    expect(offenders, `these reports filter without searchReport:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });
});

describe("search never reaches the export", () => {
  it("puts no q in the export URL", () => {
    // The owner's rule: Export always gives the whole report.
    const href = reportExportHref("lso", { from: "2026-08-01", to: "2026-08-31" }, { q: "shaheen", page: "3" });
    expect(href).not.toMatch(/[?&]q=/);
    expect(href).not.toMatch(/[?&]page=/);
  });

  it("does not let the export route read one", () => {
    const route = codeOf(fs.readFileSync(path.join(ROOT, "app", "api", "reports", "export", "route.ts"), "utf8"));
    expect(route).not.toMatch(/\bp\(\s*["']q["']\s*\)/);
    expect(route).not.toMatch(/searchParams\.get\(\s*["']q["']\s*\)/);
  });

  it("says on screen that the download ignores the search", () => {
    /*
     * The assertion that matters most in this file.
     *
     * A screen showing 11 rows beside a button that downloads 260 is a
     * disagreement about numbers. Predictable is not the same as obvious, and
     * an unexplained disagreement is what makes people stop trusting a report.
     */
    const shell = fs.readFileSync(path.join(ROOT, "app", "components", "ReportShell.tsx"), "utf8");
    expect(shell).toMatch(/Export Excel still downloads the full report/i);
    // And only while a search is actually narrowing something, or it is noise.
    expect(codeOf(shell)).toMatch(/searching\s*&&/);
  });
});

describe("Daily Summary has three levels", () => {
  const daily = () => fs.readFileSync(path.join(REPORTS_DIR, "daily", "page.tsx"), "utf8");

  it("offers supervisor, RSO and BP", () => {
    const src = codeOf(daily());
    expect(src).toMatch(/DAILY_LEVELS/);
    const builders = fs.readFileSync(path.join(ROOT, "lib", "report-builders.ts"), "utf8");
    const block = builders.slice(builders.indexOf("export const DAILY_LEVELS"));
    for (const key of ["supervisor", "rso", "bp"]) expect(block.slice(0, 400)).toContain(`"${key}"`);
  });

  it("makes the supervisor name a link into that team's RSOs", () => {
    // The gesture that used to do nothing.
    const src = codeOf(daily());
    expect(src).toMatch(/level: "rso"[\s\S]{0,80}supervisor: r\.name|supervisor: r\.name[\s\S]{0,80}level: "rso"/);
  });

  it("drops the supervisor filter when the level is not RSO", () => {
    /*
     * A supervisor filter means nothing in the BP or supervisor views, and
     * silently applying it there would shorten a list with no visible cause.
     */
    expect(codeOf(daily())).toMatch(/level === "rso" \? sp\.supervisor : undefined/);
  });

  it("tells the reader the list is filtered, and how to clear it", () => {
    const src = daily();
    expect(src).toMatch(/Showing only/);
    expect(src).toMatch(/Show every RSO/);
  });

  it("shows no C2C or C2S for a BP", () => {
    /*
     * BP activations come through BpAssignment, which carries a GA target and
     * nothing else. Zero-filled money columns would read as "this BP sold
     * nothing" rather than "this system does not track that for a BP".
     */
    const builders = codeOf(fs.readFileSync(path.join(ROOT, "lib", "report-builders.ts"), "utf8"));
    expect(builders).toMatch(/hasValue: false/);
    expect(builders).toMatch(/r\.hasValue \? \{ C2C:/);
    expect(codeOf(daily())).toMatch(/const hasValue = level !== "bp"/);
  });
});

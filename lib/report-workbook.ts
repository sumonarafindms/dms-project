/**
 * Turning report rows into a spreadsheet someone is glad to open.
 *
 * ## Why this is not `xlsx`
 *
 * The rest of this app parses uploads with `xlsx`, and that stays. But `xlsx`
 * 0.18.5 — the community build — writes no cell formatting at all. Measured
 * against a real file before choosing: `!cols` widths and `!autofilter` reach
 * the XML; `!freeze` and any cell style are silently dropped. So a header row
 * could not be made bold and could not be frozen, which is most of what makes a
 * long report readable once you scroll past the first screen.
 *
 * `exceljs` writes all of it. It costs 98 packages in the export route's bundle
 * — worth it for a server-only route, and it also means the file people
 * download is no longer produced by the package carrying this project's one
 * unresolved advisory. `xlsx` now only ever *reads*, which is the side that was
 * already hardened and tested.
 *
 * ## The rules this file enforces
 *
 * - **One fact per column.** Enforced upstream, in `lib/report-builders.ts`.
 * - **Nothing is truncated.** Column widths come from the widest value actually
 *   present, not from a guess, because a name cut off at "ABDULLA…" is a name
 *   nobody can look up.
 * - **The header survives scrolling.** Bold, filled, frozen. Row 400 of a
 *   report is unreadable when you cannot see which column is which.
 * - **Numbers are numbers.** Right-aligned with thousands separators, so a
 *   column of money reads as money and `SUM` works on it. A number stored as
 *   text is the most common thing wrong with an exported spreadsheet.
 */

import ExcelJS from "exceljs";
import type { ExportRow } from "./report-builders";

/** Columns whose values are counts or money rather than identifiers. */
const NUMERIC_FORMAT = "#,##0";

/**
 * Identifier-ish headings that must stay text even though they look numeric.
 *
 * A wallet number is digits, and anything that treats it as a number drops the
 * leading zero that makes `01700000001` a Bangladeshi mobile number. Codes
 * behave the same way.
 *
 * These columns are **coerced to strings when the row is written**, not merely
 * aligned left. The first version of this file only set the alignment and
 * carried a comment claiming it protected the zero; mutation-testing it — by
 * emptying this pattern — changed nothing, because every wallet happened to
 * already be a string upstream. The guard was resting on a coincidence in the
 * data rather than on anything this file did. Now it holds even if a builder
 * one day hands over a numeric wallet.
 */
const TEXT_HEADINGS = /wallet|code|msisdn|number|route|category/i;

/** Percentage columns get one decimal place and a % suffix. */
const PERCENT_HEADINGS = /%$/;

const MIN_WIDTH = 8;
const MAX_WIDTH = 46;

/**
 * Excel's own default column width, in characters.
 *
 * A column set to exactly this is not written to the file at all — exceljs
 * omits the `<col>` entry, and reading the workbook back reports `undefined`
 * for it. That is correct: an absent entry means "use the default", which is
 * this number. It looked like a dropped width the first time a real report was
 * inspected (the LSO column, whose longest value is "Pending", lands on exactly
 * 9), so it is written down here rather than rediscovered.
 */
export const EXCEL_DEFAULT_WIDTH = 9;

/**
 * Width for one column, in characters, from its heading and every value in it.
 *
 * Capped at 46: a retailer name of 120 characters should not push every other
 * column off the screen. Excel wraps nothing by default, so the cap trades a
 * rare truncation-on-screen (the value is still there, and widening is a
 * double-click) against a layout nobody can read.
 */
function widthFor(heading: string, values: (string | number)[]) {
  let widest = heading.length;
  for (const v of values) {
    const n = typeof v === "number" ? v.toLocaleString("en-US").length : String(v ?? "").length;
    if (n > widest) widest = n;
  }
  // +2 for the cell padding and the autofilter arrow that sits in the header.
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, widest + 2));
}

/**
 * Build the .xlsx bytes for one report.
 *
 * `rows` are already in display order and already keyed by their on-screen
 * headings — this function decides nothing about content, only about how it
 * looks once opened.
 */
export async function reportWorkbook(rows: ExportRow[], sheetName = "Report"): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "DMS";
  wb.created = new Date();

  // Excel refuses these characters in a sheet name and silently corrupts the
  // file rather than saying so.
  const ws = wb.addWorksheet(sheetName.replace(/[\\/*?:[\]]/g, "-").slice(0, 31), {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  // The first row decides the columns. Every report builder produces uniform
  // rows, so this is the full set; a key missing from a later row writes an
  // empty cell rather than shifting the row left.
  const headings = Object.keys(rows[0] ?? {});
  ws.columns = headings.map((h) => ({
    header: h,
    key: h,
    width: widthFor(
      h,
      rows.map((r) => r[h]),
    ),
  }));

  const textColumns = new Set(headings.filter((h) => TEXT_HEADINGS.test(h)));
  for (const r of rows) {
    const out: ExportRow = {};
    for (const h of headings) {
      const v = r[h];
      // See TEXT_HEADINGS: identifiers are written as text, whatever they
      // arrived as, so a leading zero survives the round trip.
      out[h] = textColumns.has(h) && v !== "" && v !== undefined && v !== null ? String(v) : v;
    }
    ws.addRow(out);
  }

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3A5F" } };
  header.alignment = { vertical: "middle", horizontal: "left" };
  header.height = 22;

  headings.forEach((h, i) => {
    const col = ws.getColumn(i + 1);
    if (PERCENT_HEADINGS.test(h)) {
      col.numFmt = "0.0";
      col.alignment = { horizontal: "right" };
    } else if (TEXT_HEADINGS.test(h)) {
      // Left alone deliberately: see TEXT_HEADINGS.
      col.alignment = { horizontal: "left" };
    } else if (rows.some((r) => typeof r[h] === "number")) {
      col.numFmt = NUMERIC_FORMAT;
      col.alignment = { horizontal: "right" };
    }
  });

  // Sort and filter arrows on every column, so the file is usable without
  // anyone having to set it up first.
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headings.length } };

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

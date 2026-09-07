import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { looksLikeWorkbook } from "../lib/upload-safety";
import { parseC2Workbook, parseTabText, readMatrix } from "../lib/c2-import-core";
import { readMatrix as readObMatrix } from "../lib/ob-import";

/**
 * Every format the upload widgets offer actually parses.
 *
 * ## The bug
 *
 * All three upload widgets accept `.xls`, `.xlsx` and `.xlsm`, and the owner's
 * carrier reports arrive as `.xls`. **Every `.xls` C2C, C2S and Opening Balance
 * upload failed**, with an error naming the exact headings the file contains:
 *
 *     Required headings missing: RETAILER_CODE, RETAILER_ITOPUP_NO, …
 *     Best header candidate was row 1 and contained: 쿐놡>￾, က￾￿￿￿￿…
 *
 * Those importers accept a tab-separated text export as well as a workbook, and
 * chose between them by sniffing the decoded bytes for a tab and the word
 * `RETAILER_CODE`. A legacy `.xls` is an OLE2 file whose strings are UTF-16, so
 * decoded as text it has both — the sniffer claimed it, split the binary on
 * tabs, and the workbook parser never ran.
 *
 * `.xlsx` is a ZIP, which decodes to nothing text-like, so it worked. That is
 * why this looked like a bad file rather than a bug: the format that failed was
 * the one nobody tested, and the error blamed the file.
 *
 * ## Why the whole matrix is tested rather than the one broken case
 *
 * Fixing `.xls` for C2C would have left `.xls` for OB broken, since the same
 * sniffer is copied there. And a check that only covered the formats that
 * happened to work is exactly what let this ship. So: every importer, every
 * format its widget accepts.
 */

const C2_ROWS = [
  {
    RETAILER_CODE: "R000001",
    RETAILER_ITOPUP_NO: "01700000001",
    TRANSACTION_COUNT: 4,
    TOTAL_AMOUNT: 700,
    SRNUMBER: "01900000001",
    "01-Aug-2026": 300,
    "02-Aug-2026": 400,
  },
  {
    RETAILER_CODE: "R000002",
    RETAILER_ITOPUP_NO: "01700000002",
    TRANSACTION_COUNT: 1,
    TOTAL_AMOUNT: 250,
    SRNUMBER: "01900000001",
    "01-Aug-2026": 250,
    "02-Aug-2026": 0,
  },
];

/** The same rows written in whichever container a real upload might arrive as. */
function workbookBytes(rows: Record<string, string | number>[], bookType: "xls" | "xlsx"): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType }) as Buffer;
}

/** The carrier's tab-separated export, which the text path exists to read. */
function tabBytes(rows: Record<string, string | number>[]): Buffer {
  const headings = Object.keys(rows[0]);
  const lines = [headings.join("\t"), ...rows.map((r) => headings.map((h) => String(r[h] ?? "")).join("\t"))];
  return Buffer.from(lines.join("\r\n"), "utf8");
}

describe("looksLikeWorkbook", () => {
  it("recognises a legacy .xls", () => {
    const xls = workbookBytes(C2_ROWS, "xls");
    // OLE2 compound file — what Excel actually writes for .xls.
    expect([...xls.subarray(0, 4)]).toEqual([0xd0, 0xcf, 0x11, 0xe0]);
    expect(looksLikeWorkbook(xls)).toBe(true);
  });

  it("recognises an .xlsx", () => {
    const xlsx = workbookBytes(C2_ROWS, "xlsx");
    expect([...xlsx.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(looksLikeWorkbook(xlsx)).toBe(true);
  });

  it("does not claim a text export", () => {
    // The text path must still be reachable, or the fix trades one broken
    // format for another.
    expect(looksLikeWorkbook(tabBytes(C2_ROWS))).toBe(false);
  });

  it("does not call a two-byte file a workbook", () => {
    /*
     * The length check earns its place on exactly one input, and it took a
     * mutation to find which.
     *
     * Removing `bytes.length < 4` changes nothing for an empty or one-byte
     * file — `bytes[0]` is `undefined` there and every comparison fails anyway.
     * It matters for a file that is literally `09 00`: the BIFF2 test only
     * looks at two bytes, so without the guard a two-byte file is declared a
     * workbook, handed to the parser, and fails with something unhelpful
     * instead of being read as the text it is.
     *
     * The first version of this test asserted the empty and one-byte cases and
     * passed with the guard deleted — a check on inputs that could not
     * distinguish the two behaviours.
     */
    expect(looksLikeWorkbook(Buffer.from([0x09, 0x00])), "a two-byte file is not a workbook").toBe(false);
    expect(looksLikeWorkbook(Buffer.from([0x09, 0x00, 0x04]))).toBe(false);
    // A real BIFF2 workbook is longer and still recognised.
    expect(looksLikeWorkbook(Buffer.from([0x09, 0x00, 0x04, 0x00, 0x02, 0x00]))).toBe(true);
    for (const b of [Buffer.alloc(0), Buffer.from([0xd0])]) expect(looksLikeWorkbook(b)).toBe(false);
  });
});

describe("the text sniffer no longer claims binary files", () => {
  it("would still claim an .xls if asked directly", () => {
    /*
     * Proving the hazard is real, not hypothetical: `parseTabText` on its own
     * still says yes to an .xls, because a UTF-16 OLE2 file genuinely does
     * contain tabs and the word RETAILER_CODE. The fix is not that the sniffer
     * got smarter — it is that it is no longer asked first.
     */
    expect(parseTabText(workbookBytes(C2_ROWS, "xls"))).not.toBeNull();
  });

  it("is not consulted for a workbook", () => {
    const matrix = readMatrix(workbookBytes(C2_ROWS, "xls"), "C2C");
    expect(matrix[0]).toContain("RETAILER_CODE");
    expect(matrix[0]).toContain("SRNUMBER");
  });
});

describe("C2C and C2S parse every accepted format", () => {
  for (const kind of ["C2C", "C2S"] as const) {
    it(`${kind}: legacy .xls`, () => {
      const r = parseC2Workbook(workbookBytes(C2_ROWS, "xls"), kind);
      expect(r.sourceRows).toHaveLength(2);
      expect(r.dateColumns.map((d) => d.label)).toEqual(["01-Aug-2026", "02-Aug-2026"]);
      expect(r.sourceRows[0].retailerCode).toBe("R000001");
      expect(r.sourceRows[0].totalAmount).toBe(700);
    });

    it(`${kind}: .xlsx`, () => {
      const r = parseC2Workbook(workbookBytes(C2_ROWS, "xlsx"), kind);
      expect(r.sourceRows).toHaveLength(2);
      expect(r.sourceRows[1].retailerCode).toBe("R000002");
    });

    it(`${kind}: tab-separated text export`, () => {
      const r = parseC2Workbook(tabBytes(C2_ROWS), kind);
      expect(r.sourceRows).toHaveLength(2);
      expect(r.sourceRows[0].totalAmount).toBe(700);
    });

    it(`${kind}: the three formats agree`, () => {
      /*
       * The strongest assertion here. Each format could parse without error and
       * still disagree — a date read as a serial number in one and a string in
       * another, an amount off by a decimal. Same file, same numbers.
       */
      const [a, b, c] = (["xls", "xlsx"] as const)
        .map((t) => parseC2Workbook(workbookBytes(C2_ROWS, t), kind))
        .concat(parseC2Workbook(tabBytes(C2_ROWS), kind));
      const shape = (r: typeof a) =>
        r.sourceRows.map((s) => [s.retailerCode, s.totalAmount, s.transactionCount, s.daily.map((d) => d.amount)]);
      expect(shape(b)).toEqual(shape(a));
      expect(shape(c)).toEqual(shape(a));
      expect(a.month.toISOString().slice(0, 7)).toBe("2026-08");
    });
  }
});

describe("Opening Balance parses every accepted format", () => {
  /*
   * OB carried its own copy of the same sniffer, so it was broken the same way
   * and would have stayed broken if only C2C had been fixed. `importObWorkbook`
   * needs a database; `readMatrix` is where the format decision happens and is
   * exported for exactly this.
   */
  const OB_ROWS = [
    {
      RETAILER_CODE: "R000001",
      RETAILER_ITOPUP_NO: "01700000001",
      TRANSACTION_COUNT: 0,
      TOTAL_AMOUNT: 1200,
      SRNUMBER: "01900000001",
      "25-Aug-2026": 1200,
    },
  ];

  it("reads a legacy .xls", () => {
    const m = readObMatrix(workbookBytes(OB_ROWS, "xls"));
    expect(m[0]).toContain("RETAILER_CODE");
    expect(m[1]).toContain("R000001");
  });

  it("reads an .xlsx", () => {
    expect(readObMatrix(workbookBytes(OB_ROWS, "xlsx"))[0]).toContain("TOTAL_AMOUNT");
  });

  it("still reads a tab-separated export", () => {
    expect(readObMatrix(tabBytes(OB_ROWS))[0]).toContain("SRNUMBER");
  });
});

import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { normalizeGaHeader, parseGaBusinessDate } from "../lib/ga-parse";
import { parseGaWorkbook } from "../lib/ga-import";
import { countStandardGa, isSimSwapActivation } from "../lib/business-rules";

describe("GA import parsing smoke", () => {
  it("normalizes required sample headings", () => {
    const headings = ["Retailer Code", "SIM NO", "Product Code", "Selling Price", "Activation Date", "Activation Time"];

    expect(headings.map(normalizeGaHeader)).toEqual([
      "RETAILER_CODE",
      "SIM_NO",
      "PRODUCT_CODE",
      "SELLING_PRICE",
      "ACTIVATION_DATE",
      "ACTIVATION_TIME",
    ]);
  });

  it("parses a selected GA business date and rejects malformed dates", () => {
    expect(parseGaBusinessDate("2026-08-26").toISOString().slice(0, 10)).toBe("2026-08-26");
    expect(() => parseGaBusinessDate("26/08/2026")).toThrow();
    expect(() => parseGaBusinessDate("2026-02-31")).toThrow();
  });
});

/**
 * A real GA workbook, through the real parser, at the new tariff.
 *
 * `tests/ga-product.smoke.test.ts` proves the classification and holds the old
 * rule out of the source. This proves the thing the owner actually reported:
 * take a file shaped like the carrier's, put a SIM swap in it at ৳150, and the
 * upload gets through instead of dying on
 *
 *     Data validation failed: 1 invalid row(s). Row 2: SIMWAP must have
 *     SELLING_PRICE 350 for SIM SWAP verification
 *
 * Reading source can only ever say "the bad line is not there any more". This
 * says "a file the owner would upload today parses".
 */
describe("GA workbook parsing at whatever the swap costs", () => {
  const HEADERS = ["RETAILER_CODE", "SIM_NO", "PRODUCT_CODE", "SELLING_PRICE", "ACTIVATION_DATE", "ACTIVATION_TIME"];

  type Row = [string, string, string, number, string, string];

  function gaBytes(rows: Row[], bookType: "xls" | "xlsx" = "xlsx"): Buffer {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADERS, ...rows]), "Sheet1");
    return XLSX.write(wb, { type: "buffer", bookType }) as Buffer;
  }

  const swap = (price: number, sim = "8801700000001"): Row => [
    "R000001",
    sim,
    "SIMWAP",
    price,
    "26-Aug-2026",
    "10:15:00",
  ];

  it("accepts a swap at the new price", () => {
    const out = parseGaWorkbook(gaBytes([swap(150)]));
    expect(out.parsedRows).toHaveLength(1);
    expect(out.parsedRows[0].productCode).toBe("SIMWAP");
    expect(out.parsedRows[0].sellingPrice).toBe(150);
  });

  it("accepts a swap at the old price, and at one nobody has set yet", () => {
    // The point is not that 150 works. It is that the parser has stopped having
    // an opinion, so the next change costs nothing.
    for (const price of [350, 150, 99, 1_000]) {
      const out = parseGaWorkbook(gaBytes([swap(price)]));
      expect(out.parsedRows[0].sellingPrice, `a swap at ${price} was rejected`).toBe(price);
    }
  });

  it("takes a mixed file whole rather than dropping the swaps out of it", () => {
    /*
     * The shape of the reported failure. A real day's file is mostly standard
     * activations with a handful of swaps, and the old check threw the whole
     * upload away — `preErrors` was fatal, not a per-row skip — so one mispriced
     * swap cost the operator every GA in the file.
     */
    const rows: Row[] = [
      ["R000001", "8801700000001", "MMSTC", 170, "26-Aug-2026", "09:00:00"],
      swap(150, "8801700000002"),
      ["R000001", "8801700000003", "MMST", 300, "26-Aug-2026", "11:30:00"],
      ["R000001", "8801700000004", "EV-SWAP", 150, "26-Aug-2026", "12:00:00"],
    ];
    const out = parseGaWorkbook(gaBytes(rows));
    expect(out.parsedRows).toHaveLength(4);
    expect(out.sourceRows).toBe(4);
    expect(out.parsedRows.map((r) => r.productCode)).toEqual(["MMSTC", "SIMWAP", "MMST", "EV-SWAP"]);
  });

  it("counts the swaps in that file as swaps, not as GA", () => {
    // Parsing is only half of it — a swap that imports but lands in the GA
    // total would inflate every target on the dashboard.
    const rows: Row[] = [
      ["R000001", "8801700000001", "MMSTC", 170, "26-Aug-2026", "09:00:00"],
      swap(150, "8801700000002"),
      ["R000001", "8801700000004", "EV-SWAP", 150, "26-Aug-2026", "12:00:00"],
    ];
    const parsed = parseGaWorkbook(gaBytes(rows)).parsedRows;
    expect(parsed.filter(isSimSwapActivation)).toHaveLength(2);
    expect(countStandardGa(parsed)).toBe(1);
  });

  it("still rejects a row with no price at all", () => {
    // Dropping the tariff check is not the same as trusting the column.
    const bad = [["R000001", "8801700000009", "SIMWAP", -5, "26-Aug-2026", "10:15:00"]] as Row[];
    expect(() => parseGaWorkbook(gaBytes(bad))).toThrow(/SELLING_PRICE is invalid/);
  });

  it("does the same from a legacy .xls, which is what actually arrives", () => {
    // v156's format fix and this one meet on the same file.
    const out = parseGaWorkbook(gaBytes([swap(150)], "xls"));
    expect(out.parsedRows[0].sellingPrice).toBe(150);
    expect(out.parsedRows[0].productCode).toBe("SIMWAP");
  });
});

describe("v200: GA dates read day-first however the file was saved", () => {
  const HEADERS = ["RETAILER_CODE", "SIM_NO", "PRODUCT_CODE", "SELLING_PRICE", "ACTIVATION_DATE", "ACTIVATION_TIME"];
  const ROWS = [["R000001", "8801700000001", "MMSTC", "170", "05/09/2026", "10:15:00"]];
  const day = (bytes: Buffer) => {
    const out = parseGaWorkbook(bytes);
    expect(out.preErrors).toEqual([]);
    return out.parsedRows[0].activationDate.toISOString().slice(0, 10);
  };

  it("a text (TSV) export gives 5 September, not 9 May", () => {
    const tsv = [HEADERS, ...ROWS].map((r) => r.join("\t")).join("\n");
    expect(day(Buffer.from(tsv, "utf8"))).toBe("2026-09-05");
  });

  it("the same text in an .xlsx cell gives the same day", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADERS, ...ROWS]), "Sheet1");
    expect(day(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer)).toBe("2026-09-05");
  });

  it("a date with a time on it keeps its day-first reading", () => {
    const rows = [["R000001", "8801700000001", "MMSTC", "170", "01/09/2026 10:00", "10:00:00"]];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADERS, ...rows]), "Sheet1");
    expect(day(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer)).toBe("2026-09-01");
  });
});

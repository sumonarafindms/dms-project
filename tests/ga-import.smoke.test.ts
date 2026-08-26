import { describe, expect, it } from "vitest";
import { normalizeGaHeader, parseGaBusinessDate } from "../lib/ga-parse";

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

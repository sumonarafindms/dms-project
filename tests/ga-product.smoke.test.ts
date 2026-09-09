import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isSimSwapProduct, isStandardGaProduct, normalizeGaProductCode } from "../lib/ga-product";

/**
 * A SIM swap is a product, not a price.
 *
 * ## The bug
 *
 * The swap tariff moved from 350 to 150. The importer held the old number in
 * `expectedSimSwapPrice` and rejected every row that disagreed:
 *
 *     SIMWAP must have SELLING_PRICE 350 for SIM SWAP verification
 *
 * So on the day the price changed, every swap in every GA upload was thrown
 * away — not flagged, not imported at a warning, dropped — and the operator was
 * told the carrier's own file was wrong. The tariff will change again; the rule
 * that broke has to be gone, not updated to 150.
 *
 * What identifies a swap is the product code the carrier writes. That is what
 * these tests hold, and the guards at the bottom hold the absence of the old
 * rule, because "we removed it" is only true until somebody reads a price and
 * compares it to a number again.
 */

describe("GA product identity", () => {
  it("recognizes swap formatting variants", () => {
    expect(isSimSwapProduct("EV-SWAP")).toBe(true);
    expect(isSimSwapProduct("ev swap")).toBe(true);
    expect(isSimSwapProduct("EV_SWAP")).toBe(true);
    expect(isSimSwapProduct("EVSWAP")).toBe(true);
    expect(isSimSwapProduct("SIMWAP")).toBe(true);
    expect(isSimSwapProduct("SIM-WAP")).toBe(true);
    expect(isSimSwapProduct("MMST")).toBe(false);
    expect(isSimSwapProduct("MMSTC")).toBe(false);
  });

  it("counts only MMSTC/MMST/MMSTS as standard GA", () => {
    expect(isStandardGaProduct("MMSTC")).toBe(true);
    expect(isStandardGaProduct("MMST")).toBe(true);
    expect(isStandardGaProduct("MMSTs")).toBe(true);
    expect(isStandardGaProduct("SIMWAP")).toBe(false);
    expect(isStandardGaProduct("EV-SWAP")).toBe(false);
    expect(isStandardGaProduct("OTHER")).toBe(false);
  });

  it("decides what a product is without being shown a price", () => {
    /*
     * The whole of the new rule in one assertion. `isSimSwapProduct` takes one
     * argument and it is not money, so no price — 150, 350, 0 or the next
     * tariff — can change what a row is. If a swap ever needs a price again,
     * this signature has to change first, and that is the point.
     */
    expect(isSimSwapProduct.length).toBe(1);
    expect(isStandardGaProduct.length).toBe(1);
    expect(normalizeGaProductCode(" simwap ")).toBe("SIMWAP");
  });
});

describe("the fixed swap price is gone", () => {
  const ROOT = path.join(__dirname, "..");
  const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
  const codeOf = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("exports no swap price helper to call by accident", async () => {
    const mod: Record<string, unknown> = await import("../lib/ga-product");
    for (const gone of [
      "expectedSimSwapPrice",
      "hasExpectedSimSwapPrice",
      "SIMWAP_SELLING_PRICE",
      "EV_SWAP_SELLING_PRICE",
    ])
      expect(Object.keys(mod), `${gone} is back`).not.toContain(gone);
  });

  it("leaves no price comparison on the import path", () => {
    /*
     * Comments are stripped first. The block that replaced the old check
     * explains it by naming it, and a guard that matches its own explanation
     * would pass with the bug restored — that mistake has already been made
     * once in this codebase.
     */
    const importer = codeOf(read("lib", "ga-import.ts"));
    expect(importer).not.toMatch(/expectedSimSwapPrice|hasExpectedSimSwapPrice/);
    expect(importer, "the importer compares a selling price to a constant").not.toMatch(
      /sellingPrice\s*(!==|===|!=|==)\s*\d/,
    );
    expect(importer).not.toMatch(/SELLING_PRICE \$\{|for SIM SWAP verification/);
  });

  it("still refuses a row with no usable price at all", () => {
    // Removing the tariff check is not the same as trusting the column. A
    // missing or negative amount is a broken row whatever the tariff is.
    expect(codeOf(read("lib", "ga-import.ts"))).toMatch(/sellingPrice\s*===\s*null\s*\|\|\s*sellingPrice\s*<\s*0/);
  });
});

describe("a swap imports and counts at whatever it cost", () => {
  const ROOT = path.join(__dirname, "..");

  it("classifies a swap by code at every price, old, new and absurd", async () => {
    /*
     * The owner's change, stated as behaviour rather than as an absence.
     *
     * 350 was yesterday's tariff, 150 is today's, and the third and fourth
     * numbers stand in for whatever it becomes next. All four are the same
     * kind of row.
     */
    const { classifyGaActivation, isSimSwapActivation, isStandardGaActivation } = await import("../lib/business-rules");
    for (const price of [350, 150, 0, 12_345]) {
      for (const code of ["SIMWAP", "EV-SWAP", "EV_SWAP", "SIM-WAP"]) {
        expect(classifyGaActivation({ productCode: code, sellingPrice: price }), `${code} at ${price}`).toBe(
          "SIM_SWAP",
        );
        expect(isSimSwapActivation({ productCode: code, sellingPrice: price })).toBe(true);
        // And still excluded from GA, which is the reason the category exists.
        expect(isStandardGaActivation({ productCode: code, sellingPrice: price })).toBe(false);
      }
    }
  });

  it("classifies standard GA by code at every price too", async () => {
    // The same freedom, for the same reason — GA prices move as well.
    const { classifyGaActivation } = await import("../lib/business-rules");
    expect(classifyGaActivation({ productCode: "MMSTC", sellingPrice: 999 })).toBe("GA_170");
    expect(classifyGaActivation({ productCode: "MMST", sellingPrice: 1 })).toBe("GA_300");
  });

  it("keeps the price fallback for rows that have no code, and only those", async () => {
    /*
     * Deleting the legacy prices as well would have been the tidier change and
     * the wrong one: rows imported before productCode existed carry no other
     * evidence of what they were, so every past GA and SSO figure would quietly
     * move. The fallback stays, fenced to NULL codes.
     */
    const { classifyGaActivation } = await import("../lib/business-rules");
    expect(classifyGaActivation({ productCode: null, sellingPrice: 350 })).toBe("SIM_SWAP");
    expect(classifyGaActivation({ productCode: null, sellingPrice: 170 })).toBe("GA_170");
    // A coded row at a legacy price of a DIFFERENT category follows the code.
    expect(classifyGaActivation({ productCode: "MMSTC", sellingPrice: 350 })).toBe("GA_170");
    // And a new swap price is not retrofitted onto codeless history.
    expect(classifyGaActivation({ productCode: null, sellingPrice: 150 })).toBe("UNKNOWN");
  });

  it("keeps the legacy prices off every import path", () => {
    /*
     * The rule that would have prevented this bug. An importer that reaches for
     * one of these constants is deciding what a fresh row is by last year's
     * tariff — which is precisely what "SIMWAP must have SELLING_PRICE 350" was.
     */
    const importers = ["ga-import.ts", "c2-import-core.ts", "ob-import.ts", "upload-safety.ts"];
    const offenders = importers.filter((f) =>
      /\bLEGACY_[A-Z0-9_]*PRICE\b/.test(fs.readFileSync(path.join(ROOT, "lib", f), "utf8")),
    );
    expect(offenders, `these importers consult a frozen price:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });
});

describe("what the GA page tells the operator", () => {
  const ROOT = path.join(__dirname, "..");
  const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");

  it("no longer promises a fixed swap price", () => {
    /*
     * The user-facing half of the same bug, and the half that would have
     * outlived the code fix. The upload panel stated the rule as
     * "SIMWAP must have SELLING_PRICE 350", so an operator whose file said 150
     * would conclude the file was wrong — which is exactly what happened.
     */
    const page = read("app", "ga", "page.tsx");
    expect(page, "the upload panel still states a fixed swap price").not.toMatch(/must have <b>SELLING_PRICE \d/);
    expect(page).toMatch(/PRODUCT_CODE decides everything/);
    expect(page).toMatch(/never validated/i);
  });

  it("hands out a sample the importer accepts", async () => {
    /*
     * This was not true before. The sample workbook priced EV-SWAP at 350 while
     * the importer demanded 100, so downloading the app's own example and
     * uploading it failed. A sample nobody round-trips is documentation that
     * can rot silently.
     */
    const route = read("app", "api", "samples", "[type]", "route.ts");
    const rows = [...route.matchAll(/PRODUCT_CODE: "([^"]+)",[\s\S]{0,400}?SELLING_PRICE: (\d+)/g)].map((m) => [
      m[1],
      Number(m[2]),
    ]) as [string, number][];
    expect(rows.length, "no sample GA rows found — has the sample moved?").toBeGreaterThanOrEqual(4);

    const { classifyGaActivation } = await import("../lib/business-rules");
    for (const [code, price] of rows)
      expect(classifyGaActivation({ productCode: code, sellingPrice: price }), `${code} at ${price}`).not.toBe(
        "UNKNOWN",
      );
    // And the two swaps carry different prices on purpose, so the sample itself
    // demonstrates that price is not the identity.
    const swapPrices = rows.filter(([c]) => isSimSwapProduct(c)).map(([, p]) => p);
    expect(swapPrices.length).toBe(2);
    expect(new Set(swapPrices).size, "both sample swaps priced the same — the point is lost").toBe(2);
  });
});

import { describe, expect, it } from "vitest";
import {
  expectedSimSwapPrice,
  hasExpectedSimSwapPrice,
  isSimSwapProduct,
  isStandardGaProduct,
} from "../lib/ga-product";

describe("GA SIM swap product rules", () => {
  it("requires EV-SWAP selling price 100", () => {
    expect(expectedSimSwapPrice("EV-SWAP")).toBe(100);
    expect(hasExpectedSimSwapPrice("EV-SWAP", 100)).toBe(true);
    expect(hasExpectedSimSwapPrice("EV-SWAP", 350)).toBe(false);
  });

  it("keeps SIMWAP selling price 350", () => {
    expect(expectedSimSwapPrice("SIMWAP")).toBe(350);
    expect(hasExpectedSimSwapPrice("SIMWAP", 350)).toBe(true);
  });

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
});

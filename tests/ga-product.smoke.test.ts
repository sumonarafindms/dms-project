import {describe,expect,it} from "vitest";
import {expectedSimSwapPrice,hasExpectedSimSwapPrice,isSimSwapProduct} from "../lib/ga-product";

describe("GA SIM swap product rules",()=>{
  it("requires EV-SWAP selling price 100",()=>{
    expect(expectedSimSwapPrice("EV-SWAP")).toBe(100);
    expect(hasExpectedSimSwapPrice("EV-SWAP",100)).toBe(true);
    expect(hasExpectedSimSwapPrice("EV-SWAP",350)).toBe(false);
  });

  it("keeps SIMWAP selling price 350",()=>{
    expect(expectedSimSwapPrice("SIMWAP")).toBe(350);
    expect(hasExpectedSimSwapPrice("SIMWAP",350)).toBe(true);
  });

  it("recognizes swap code formatting variants so they cannot enter Total GA",()=>{
    expect(isSimSwapProduct("EV-SWAP")).toBe(true);
    expect(isSimSwapProduct("ev swap")).toBe(true);
    expect(isSimSwapProduct("EV_SWAP")).toBe(true);
    expect(isSimSwapProduct("EVSWAP")).toBe(true);
    expect(isSimSwapProduct("SIMWAP")).toBe(true);
    expect(isSimSwapProduct("SIM-WAP")).toBe(true);
    expect(isSimSwapProduct("MMST")).toBe(false);
    expect(isSimSwapProduct("MMSTC")).toBe(false);
  });
});

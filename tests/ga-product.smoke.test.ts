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
    expect(isSimSwapProduct("SIMWAP")).toBe(true);
  });
});

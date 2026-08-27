import { describe, expect, it } from "vitest";
import {
  EV_SWAP_SELLING_PRICE,
  LSO_MIN_MONTHLY_AMOUNT,
  LSO_MIN_MONTHLY_TRANSACTIONS,
  SIMWAP_SELLING_PRICE,
  SSO_MIN_MONTHLY_STANDARD_GA,
  addGaActivation,
  classifyGaActivation,
  countStandardGa,
  emptyGaBreakdown,
  isLsoComplete,
  isSimSellerRetailer,
  isSimSwapActivation,
  isSsoComplete,
  isStandardGaActivation,
  lsoAmountRemaining,
  lsoTransactionsRemaining,
  ssoGaRemaining,
  summarizeGaActivations,
} from "../lib/business-rules";

const row = (productCode: string | null, sellingPrice: number) => ({ productCode, sellingPrice });

describe("GA product classification", () => {
  it("treats MMSTC as the 170 standard GA category", () => {
    expect(classifyGaActivation(row("MMSTC", 170))).toBe("GA_170");
    expect(isStandardGaActivation(row("MMSTC", 170))).toBe(true);
  });

  it("treats MMST and MMSTS as the 300 standard GA category", () => {
    expect(classifyGaActivation(row("MMST", 300))).toBe("GA_300");
    expect(classifyGaActivation(row("MMSTS", 300))).toBe("GA_300");
    expect(classifyGaActivation(row("MMSTs", 300))).toBe("GA_300");
  });

  it("treats SIMWAP at 350 as a replacement, never as GA", () => {
    expect(classifyGaActivation(row("SIMWAP", SIMWAP_SELLING_PRICE))).toBe("SIM_SWAP");
    expect(isStandardGaActivation(row("SIMWAP", SIMWAP_SELLING_PRICE))).toBe(false);
    expect(isSimSwapActivation(row("SIMWAP", SIMWAP_SELLING_PRICE))).toBe(true);
  });

  it("treats EV-SWAP at 100 as a replacement, never as GA", () => {
    expect(classifyGaActivation(row("EV-SWAP", EV_SWAP_SELLING_PRICE))).toBe("SIM_SWAP");
    expect(isStandardGaActivation(row("EV-SWAP", EV_SWAP_SELLING_PRICE))).toBe(false);
  });

  it("recognises every documented swap spelling variant", () => {
    for (const code of ["EV-SWAP", "EV SWAP", "EV_SWAP", "EVSWAP"]) {
      expect(classifyGaActivation(row(code, EV_SWAP_SELLING_PRICE))).toBe("SIM_SWAP");
    }
    for (const code of ["SIMWAP", "SIM-WAP", "SIM_WAP", "SIM WAP"]) {
      expect(classifyGaActivation(row(code, SIMWAP_SELLING_PRICE))).toBe("SIM_SWAP");
    }
  });

  it("never counts an unknown product code as standard GA", () => {
    expect(classifyGaActivation(row("MMXYZ", 300))).toBe("UNKNOWN");
    expect(isStandardGaActivation(row("MMXYZ", 300))).toBe(false);
    expect(isSimSwapActivation(row("MMXYZ", 300))).toBe(false);
  });

  it("classifies legacy rows without a product code by selling price", () => {
    expect(classifyGaActivation(row(null, 170))).toBe("GA_170");
    expect(classifyGaActivation(row(null, 300))).toBe("GA_300");
    expect(classifyGaActivation(row(null, SIMWAP_SELLING_PRICE))).toBe("SIM_SWAP");
    expect(classifyGaActivation(row(null, EV_SWAP_SELLING_PRICE))).toBe("SIM_SWAP");
    expect(classifyGaActivation(row(null, 275))).toBe("UNKNOWN");
  });
});

describe("Total GA", () => {
  it("equals MMSTC count plus MMST/MMSTS count only", () => {
    const rows = [
      ...Array.from({ length: 149 }, () => row("MMSTC", 170)),
      ...Array.from({ length: 23 }, () => row("MMST", 300)),
    ];
    expect(countStandardGa(rows)).toBe(172);
  });

  it("excludes swaps and unknown codes from Total GA but reports them separately", () => {
    const rows = [
      ...Array.from({ length: 149 }, () => row("MMSTC", 170)),
      ...Array.from({ length: 20 }, () => row("MMST", 300)),
      ...Array.from({ length: 3 }, () => row("MMSTS", 300)),
      ...Array.from({ length: 11 }, () => row("SIMWAP", SIMWAP_SELLING_PRICE)),
      ...Array.from({ length: 4 }, () => row("EV_SWAP", EV_SWAP_SELLING_PRICE)),
      row("MMXYZ", 300),
    ];
    const breakdown = summarizeGaActivations(rows);
    expect(breakdown.total).toBe(172);
    expect(breakdown.ga170).toBe(149);
    expect(breakdown.ga300).toBe(23);
    expect(breakdown.ga170 + breakdown.ga300).toBe(breakdown.total);
    expect(breakdown.simSwap).toBe(15);
    expect(breakdown.unknown).toBe(1);
  });

  it("keeps a swap-only retailer at zero Total GA", () => {
    const breakdown = summarizeGaActivations([
      row("SIMWAP", SIMWAP_SELLING_PRICE),
      row("EV-SWAP", EV_SWAP_SELLING_PRICE),
    ]);
    expect(breakdown.total).toBe(0);
    expect(breakdown.simSwap).toBe(2);
  });

  it("adds grouped counts without double counting", () => {
    const breakdown = emptyGaBreakdown();
    addGaActivation(breakdown, row("MMSTC", 170), 149);
    addGaActivation(breakdown, row("MMSTS", 300), 23);
    addGaActivation(breakdown, row("SIMWAP", SIMWAP_SELLING_PRICE), 9);
    expect(breakdown.total).toBe(172);
    expect(breakdown.simSwap).toBe(9);
  });
});

describe("SSO", () => {
  it("needs a SIM seller with at least two standard GA in one month", () => {
    expect(SSO_MIN_MONTHLY_STANDARD_GA).toBe(2);
    expect(isSsoComplete("Y", 2)).toBe(true);
    expect(isSsoComplete("Y", 1)).toBe(false);
    expect(isSsoComplete("y", 3)).toBe(true);
    expect(isSsoComplete(" Y ", 2)).toBe(true);
  });

  it("never completes for a retailer that is not a SIM seller", () => {
    expect(isSsoComplete("N", 9)).toBe(false);
    expect(isSsoComplete(null, 9)).toBe(false);
    expect(isSimSellerRetailer("N")).toBe(false);
  });

  it("reports the remaining GA needed", () => {
    expect(ssoGaRemaining(0)).toBe(2);
    expect(ssoGaRemaining(1)).toBe(1);
    expect(ssoGaRemaining(5)).toBe(0);
  });

  it("does not let SIM swaps close an SSO gap", () => {
    const monthRows = [row("MMSTC", 170), row("SIMWAP", SIMWAP_SELLING_PRICE), row("EV-SWAP", EV_SWAP_SELLING_PRICE)];
    expect(isSsoComplete("Y", countStandardGa(monthRows))).toBe(false);
  });
});

describe("LSO", () => {
  it("completes at amount >= 500 and transactions >= 7", () => {
    expect(LSO_MIN_MONTHLY_AMOUNT).toBe(500);
    expect(LSO_MIN_MONTHLY_TRANSACTIONS).toBe(7);
    expect(isLsoComplete(500, 7)).toBe(true);
    expect(isLsoComplete(10000, 7)).toBe(true);
  });

  it("fails when either side of the rule is short", () => {
    expect(isLsoComplete(499.99, 7)).toBe(false);
    expect(isLsoComplete(500, 6)).toBe(false);
    expect(isLsoComplete(0, 0)).toBe(false);
    expect(isLsoComplete(null, 7)).toBe(false);
  });

  it("reports the remaining amount and transactions", () => {
    expect(lsoAmountRemaining(320)).toBe(180);
    expect(lsoAmountRemaining(900)).toBe(0);
    expect(lsoTransactionsRemaining(3)).toBe(4);
    expect(lsoTransactionsRemaining(12)).toBe(0);
  });
});

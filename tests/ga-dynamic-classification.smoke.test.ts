import { describe, expect, it } from "vitest";
import {
  LEGACY_EV_SWAP_PRICE,
  LEGACY_GA_170_PRICE,
  LEGACY_SIMWAP_PRICE,
  classifyGaActivation,
  ga170Tariff,
  gaTierFilters,
  isNormalSimProduct,
  isSimSwapProduct,
  summarizeGaActivations,
  withSimSwap,
  withStandardGa,
} from "../lib/business-rules";

/**
 * The rules work a code out instead of looking it up.
 *
 * ## What the owner's real file showed
 *
 * `ActivationDetailsReport.xlsx`, 1–15 September, 2,527 rows. The old rules
 * held four literal swap codes and two literal GA codes, and everything else
 * was `UNKNOWN` — which every total silently dropped:
 *
 *     SIMSWAP    568 rows  -> UNKNOWN   it is a replacement
 *     ESIMSWAP     2 rows  -> UNKNOWN   it is a replacement
 *     MMSTSC       8 rows  -> UNKNOWN   it is a normal SIM at 170
 *     MMST1911     1 row   -> UNKNOWN   it is a normal SIM at 200
 *
 * 579 of 2,527 — nearly a quarter of the file — and the SIM SWAP figure on
 * screen read 9. `SIMSWAP` differs from the listed `SIMWAP` by one letter.
 *
 * ## The rule
 *
 *     "amon vabe update koro je oi nijer theke jate bujte pare swap konta and
 *      normal sim konta ... amar protibar change hobe price ar protibar ki amar
 *      update korte hobe naki .. aita ke dynamic korar kono way bar koro"
 *
 * The file is an Activation Details Report: every row is an activation, and the
 * only distinction the business draws is new versus replacement. So a code that
 * says SWAP is a replacement and everything else is a normal SIM. No list, and
 * nothing to edit when the carrier invents a spelling.
 */

const row = (productCode: string | null, sellingPrice: number) => ({ productCode, sellingPrice });

describe("a code that names a replacement, however it is spelled", () => {
  it("recognises every spelling in the owner's file", () => {
    for (const code of ["SIMSWAP", "ESIMSWAP", "EV-SWAP", "SIMWAP"])
      expect(isSimSwapProduct(code), `${code} is a replacement`).toBe(true);
  });

  it("recognises the separator variants, and spellings nobody has sent yet", () => {
    for (const code of ["SIM-WAP", "SIM_WAP", "SIM WAP", "EV_SWAP", "EVSWAP", "ev-swap", " e-sim-swap "])
      expect(isSimSwapProduct(code), code).toBe(true);
    // The point of a shape rule: these have never appeared and would still work.
    for (const code of ["ESIM-SWAP", "SIMSWAP2", "SWAP-4G", "NEWSIMSWAP"])
      expect(isSimSwapProduct(code), `${code} would need a code change under a list`).toBe(true);
  });

  it("does not mistake a SIM code for one", () => {
    for (const code of ["MMSTC", "MMST", "MMSTS", "MMSTSC", "MMST1911", "MMXYZ"])
      expect(isSimSwapProduct(code), code).toBe(false);
    expect(isSimSwapProduct("")).toBe(false);
    expect(isSimSwapProduct(null)).toBe(false);
  });

  it("treats everything else as a normal SIM", () => {
    for (const code of ["MMSTC", "MMST", "MMSTS", "MMSTSC", "MMST1911", "SOMETHINGNEW"])
      expect(isNormalSimProduct(code), code).toBe(true);
    for (const code of ["SIMSWAP", "EV-SWAP", "", null]) expect(isNormalSimProduct(code), String(code)).toBe(false);
  });
});

describe("the 170 tariff is learned, not declared", () => {
  it("reads it off the one code we are sure about", () => {
    const rows = [row("MMSTC", 170), row("MMSTC", 170), row("MMST", 300)];
    expect([...ga170Tariff(rows)]).toEqual([170]);
  });

  it("follows the tariff when the carrier moves it", () => {
    /*
     * The whole request in one test. The swap price already went 350 -> 150 once
     * and broke the importer (v157); MMST in the September file carries 200, 241
     * and 300. Prices move, and nobody should have to edit code when they do.
     */
    const movedTo180 = [row("MMSTC", 180), row("MMSTC", 180), row("MMST", 320)];
    expect([...ga170Tariff(movedTo180)]).toEqual([180]);
    // An unfamiliar code priced at the NEW 170-tier price follows it there.
    expect(classifyGaActivation(row("MMSTNEW", 180), ga170Tariff(movedTo180))).toBe("GA_170");
    // And the old price is no longer the 170 tier, so it is not treated as one.
    expect(classifyGaActivation(row("MMSTNEW", 170), ga170Tariff(movedTo180))).toBe("GA_300");
  });

  it("holds two prices when a tariff changes mid-file", () => {
    expect([...ga170Tariff([row("MMSTC", 170), row("MMSTC", 180)])].sort((a, b) => a - b)).toEqual([170, 180]);
  });

  it("falls back to the historical price when there is nothing to learn from", () => {
    // A fresh database, or a set of rows with no MMSTC in it.
    expect([...ga170Tariff([])]).toEqual([LEGACY_GA_170_PRICE]);
    expect([...ga170Tariff([row("MMST", 300)])]).toEqual([LEGACY_GA_170_PRICE]);
  });

  it("never lets a price re-decide a code we know", () => {
    /*
     * v157's rule, still standing. A tariff is not an identity: MMST arrived at
     * 200, 241 and 300 in one file, and MMSTS at 89.2. If price could override a
     * known code, that file would have scattered them across both tiers.
     */
    const tariff = new Set([170]);
    expect(classifyGaActivation(row("MMST", 170), tariff)).toBe("GA_300");
    expect(classifyGaActivation(row("MMSTS", 89.2), tariff)).toBe("GA_300");
    expect(classifyGaActivation(row("MMSTC", 999), tariff)).toBe("GA_170");
    expect(classifyGaActivation(row("SIMSWAP", 170), tariff)).toBe("SIM_SWAP");
  });
});

describe("the owner's September file, row for row", () => {
  /** The eight codes the real file contains, with their counts. */
  const FILE = [
    ["MMSTC", 170, 1425, "GA_170"],
    ["SIMSWAP", 150, 568, "SIM_SWAP"],
    ["MMST", 300, 489, "GA_300"],
    ["MMSTS", 300, 25, "GA_300"],
    ["EV-SWAP", 100, 9, "SIM_SWAP"],
    ["MMSTSC", 170, 8, "GA_170"],
    ["ESIMSWAP", 350, 2, "SIM_SWAP"],
    ["MMST1911", 200, 1, "GA_300"],
  ] as const;

  const rows = FILE.flatMap(([code, price, count]) => Array.from({ length: count }, () => row(code, price)));

  it("places every single row", () => {
    const b = summarizeGaActivations(rows);
    expect(rows).toHaveLength(2527);
    expect(b.unknown, "a row nobody can classify is a row nobody can see").toBe(0);
    expect(b.total + b.simSwap).toBe(2527);
  });

  it("gives the numbers the owner asked for", () => {
    const b = summarizeGaActivations(rows);
    expect(b.total, "normal SIM").toBe(1948);
    expect(b.ga170).toBe(1433); // 1425 MMSTC + 8 MMSTSC
    expect(b.ga300).toBe(515); // 489 MMST + 25 MMSTS + 1 MMST1911
    expect(b.simSwap).toBe(579); // 568 + 9 + 2
  });

  it("is a real change from what the app used to say", () => {
    /*
     * Before: 1,939 normal SIM, 9 swaps, 579 rows in a bucket nobody reads.
     * The Total GA moved by 9 and the swap figure by 570.
     */
    const b = summarizeGaActivations(rows);
    expect(b.total).not.toBe(1939);
    expect(b.simSwap).not.toBe(9);
  });
});

describe("the same rules in SQL", () => {
  /*
   * The filters have to agree with the in-memory classifier or a page and its
   * drill-down disagree about the same day. They are checked by shape here
   * because a Prisma where-clause cannot be executed without a database; the
   * numbers above are the behavioural check.
   */
  const json = (x: unknown) => JSON.stringify(x);

  it("matches swaps by what the code says, not by a list", () => {
    const f = json(withSimSwap());
    expect(f, "a list of literal codes cannot match SIMSWAP").toContain('"contains":"SWAP"');
    expect(f).toContain('"endsWith":"WAP"');
    expect(f, "the legacy price path for rows with no code at all").toContain(String(LEGACY_SIMWAP_PRICE));
    expect(f).toContain(String(LEGACY_EV_SWAP_PRICE));
  });

  it("counts Total GA as everything that is not a swap", () => {
    const f = json(withStandardGa());
    // No product-code list, and no tariff: Total GA needs neither, which is why
    // it stays synchronous in the thirty places that use it.
    expect(f).toContain('"NOT"');
    expect(f).toContain('"contains":"SWAP"');
    expect(f).not.toContain("MMSTC");
  });

  it("keeps the caller's own where clause", () => {
    // Spreading instead of AND-ing would silently drop an existing OR.
    const where = { retailerId: "r1" };
    expect(json(withStandardGa(where))).toContain('"retailerId":"r1"');
    expect(json(withSimSwap(where))).toContain('"retailerId":"r1"');
  });

  it("splits the tiers with the tariff it is given", () => {
    const f = gaTierFilters(new Set([180]));
    expect(json(f.ga170)).toContain("180");
    expect(json(f.ga300)).toContain("180");
    // A known code is in the tier its code says, never the one its price says.
    expect(json(f.ga170)).toContain("MMSTC");
    expect(json(f.ga300)).toContain("MMSTS");
  });
});

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { GA_CATEGORY_LABEL, gaCategoryLabel } from "../lib/ga-category";
import { LEGACY_GA_170_PRICE, gaRowLabel } from "../lib/business-rules";

/**
 * One name per GA category, and no screen deciding one for itself.
 *
 * ## What was wrong
 *
 * The 170-tier count was called three different things:
 *
 *     /ga                     label "150",      note "MMSTC · selling price 170"
 *     /bp/sales               label "170 GA"
 *     BP activation list      label "150 pack"
 *
 * The first contradicts its own subtitle. The field holding the number was
 * `ga150` everywhere, a name frozen at a tariff that had already moved twice —
 * the swap price went 350 -> 150 in v157, and MMST arrived at 200, 241 and 300
 * in one file.
 *
 * Worse than the words: the BP activation list decided each row's label with
 * `Number(x.sellingPrice) === 170`, the last hardcoded tariff in the app. Its
 * own totals came from the shared rules, so on the day the carrier moved the
 * price the list and the numbers above it would have disagreed.
 */

const ROOT = path.join(__dirname, "..");

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next") continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...tsxFiles(rel));
    else if (/\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const FILES = tsxFiles("app")
  .concat(tsxFiles("lib"))
  .map((file) => ({ file, src: stripComments(fs.readFileSync(path.join(ROOT, file), "utf8")) }));

describe("the labels", () => {
  it("name the category, not a price", () => {
    expect(gaCategoryLabel("GA_170")).toBe("GA 170");
    expect(gaCategoryLabel("GA_300")).toBe("GA 300");
    expect(gaCategoryLabel("SIM_SWAP")).toBe("SIM swap");
    expect(gaCategoryLabel("UNKNOWN")).toBe("Unclassified");
  });

  it("label a row from the same rules that count it", () => {
    const tariff = new Set([185]);
    // The tariff has moved to 185; the CATEGORY is still called 170.
    expect(gaRowLabel({ productCode: "MMSTNEW", sellingPrice: 185 }, tariff)).toBe("GA 170");
    expect(gaRowLabel({ productCode: "MMSTNEW", sellingPrice: 300 }, tariff)).toBe("GA 300");
    expect(gaRowLabel({ productCode: "SIMSWAP", sellingPrice: 150 }, tariff)).toBe("SIM swap");
    // And a known code is labelled by its code, whatever it cost.
    expect(gaRowLabel({ productCode: "MMSTC", sellingPrice: 999 }, tariff)).toBe("GA 170");
  });

  it("live where a client component can read them", () => {
    /*
     * They were first put in lib/business-rules.ts, which imports
     * `@prisma/client`. `/ga` is a client component, so that would have shipped
     * Prisma to the browser — tests/client-bundle.smoke.test.ts caught it. The
     * labels now sit beside lib/achievement.ts's bands, for the same reason.
     */
    // Comments stripped: this file's own prose explains the rule by naming the
    // very import it forbids, which would fail the check it is describing.
    const category = stripComments(fs.readFileSync(path.join(ROOT, "lib", "ga-category.ts"), "utf8"));
    expect(category).not.toMatch(/@prisma\/client/);
    expect(category).not.toMatch(/from "\.\/prisma"/);
    expect(category, "nothing at all is imported, which is the point").not.toMatch(/^\s*import /m);
    expect(fs.readFileSync(path.join(ROOT, "lib", "business-rules.ts"), "utf8")).toMatch(/export \{ GA_CATEGORY_LABEL/);
  });
});

describe("no screen names a tier by itself", () => {
  it("has no frozen tier label left in the app", () => {
    /*
     * "150" as a label is the specific string this was written about, and it is
     * barred outright: the category has never been called 150, and the only
     * reason it was on screen is that the price used to be.
     */
    const offenders: string[] = [];
    for (const { file, src } of FILES) {
      if (file === path.join("lib", "ga-category.ts")) continue;
      for (const m of src.matchAll(/\b(?:label|title)\s*[=:]\s*"(150|170|300|150 pack|300 pack|170 GA|300 GA)"/g))
        offenders.push(`${file}: ${m[0]}`);
      /*
       * Table headers too. The first version of this sweep only looked at
       * `label=` and `title=`, and two `<th>150</th>` on the GA page walked
       * straight past it — found by reading the rendered page in a browser,
       * which is the check a source regex cannot replace.
       */
      for (const m of src.matchAll(/<th[^>]*>\s*(150|170|300|SIM SWAP)\s*<\/th>/g)) offenders.push(`${file}: ${m[0]}`);
    }
    expect(offenders, `use GA_CATEGORY_LABEL:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });

  it("leaves no field named after a tariff that moved", () => {
    // `ga150` / `total150` held the 170 count in eleven files.
    const offenders = FILES.filter((f) => /\b(ga150|total150|a150)\b/.test(f.src)).map((f) => f.file);
    expect(offenders, `these are named after the old tariff:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });

  it("compares no selling price to a hardcoded tariff", () => {
    /*
     * The general rule, and the one that actually bites. v157 took price out of
     * the importer, v172 took it out of classification, and one component still
     * had `Number(x.sellingPrice) === 170` deciding what a row was called.
     *
     * The legacy constants are exempt where they are DEFINED and where the
     * no-product-code fallback reads them; nothing else may name a tariff.
     */
    const offenders: string[] = [];
    for (const { file, src } of FILES) {
      if (file === path.join("lib", "business-rules.ts")) continue;
      for (const m of src.matchAll(/sellingPrice[^;\n]{0,40}[=!]==?\s*\d+/g)) offenders.push(`${file}: ${m[0]}`);
      for (const m of src.matchAll(/\d+\s*[=!]==?\s*[^;\n]{0,40}sellingPrice/g)) offenders.push(`${file}: ${m[0]}`);
    }
    expect(offenders, `classify with the shared rules instead:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });

  it("would notice each of those if they came back", () => {
    // Three regexes over a directory walk: plenty of room to match nothing.
    const label = /\b(?:label|title)\s*[=:]\s*"(150|170|300|150 pack|300 pack|170 GA|300 GA)"/g;
    expect([...`<X label="150" />`.matchAll(label)]).toHaveLength(1);
    expect([...`{ label: "150 pack" }`.matchAll(label)]).toHaveLength(1);
    expect([...`<X label={GA_CATEGORY_LABEL.GA_170} />`.matchAll(label)]).toHaveLength(0);

    const th = /<th[^>]*>\s*(150|170|300|SIM SWAP)\s*<\/th>/g;
    expect([...`<th className="is-right">150</th>`.matchAll(th)]).toHaveLength(1);
    expect([...`<th className="is-right">SIM SWAP</th>`.matchAll(th)]).toHaveLength(1);
    expect([...`<th className="is-right">{GA_CATEGORY_LABEL.GA_170}</th>`.matchAll(th)]).toHaveLength(0);
    expect([...`<th>Total GA</th>`.matchAll(th)]).toHaveLength(0);

    const price = /sellingPrice[^;\n]{0,40}[=!]==?\s*\d+/g;
    expect([...`Number(x.sellingPrice) === 170 ? "a" : "b"`.matchAll(price)]).toHaveLength(1);
    expect([...`classifyGaActivation(x, tariff)`.matchAll(price)]).toHaveLength(0);
    expect([...`sellingPrice: new Prisma.Decimal(row.sellingPrice)`.matchAll(price)]).toHaveLength(0);

    expect(/\b(ga150|total150|a150)\b/.test("const ga150 = 1")).toBe(true);
    expect(/\b(ga150|total150|a150)\b/.test("const ga170 = 1")).toBe(false);
  });

  it("still keeps the legacy price constants, which are a different thing", () => {
    // They read rows imported before productCode existed. They are history, not
    // a tariff, and lib/business-rules.ts is the only place that may use them.
    expect(LEGACY_GA_170_PRICE).toBe(170);
    const rules = fs.readFileSync(path.join(ROOT, "lib", "business-rules.ts"), "utf8");
    expect(rules).toMatch(/LEGACY_GA_170_PRICE/);
  });
});

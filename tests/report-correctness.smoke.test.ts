import { describe, expect, it } from "vitest";
import { parseYmd } from "../lib/date-range";
import { isMonthToDate, monthToDate, parseYmdUtc, rangePresets, resolveRange } from "../lib/report-range";
import { coversDate, overlapsRange } from "../lib/bp-period";
import { normalizeHeader } from "../lib/sheet-headers";
import { matchesTokens } from "../lib/text-search";

/**
 * Regressions for the correctness issues raised in the 2026-08-29 audit.
 * Each test names the wrong behaviour it exists to prevent.
 */

describe("strict YMD parsing", () => {
  it("accepts real calendar dates", () => {
    expect(parseYmd("2026-02-28")?.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(parseYmd("2024-02-29")?.toISOString()).toBe("2024-02-29T00:00:00.000Z");
    expect(parseYmd("2026-12-31")?.toISOString()).toBe("2026-12-31T00:00:00.000Z");
  });

  it("rejects impossible days instead of rolling them forward", () => {
    // new Date("2026-02-31T00:00:00Z") silently answers 3 March.
    expect(parseYmd("2026-02-31")).toBeNull();
    expect(parseYmd("2026-04-31")).toBeNull();
    expect(parseYmd("2026-02-30")).toBeNull();
    expect(parseYmd("2025-02-29")).toBeNull(); // 2025 is not a leap year
  });

  it("rejects impossible months and malformed input", () => {
    expect(parseYmd("2026-13-01")).toBeNull();
    expect(parseYmd("2026-00-10")).toBeNull();
    expect(parseYmd("2026-1-1")).toBeNull();
    expect(parseYmd("")).toBeNull();
    expect(parseYmd(null)).toBeNull();
    expect(parseYmd(undefined)).toBeNull();
  });

  it("is the same parser the reporting centre uses", () => {
    expect(parseYmdUtc("2026-02-31")).toBeNull();
    expect(parseYmdUtc("2026-08-29")?.toISOString()).toBe("2026-08-29T00:00:00.000Z");
  });
});

describe("report range presets", () => {
  it("never produces a backwards range", () => {
    // On the 1st of a month, month-to-date has no completed days: `from` would
    // be today and `to` yesterday, and resolveRange would swap them into an
    // unintended cross-month range.
    for (const preset of rangePresets()) {
      expect(preset.range.from <= preset.range.to).toBe(true);
    }
  });

  it("offers a whole previous month", () => {
    const last = rangePresets().find((p) => p.label === "Last Month");
    expect(last).toBeTruthy();
    expect(last!.range.from.slice(8)).toBe("01");
    // The end must be the real last day of that month, not a fixed 30/31.
    const [y, m] = last!.range.from.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    expect(Number(last!.range.to.slice(8))).toBe(lastDay);
  });

  it("resolves every preset to a usable range", () => {
    for (const preset of rangePresets()) {
      const r = resolveRange(preset.range.from, preset.range.to);
      expect(parseYmd(r.from)).not.toBeNull();
      expect(parseYmd(r.to)).not.toBeNull();
      expect(r.from <= r.to).toBe(true);
    }
  });
});

describe("BP assignment periods", () => {
  const d = (s: string) => parseYmd(s)!;
  const start = d("2026-08-01"),
    endExclusive = d("2026-09-01");

  it("selects assignments overlapping the report period", () => {
    const where = overlapsRange(start, endExclusive);
    expect(where.startDate.lt).toEqual(endExclusive);
    expect(where.OR).toEqual([{ endDate: null }, { endDate: { gte: start } }]);
  });

  it("attributes a day to the assignment in force on that day", () => {
    // BP A: 1–20 Aug. BP B: 21 Aug onward. This is the audit's fixture.
    const a = { startDate: d("2026-08-01"), endDate: d("2026-08-20") };
    const b = { startDate: d("2026-08-21"), endDate: null };

    expect(coversDate(a, d("2026-08-19"), start, endExclusive)).toBe(true);
    expect(coversDate(b, d("2026-08-19"), start, endExclusive)).toBe(false);

    expect(coversDate(a, d("2026-08-22"), start, endExclusive)).toBe(false);
    expect(coversDate(b, d("2026-08-22"), start, endExclusive)).toBe(true);
  });

  it("counts the assignment's last day and excludes the day after", () => {
    const a = { startDate: d("2026-08-01"), endDate: d("2026-08-20") };
    expect(coversDate(a, d("2026-08-20"), start, endExclusive)).toBe(true);
    expect(coversDate(a, d("2026-08-21"), start, endExclusive)).toBe(false);
  });

  it("ignores activity outside the report window entirely", () => {
    const open = { startDate: d("2026-01-01"), endDate: null };
    expect(coversDate(open, d("2026-07-31"), start, endExclusive)).toBe(false);
    expect(coversDate(open, d("2026-09-01"), start, endExclusive)).toBe(false);
    expect(coversDate(open, d("2026-08-15"), start, endExclusive)).toBe(true);
  });
});

describe("spreadsheet header normalisation", () => {
  it("neutralises prototype-polluting keys from an uploaded workbook", () => {
    // The retailer import is the one place that reads sheets as objects, so it
    // is the only call site exposed to CVE-2023-30533's path. Header
    // normalisation uppercases and strips punctuation, which turns a hostile
    // key into an inert one — keep it that way.
    expect(normalizeHeader("__proto__")).toBe("__PROTO__");
    expect(normalizeHeader("constructor")).toBe("CONSTRUCTOR");
    expect(normalizeHeader("prototype")).toBe("PROTOTYPE");
    for (const hostile of ["__proto__", "constructor", "prototype"]) {
      expect(normalizeHeader(hostile)).not.toBe(hostile);
    }
  });

  it("still normalises ordinary headers the same way", () => {
    expect(normalizeHeader("  retailer code  ")).toBe("RETAILER CODE");
    expect(normalizeHeader("I_TOP_UP_SR_NUMBER")).toBe("I_TOP_UP_SR_NUMBER");
  });
});

describe("instant-search token matching", () => {
  it("matches tokens in any order", () => {
    const hay = "ret-00042 rahim mobile store rso karim route 7";
    expect(matchesTokens(hay, "rahim mobile")).toBe(true);
    // A plain includes() fails this one, and typing a name plus a code is
    // exactly how people narrow one of these lists.
    expect(matchesTokens(hay, "mobile rahim")).toBe(true);
    expect(matchesTokens(hay, "rahim ret-00042")).toBe(true);
    expect(matchesTokens(hay, "route 7 karim")).toBe(true);
  });

  it("requires every token", () => {
    const hay = "ret-00042 rahim mobile store";
    expect(matchesTokens(hay, "rahim nurjahan")).toBe(false);
    expect(matchesTokens(hay, "zzz")).toBe(false);
  });

  it("treats an empty or whitespace query as no filter", () => {
    expect(matchesTokens("anything", "")).toBe(true);
    expect(matchesTokens("anything", "   ")).toBe(true);
  });
});

describe("month-to-date comparison", () => {
  it("spans from the 1st of the report's own month to its last day", () => {
    expect(monthToDate({ from: "2026-08-20", to: "2026-08-20" })).toEqual({ from: "2026-08-01", to: "2026-08-20" });
    // A range crossing a month boundary anchors on the END month: the target
    // being compared against is that month's.
    expect(monthToDate({ from: "2026-07-28", to: "2026-08-03" })).toEqual({ from: "2026-08-01", to: "2026-08-03" });
  });

  it("recognises a range that is already month-to-date", () => {
    expect(isMonthToDate({ from: "2026-08-01", to: "2026-08-20" })).toBe(true);
    expect(isMonthToDate({ from: "2026-08-02", to: "2026-08-20" })).toBe(false);
    // Yesterday-only, the daily report's default: not MTD, so the report must
    // compute the MTD figure separately rather than divide one day by a month.
    expect(isMonthToDate({ from: "2026-08-20", to: "2026-08-20" })).toBe(false);
  });
});

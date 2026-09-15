import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE, fmtDate, fmtDateTime, fmtMoney, fmtNumber, fmtTime } from "../lib/format";

/**
 * Every figure renders the same on the server and in the reader's browser.
 *
 * ## The bug
 *
 * `(2190).toLocaleString()` with no locale uses the runtime's default. Node's
 * is `en-US`; the browser's is the reader's own. For this app's users those are
 * not close:
 *
 *     en-US  →  2,190          bn-BD  →  ২,১৯০
 *
 * Every digit changes, not just the separator, so even a one-digit number
 * differs. In a client component that is a hydration mismatch on every load —
 * React discards the server's HTML and re-renders the tree. Reproduced against
 * the running app on `/it/reports/sso`:
 *
 *     locale en-US -> pageerrors: 0/30
 *     locale bn-BD -> pageerrors: 3/3
 *       Minified React error #418 … args[]=text
 *
 * 242 call sites across 67 files were bare. The kit's own `fmt` had pinned
 * `en-US` from the start; everything that formatted a number without going
 * through it had not.
 *
 * Dates are the same failure with a second cause: `toLocaleString("en-US")` on
 * a Date still uses the runtime's TIME ZONE, which is UTC on the server and
 * Dhaka in the reader's browser. Pinning the locale alone would have left those
 * mismatching, so they go through `fmtDate`/`fmtTime`/`fmtDateTime`, which pin
 * the zone as well.
 */

const ROOT = path.join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(rel));
    else if (/\.tsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const FILES = sourceFiles("app")
  .concat(sourceFiles("lib"))
  .map((file) => ({
    file,
    // Comments are stripped so this file's own prose about the bug, and any
    // comment quoting the bad form, cannot fail the sweep.
    src: fs
      .readFileSync(path.join(ROOT, file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1"),
  }));

describe("the formatters say what they format", () => {
  it("writes Latin digits whatever the machine's locale is", () => {
    expect(DISPLAY_LOCALE).toBe("en-US");
    expect(fmtNumber(2190)).toBe("2,190");
    expect(fmtNumber(7)).toBe("7");
    expect(fmtNumber(null)).toBe("0");
    expect(fmtMoney(1234.6)).toBe("৳1,235");
  });

  it("is actually different from what the bare call would do in Bengali", () => {
    /*
     * Without this the guard below could be enforcing a rule that changes
     * nothing. `toLocaleString("bn-BD")` is what a Dhaka browser does to a bare
     * call, and it shares not one character with what the server sends.
     */
    const bengali = (2190).toLocaleString("bn-BD");
    expect(bengali).not.toBe(fmtNumber(2190));
    expect(/[০-৯]/.test(bengali), `bn-BD rendered ${bengali}`).toBe(true);
    expect(/[০-৯]/.test(fmtNumber(2190))).toBe(false);
    // Even a single digit differs, which is why "the numbers are small" is not
    // a defence.
    expect((7).toLocaleString("bn-BD")).not.toBe(fmtNumber(7));
  });

  it("pins the time zone as well as the locale", () => {
    expect(DISPLAY_TIME_ZONE).toBe("Asia/Dhaka");
    // 2026-09-14T20:30:00Z is already the 15th in Dhaka (UTC+6).
    const instant = "2026-09-14T20:30:00.000Z";
    expect(fmtDate(instant)).toBe("Sep 15, 2026");
    expect(fmtTime(instant)).toBe("2:30 AM");
    expect(fmtDateTime(instant)).toBe("Sep 15, 2026, 2:30 AM");
  });

  it("says so rather than throwing when there is nothing to format", () => {
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate(undefined, "-")).toBe("-");
    expect(fmtDate("not a date", "-")).toBe("-");
    expect(fmtTime(null, "No import yet")).toBe("No import yet");
  });
});

describe("no bare locale call survives in the app", () => {
  it("is reading the files it means to", () => {
    // If the walk breaks, the sweeps below pass by checking nothing.
    expect(FILES.length).toBeGreaterThan(150);
    expect(FILES.some((f) => f.file.endsWith("Kit.tsx"))).toBe(true);
    expect(FILES.some((f) => f.src.includes("toLocaleString"))).toBe(true);
  });

  it("finds no toLocaleString / toLocaleDateString / toLocaleTimeString without a locale", () => {
    const offenders: string[] = [];
    for (const { file, src } of FILES)
      for (const m of src.matchAll(/\.toLocale(String|DateString|TimeString)\(\s*\)/g))
        offenders.push(`${file}: .toLocale${m[1]}()`);
    expect(
      offenders,
      `pass "en-US" (or use lib/format) — a bare call renders Bengali digits in a Bengali browser:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("formats a Date through lib/format, never through a locale-only call", () => {
    /*
     * `new Date(x).toLocaleString("en-US")` looks fixed and is not: the locale
     * is pinned but the TIME ZONE is still the runtime's, so the server writes
     * UTC and the browser writes Dhaka. Only the helpers pin both.
     */
    const offenders: string[] = [];
    for (const { file, src } of FILES) {
      if (file === path.join("lib", "format.ts")) continue;
      for (const m of src.matchAll(/\.toLocale(String|DateString|TimeString)\((?!\s*\))[^)]*\)/g)) {
        const before = src.slice(Math.max(0, m.index! - 140), m.index!);
        const onADate = /new Date\([^;]*$/.test(before) || /\bdate\w*\s*$/i.test(before);
        const pinnedZone = /timeZone/.test(m[0]);
        if (onADate && !pinnedZone) offenders.push(`${file}: ${m[0].slice(0, 60)}`);
      }
    }
    expect(
      offenders,
      `use fmtDate/fmtTime/fmtDateTime — these pin only the locale:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("would notice one if it came back", () => {
    /*
     * Three regexes and a directory walk: plenty of room for a guard that
     * matches nothing and reports success. Run against the exact shapes it
     * looks for, and the ones it must leave alone.
     */
    const bare = /\.toLocale(String|DateString|TimeString)\(\s*\)/g;
    expect([...`x.toLocaleString()`.matchAll(bare)]).toHaveLength(1);
    expect([...`d.toLocaleDateString()`.matchAll(bare)]).toHaveLength(1);
    expect([...`d.toLocaleTimeString(  )`.matchAll(bare)]).toHaveLength(1);
    expect([...`x.toLocaleString("en-US")`.matchAll(bare)]).toHaveLength(0);
    expect([...`fmtNumber(x)`.matchAll(bare)]).toHaveLength(0);
  });
});

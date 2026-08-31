import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { COMPARISON_KINDS, COMPARISON_KIND_LABEL, parseComparisonKind } from "../lib/comparison";

/**
 * The comparison block is shared, and must stay shared.
 *
 * v130 shipped "compared with the previous period" to /rso, /supervisor and
 * /manager as three byte-identical copies of the same JSX. Nothing was wrong
 * with any of them, which is the problem: three copies drift silently, and the
 * heading text carries a real explanation — that two cards may name different
 * dates, because the feeds do not arrive together. A copy that loses that
 * sentence still renders perfectly.
 *
 * v134 was one paste away from a fourth copy on /dashboard. Instead the block
 * became `ComparisonSection` in the kit, and these tests keep it that way.
 */

const ROOT = path.join(__dirname, "..");
const APP = path.join(ROOT, "app");
const rel = (f: string) => path.relative(ROOT, f);
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

function tsxFiles(dir = APP, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) tsxFiles(full, acc);
    else if (e.name.endsWith(".tsx")) acc.push(full);
  }
  return acc;
}

/** Every page that shows a period comparison. */
const CONSUMERS = ["app/rso/page.tsx", "app/supervisor/page.tsx", "app/manager/page.tsx", "app/dashboard/page.tsx"];

describe("the comparison block is defined once", () => {
  it("is used by all four surfaces", () => {
    // Guards against this suite passing because the block was removed rather
    // than shared.
    for (const file of CONSUMERS) expect(stripComments(read(file)), file).toMatch(/<ComparisonSection\b/);
  });

  it("has no page building the period switch itself", () => {
    const offenders = tsxFiles()
      .filter((f) => path.basename(f) !== "Kit.tsx")
      .filter((f) => /kit-period-switch/.test(stripComments(fs.readFileSync(f, "utf8"))))
      .map(rel);
    expect(offenders, "the period switch belongs to Kit.tsx alone").toEqual([]);
  });

  it("has no page re-listing the three kinds by hand", () => {
    // `["day", "week", "month"]` written out in a page is the copy this test
    // exists to stop; COMPARISON_KINDS is the one list.
    const offenders = tsxFiles()
      .filter((f) => path.basename(f) !== "Kit.tsx")
      .filter((f) => /\[\s*"day"\s*,\s*"week"\s*,\s*"month"\s*\]/.test(stripComments(fs.readFileSync(f, "utf8"))))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("keeps the heading's explanation in exactly one place", () => {
    // The sentence about feeds arriving separately is the reason two cards may
    // show different dates. Duplicating it is how it goes stale.
    const holders = tsxFiles()
      .filter((f) => /do not always arrive together/.test(fs.readFileSync(f, "utf8")))
      .map(rel);
    expect(holders).toEqual(["app/components/Kit.tsx"]);
  });

  it("offers a link mode and a select mode, and no third way", () => {
    const kit = stripComments(read("app", "components", "Kit.tsx"));
    expect(kit).toMatch(/mode:\s*"link"/);
    expect(kit).toMatch(/mode:\s*"select"/);
    // Link mode must be a real anchor so the choice survives a refresh, and
    // select mode a button so the dashboard does not throw away its month.
    expect(kit).toMatch(/<Link[\s\S]*?control\.hrefFor/);
    expect(kit).toMatch(/<button[\s\S]*?control\.onSelect/);
  });

  it("gives the server pages links and the client dashboard a callback", () => {
    for (const file of ["app/rso/page.tsx", "app/supervisor/page.tsx", "app/manager/page.tsx"])
      expect(stripComments(read(file)), file).toMatch(/mode:\s*"link"/);
    // /dashboard holds the reporting month in state; a link would discard it.
    expect(stripComments(read("app/dashboard/page.tsx"))).toMatch(/mode:\s*"select"/);
  });
});

describe("the comparison kind is parsed in one place", () => {
  it("accepts only the three real kinds", () => {
    expect(parseComparisonKind("day")).toBe("day");
    expect(parseComparisonKind("week")).toBe("week");
    expect(parseComparisonKind("month")).toBe("month");
  });

  it("falls back to day for anything else", () => {
    // A stale bookmark or a hand-typed URL should show a working daily
    // comparison, not an error page.
    for (const junk of ["", "year", "DAY", "../etc", null, undefined, 7, {}, []])
      expect(parseComparisonKind(junk), String(junk)).toBe("day");
  });

  it("labels every kind it lists", () => {
    expect([...COMPARISON_KINDS]).toEqual(["day", "week", "month"]);
    for (const k of COMPARISON_KINDS) expect(COMPARISON_KIND_LABEL[k]).toBeTruthy();
  });

  it("has no page spelling the check out by hand", () => {
    const offenders = tsxFiles()
      .filter((f) => /compare\s*===\s*"week"/.test(stripComments(fs.readFileSync(f, "utf8"))))
      .map(rel);
    expect(offenders, "use parseComparisonKind").toEqual([]);
  });
});

describe("the dashboard comparison route", () => {
  const route = stripComments(read("app", "api", "dashboard", "comparison", "route.ts"));

  it("is restricted to ADMIN and IT", () => {
    expect(route).toMatch(/apiUser\(\["ADMIN", "IT"\]\)/);
    expect(route).toMatch(/status:\s*401/);
  });

  it("parses its kind through the shared helper", () => {
    expect(route).toMatch(/parseComparisonKind\(req\.nextUrl\.searchParams\.get\("kind"\)\)/);
  });

  it("holds no comparison logic of its own", () => {
    // Everything about anchors, windows and zero-previous stays in lib/, so the
    // dashboard's numbers cannot drift from the role pages'.
    expect(route).toMatch(/performanceComparison\(kind\)/);
    for (const leak of ["windowsFor", "compare(", "getUTCDay", "WEEK_STARTS_ON"]) expect(route).not.toContain(leak);
  });

  it("is never cached", () => {
    // A cached comparison would keep showing yesterday's figures after an
    // upload lands.
    expect(route).toMatch(/no-store/);
    expect(route).toMatch(/dynamic = "force-dynamic"/);
  });
});

describe("the dashboard fetches the comparison independently of its month", () => {
  const page = stripComments(read("app", "dashboard", "page.tsx"));

  it("does not refetch the comparison when the reporting month changes", () => {
    // The comparison is anchored on the latest day each feed HAS, not on the
    // selected month. Adding `month` to this dependency list would issue a
    // pointless request on every month change and change nothing on screen.
    const effect = /useEffect\(\(\) => \{[\s\S]*?comparison\?kind=[\s\S]*?\}, \[([^\]]*)\]\);/.exec(page);
    expect(effect, "the comparison effect was not found").toBeTruthy();
    expect(effect![1].trim()).toBe("compareKind");
  });

  it("aborts its request when the period changes again", () => {
    expect(page).toMatch(/AbortController/);
  });

  it("shows placeholders rather than an empty row while loading", () => {
    expect(page).toMatch(/loading=\{comparisonLoading\}/);
  });
});

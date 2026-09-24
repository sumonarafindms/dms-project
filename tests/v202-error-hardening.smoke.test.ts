/**
 * v202 — "Error check koro and oi gula fix koro".
 *
 * Every API route was fed ~21,000 garbage requests and every page ~13,000
 * hostile URLs (.scratch/fuzz202.ts, deepfuzz202.ts, pagefuzz202.ts). These
 * tests pin the fixes for what that found.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { readJson } from "../lib/request-body";
import { dedupeQuery } from "../lib/query-dedupe";
import { isYm, isYmd, MAX_MONEY } from "../lib/business-time";
import { parseYmd } from "../lib/date-range";
import { monthBounds } from "../lib/month";
import { normalizeMonth } from "../lib/drilldown";
import { bpNameToStore } from "../lib/bp-name";
import { isPerformanceKind } from "../lib/report-builders";

const read = (p: string) => readFileSync(p, "utf8");
const req = (body: string | undefined) =>
  new Request("http://x/api", { method: "POST", body, headers: { "Content-Type": "application/json" } });

describe("a request body that is not an object reads as {} instead of crashing", () => {
  it.each([undefined, "", "not json{", "null", "[]", "[1,2]", "5", '"text"', "true"])("%j", async (body) => {
    expect(await readJson(req(body))).toEqual({});
  });

  it("an object comes through with its fields", async () => {
    expect(await readJson(req('{"a":1,"b":"x"}'))).toEqual({ a: 1, b: "x" });
  });

  it("a __proto__ key stays an ordinary key and pollutes nothing", async () => {
    const b = await readJson(req('{"__proto__":{"polluted":1}}'));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(b)).toBeNull();
  });

  it("no API route parses a body any other way", () => {
    const raw = execSync(`grep -rln "req.json()\\|request.json()" app/api || true`, { encoding: "utf8" }).trim();
    expect(raw, "these still call req.json() directly").toBe("");
  });
});

describe("a repeated query key is sent back with one value", () => {
  it("keeps the first value of each key, in order", () => {
    expect(dedupeQuery(new URLSearchParams("q=a&q=b&month=2026-09"))?.toString()).toBe("q=a&month=2026-09");
  });
  it("leaves a normal query alone", () => {
    expect(dedupeQuery(new URLSearchParams("q=a&month=2026-09"))).toBeNull();
    expect(dedupeQuery(new URLSearchParams(""))).toBeNull();
  });
  it("the middleware uses it for pages", () => {
    const mw = read("middleware.ts");
    expect(mw).toContain("dedupeQuery(req.nextUrl.searchParams)");
    expect(mw.indexOf("dedupeQuery(")).toBeGreaterThan(mw.indexOf('pathname.startsWith("/api/")'));
  });
});

describe("months and days a page can be handed", () => {
  it("a month must be real and in 1900–2999", () => {
    expect(isYm("2026-09")).toBe(true);
    for (const m of ["2026-13", "2026-00", "9999-12", "0001-01", "abc", "", null, 202609])
      expect(isYm(m), String(m)).toBe(false);
  });
  it("a day must be real and in 1900–2999", () => {
    expect(isYmd("2026-09-24")).toBe(true);
    for (const d of ["2026-02-31", "9999-12-31", "2026-13-01", "abc"]) expect(isYmd(d), d).toBe(false);
    expect(parseYmd("9999-12-31")).toBeNull();
    expect(parseYmd("2026-09-01")?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
  it("an impossible month falls back to the current one instead of an Invalid Date", () => {
    for (const m of ["2026-13-01", "abc", "9999-12-01"]) {
      const { start, end } = monthBounds(m);
      expect(Number.isNaN(start.getTime()), m).toBe(false);
      expect(end.getUTCFullYear()).toBeLessThan(3000);
    }
    expect(monthBounds("2026-09-01").start.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
  it("normalizeMonth, behind about thirty pages, refuses 2026-13", () => {
    expect(normalizeMonth("2026-13")).not.toBe("2026-13");
    expect(normalizeMonth("2026-08-15")).toBe("2026-08");
  });
});

describe("keys from a URL name only our own entries", () => {
  it("'constructor' is not a performance report", () => {
    expect(isPerformanceKind("rso")).toBe(true);
    for (const k of ["constructor", "__proto__", "toString", "hasOwnProperty"])
      expect(isPerformanceKind(k), k).toBe(false);
  });
  it("the export and the sample download look up own keys", () => {
    expect(read("lib/report-builders.ts")).toContain("Object.hasOwn(REPORTS, key)");
    expect(read("app/api/samples/[type]/route.ts")).toContain("Object.hasOwn(definitions");
  });
});

describe("only text is a name", () => {
  it("a BP name that is not text is no name", () => {
    expect(bpNameToStore("  Shuvo  ")).toBe("Shuvo");
    for (const v of [true, 0, {}, [], null, undefined]) expect(bpNameToStore(v), JSON.stringify(v)).toBeNull();
  });
  it("employee names are read as text", () => {
    const src = read("app/api/admin/employees/[role]/route.ts");
    expect(src).toContain('const nameOf = (v: unknown) => (typeof v === "string"');
    expect(src).not.toContain("clean(b.name)");
  });
});

describe("money and counts stay inside their columns", () => {
  it("one cap, well inside Decimal(18,2)", () => {
    expect(MAX_MONEY).toBeLessThan(1e16);
  });
  it.each([
    ["app/api/stock/products/route.ts", "MAX_MONEY"],
    ["app/api/stock/expenses/route.ts", "MAX_MONEY"],
    ["app/api/stock/day/route.ts", "MAX_MONEY"],
    ["app/api/stock/lifting/route.ts", "MAX_MONEY"],
    ["app/api/stock/opening/route.ts", "MAX_MONEY"],
    ["app/api/targets/route.ts", "A target is too large"],
    ["app/api/targets/import/route.ts", "A count target is too large"],
  ])("%s checks %s", (file, marker) => {
    expect(read(file)).toContain(marker);
  });
  it("a price or an expense is judged after rounding to paisa", () => {
    expect(read("app/api/stock/products/route.ts")).toMatch(/const p = paisa\(n\);\s*return p > 0/);
    expect(read("app/api/stock/expenses/route.ts")).toContain("!(paisa(amount) > 0)");
  });
});

describe("lists in a body skip what is not an object", () => {
  it.each(["app/api/stock/day/route.ts", "app/api/stock/opening/route.ts"])("%s", (f) => {
    expect(read(f)).toMatch(/filter\(\s*\(l: unknown\) => !!l && typeof l === "object"/);
  });
  it("targets rows go through objects()", () => {
    const src = read("app/api/targets/route.ts");
    expect(src).toContain("const rows = objects(body.rows);");
    expect(src).toContain("const bpRows = objects(body.bpRows);");
  });
});

describe("races and phantoms answer plainly", () => {
  it("deleting a row twice is a 404, not a 500", () => {
    expect(read("app/api/stock/expenses/route.ts")).toContain("prisma.expense.deleteMany({ where: { id } })");
    expect(read("app/api/stock/lifting/route.ts")).toContain("prisma.lifting.deleteMany({ where: { id } })");
  });
  it("two first saves of one day's offer: the second is told, not crashed", () => {
    expect(read("app/api/support/schemes/route.ts")).toContain('code === "P2002"');
  });
  it("resetting permissions of nobody is a 404 and writes no audit line", () => {
    const src = read("app/api/admin/permissions/[id]/route.ts");
    expect(src.indexOf('if (!target) return NextResponse.json({ error: "User not found" }')).toBeLessThan(
      src.indexOf('"RESET_PERMISSIONS"'),
    );
  });
  it("a manager's team refuses supervisors that do not exist", () => {
    expect(read("app/api/admin/manager-team/route.ts")).toContain(
      "prisma.supervisor.count({ where: { id: { in: supervisorIds } } })",
    );
  });
});

describe("a failed expense delete is said out loud", () => {
  it("like Lifting's", () => {
    const src = read("app/components/ExpenseViews.tsx");
    expect(src).toMatch(
      /const r = await apiSend\("\/api\/stock\/expenses", "DELETE", \{ id \}\);[\s\S]{0,60}if \(!r\.ok\) return setError/,
    );
  });
});

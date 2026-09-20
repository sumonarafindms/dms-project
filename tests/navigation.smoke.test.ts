import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

/**
 * Navigation, guarded where it broke.
 *
 * Two defects sit behind this file, both found by clicking rather than by
 * reading:
 *
 *   1. Roughly two in five first taps on a list row did nothing at all. The
 *      router dropped the navigation silently — see `app/components/AppLink.tsx`
 *      for the measurement and what was ruled out. Every internal link now goes
 *      through `AppLink`, which watches the address bar and finishes the job.
 *      One component importing `next/link` directly puts that screen back to
 *      two-in-five, and nothing would say so.
 *
 *   2. `/admin/performance/supervisors/[id]` printed "[object Object]/25" on
 *      every assigned-BP row, because v177 turned `achieved` into a GaTiers
 *      object and this one line kept interpolating it into a string. It read
 *      wrong for two versions with every test green, because no test ever read
 *      the words on the page.
 */

const ROOT = join(__dirname, "..");

function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".scratch") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".tsx") || name.endsWith(".ts")) out.push(full);
  }
  return out;
}

const appFiles = walk(join(ROOT, "app"));
const read = (f: string) => readFileSync(f, "utf8");
const rel = (f: string) => f.slice(ROOT.length + 1);

describe("every internal link is watched", () => {
  it("nothing imports next/link except AppLink itself", () => {
    const offenders = appFiles
      .filter((f) => !f.endsWith(join("components", "AppLink.tsx")))
      .filter((f) => /from ["']next\/link["']/.test(read(f)))
      .map(rel);
    expect(
      offenders,
      `these import next/link directly, so their links are unwatched again: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("AppLink is the only place that renders next/link's Link", () => {
    const src = read(join(ROOT, "app/components/AppLink.tsx"));
    expect(src).toContain('import Link from "next/link"');
    expect(src).toContain("<Link href={href}");
  });

  it("the watchdog asks the router again before it reaches for the browser", () => {
    const src = read(join(ROOT, "app/components/AppLink.tsx"));
    const retry = src.indexOf("RETRY_AFTER_MS = ");
    const hard = src.indexOf("HARD_AFTER_MS = ");
    expect(retry).toBeGreaterThan(-1);
    expect(hard).toBeGreaterThan(-1);
    const retryMs = Number(src.slice(retry).match(/= (\d+)/)![1]);
    const hardMs = Number(src.slice(hard).match(/= (\d+)/)![1]);
    // A soft retry that fires after the hard fallback is a hard reload with
    // extra steps.
    expect(retryMs).toBeLessThan(hardMs);
    // And a watchdog that fires inside a healthy navigation (45-300ms measured)
    // would reload the page under people who did nothing wrong.
    expect(retryMs).toBeGreaterThanOrEqual(600);
  });

  it("a modified click is left to the browser", () => {
    const src = read(join(ROOT, "app/components/AppLink.tsx"));
    for (const key of ["metaKey", "ctrlKey", "shiftKey", "altKey", "defaultPrevented"])
      expect(src, `the watchdog must not follow a ${key} click into this tab`).toContain(key);
  });

  it("only same-origin paths are followed", () => {
    const src = read(join(ROOT, "app/components/AppLink.tsx"));
    expect(src).toContain('target.startsWith("/")');
  });
});

describe("a path that names a real thing resolves to one", () => {
  it("/admin/rsos forwards to the RSO list instead of 404ing", () => {
    /*
     * The RSO DETAIL is at /admin/rsos/[id] and the RSO LIST at
     * /admin/performance/rsos — an asymmetry the v183 navigation map flagged
     * as the most likely place a future "back to the list" link would break.
     */
    const src = readFileSync(join(ROOT, "app/admin/rsos/page.tsx"), "utf8");
    expect(src).toContain("redirect(`/admin/performance/rsos");
    // The period a shared link carries is the reason it was shared.
    expect(src).toContain("q.size ?");
    expect(readFileSync(join(ROOT, "tests/route-map.ts"), "utf8")).toContain('"/admin/rsos": ["ADMIN", "IT"]');
  });

  it("the Accounts directory rows open something", () => {
    /*
     * Every row in that list looked exactly like a clickable row elsewhere in
     * the app and was the only kind that did nothing.
     */
    const src = readFileSync(join(ROOT, "app/accounts/people/page.tsx"), "utf8");
    expect(src, "a BP is an outlet and Accounts has an outlet page").toContain(
      "href={`/accounts/retailers/${x.retailerId}`}",
    );
    expect(src, "an RSO opens their outlets, keyed on the wallet rather than the name").toContain(
      "href={`/accounts/retailers?q=${encodeURIComponent(x.rsoMsisdn)}`}",
    );
    // ...which only works because the wallet is searchable at all.
    expect(readFileSync(join(ROOT, "lib/retailer-search.ts"), "utf8")).toContain("r.employeeMsisdn");
  });
});

describe("no figure is printed as an object", () => {
  /**
   * `achieved` is a GaTiers ({ total, ga170, ga300 }) everywhere BP activation
   * data is read. Interpolating one into a template literal yields "[object
   * Object]", which is what shipped.
   */
  it("nothing interpolates a bare `achieved` into a string", () => {
    const offenders: string[] = [];
    for (const f of appFiles) {
      const src = read(f);
      for (const m of src.matchAll(/\$\{([a-zA-Z_][\w.]*\.)?achieved\}/g)) {
        // `x.achieved.total` is fine; a bare `achieved` is the bug.
        offenders.push(`${rel(f)}: ${m[0]}`);
      }
    }
    expect(offenders, `a GaTiers printed as text: ${offenders.join(", ")}`).toEqual([]);
  });

  it("the supervisor detail BP row prints the total", () => {
    const src = read(join(ROOT, "app/admin/performance/supervisors/[id]/page.tsx"));
    expect(src).toContain("b.achieved.total");
    expect(src).not.toContain("${b.achieved}/");
  });
});

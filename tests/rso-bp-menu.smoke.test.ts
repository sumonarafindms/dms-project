import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { rel as relativeTo } from "./paths";

/**
 * The RSO has ONE Business Partner menu, and tapping a partner opens its record.
 *
 * ## What was wrong
 *
 * The RSO nav carried "My BP" and "BP Activations" side by side, and both
 * opened a list of the same partners — one showing each BP's monthly GA, the
 * other each BP's assignment row. Two menu entries for one question ("how are
 * my BPs doing?") is a decision the reader should not have to make, and on a
 * phone it cost a whole column of a seven-item bottom bar.
 *
 * Worse, neither list led anywhere: the cards on `/rso/bp` were inert, so the
 * day-by-day record — which the detail view had all along — was reachable only
 * through the *other* menu.
 *
 * ## The shape now
 *
 *   /rso/bp        which partners, and how many each has done
 *   /rso/bp/[id]   one partner: how many, and on which days
 *
 * The list is the menu; the card is the link. `/rso/bp/activations` is gone
 * because `/rso/bp` already answered the same question.
 */

const ROOT = path.join(__dirname, "..");
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const SHELL = stripComments(read("app", "components", "AppShell.tsx"));
const LIST = stripComments(read("app", "rso", "bp", "page.tsx"));

/** The RSO role's `nav: [...]` block, sliced out by bracket depth. */
const rsoNav = (() => {
  const at = SHELL.indexOf("rso: {");
  expect(at, "the RSO role config was not found").toBeGreaterThan(-1);
  const navAt = SHELL.indexOf("nav: [", at);
  const open = SHELL.indexOf("[", navAt);
  let depth = 0;
  for (let i = open; i < SHELL.length; i++) {
    if (SHELL[i] === "[") depth++;
    else if (SHELL[i] === "]" && --depth === 0) return SHELL.slice(open, i + 1);
  }
  return "";
})();

describe("one BP menu for the RSO", () => {
  it("sliced out the RSO nav, so the assertions below mean something", () => {
    expect(rsoNav).toMatch(/href: "\/rso"/);
    expect(rsoNav.length).toBeGreaterThan(100);
  });

  it("has exactly one entry under /rso/bp", () => {
    const bpEntries = [...rsoNav.matchAll(/href: "(\/rso\/bp[^"]*)"/g)].map((m) => m[1]);
    expect(bpEntries).toEqual(["/rso/bp"]);
  });

  it("no longer routes anywhere through /rso/bp/activations", () => {
    // The whole app, not just the nav: a link left behind would 404.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        // This file names the dead route in its own assertions, so it has to
        // exempt itself or the guard reports the guard.
        else if (
          /\.tsx?$/.test(e.name) &&
          full !== __filename &&
          stripComments(fs.readFileSync(full, "utf8")).includes("/rso/bp/activations")
        )
          offenders.push(relativeTo(ROOT)(full));
      }
    };
    for (const d of ["app", "lib", "tests", "e2e"]) walk(path.join(ROOT, d));
    expect(offenders, "these still point at the removed route").toEqual([]);
  });

  it("removed the route itself, not just the link", () => {
    // A page nobody links to is a page nobody maintains, and it was a duplicate
    // of /rso/bp — the thing that made two menus necessary in the first place.
    expect(fs.existsSync(path.join(ROOT, "app/rso/bp/activations"))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, "app/rso/bp/[id]/page.tsx"))).toBe(true);
  });
});

describe("My BP answers both halves of the question", () => {
  it("shows how many each partner has done", () => {
    // The monthly figure per BP, from the one grouped query.
    expect(LIST).toMatch(/standardGaByAssignment\(active,/);
    expect(LIST).toMatch(/<MetricBar label="Monthly GA"/);
  });

  it("makes every card open that partner's own record", () => {
    /*
     * The card is the link. Inert cards are why the day-by-day record needed a
     * second menu entry to reach at all.
     */
    expect(LIST).toMatch(/href=\{`\/rso\/bp\/\$\{a\.id\}\?month=/);
    expect(LIST).toMatch(/is-clickable/);
    // An icon tile pointing at a separate list is the pattern being replaced.
    expect(LIST).not.toMatch(/View BP Activation Details/);
  });

  it("carries the period through to the detail", () => {
    // Opening a BP must not silently reset the month the reader was looking at.
    expect(LIST).toMatch(/\?month=\$\{dhakaMonth\(\)\}/);
  });

  it("names the destination for a screen reader", () => {
    // The card's visible text is the BP's name and numbers; "daily activation
    // record" is what the link actually does.
    //
    // v181: the name comes from `bpDisplayName`, the one rule for what a BP is
    // called — so the label a screen reader hears is the same name the sighted
    // reader sees, wherever that name was set.
    expect(LIST).toMatch(/aria-label=\{`\$\{bpDisplayName\(a\.retailer\)\}/);
    expect(LIST).toMatch(/import \{ bpDisplayName \}/);
  });
});

describe("the detail is one partner, day by day", () => {
  const DETAIL = stripComments(read("app", "components", "BpActivationViews.tsx"));

  it("lists a row per day with its count", () => {
    /*
     * This is "কবে কতটা" — the owner's actual question. The data was already
     * being fetched; make sure it is still rendered and not reduced to a
     * headline count, which is what `d.daily.length` alone would be.
     */
    expect(DETAIL).toMatch(/<SectionHead title="Daily GA"/);
    expect(DETAIL).toMatch(/d\.daily\.map\(/);
    expect(DETAIL).toMatch(/value=\{x\.count\}/);
  });

  it("goes back to My BP", () => {
    expect(stripComments(read("app", "rso", "bp", "[id]", "page.tsx"))).toMatch(/backHref="\/rso\/bp"/);
  });

  it("stays scoped to the signed-in RSO", () => {
    // The route is reachable by id, so access is decided by `user`, not by the
    // link that got you there — assignmentAccessWhere handles that in lib.
    const page = stripComments(read("app", "rso", "bp", "[id]", "page.tsx"));
    expect(page).toMatch(/requirePagePermission\(\["RSO"\], "bp"\)/);
    expect(page).toMatch(/user=\{u\}/);
  });
});

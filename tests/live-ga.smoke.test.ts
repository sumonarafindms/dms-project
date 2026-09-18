import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { dhakaToday, gaDayBounds } from "../lib/live-ga";
import { initialsOf } from "../app/components/Kit";

/**
 * Today's GA, and the ways a "live" screen can quietly lie.
 *
 * ## What Live GA promises
 *
 * One day — today, in Dhaka — for whoever is signed in, at their own level.
 * The owner set three rules that matter more than the layout:
 *
 * 1. **If nothing has happened, the answer is 0.** Not yesterday's number, not
 *    "the last day with data". A screen that silently falls back to another day
 *    is worse than an empty one, because it looks like today.
 * 2. **Standard GA only.** SIM swaps are replacements and are excluded, exactly
 *    as they are from Total GA everywhere else.
 * 3. **Say when the file was last uploaded.** A number with no "as of" invites
 *    the reader to assume it is current, and on the day nobody uploads, that
 *    assumption is wrong.
 *
 * The database-backed behaviour is proved separately against real rows (see the
 * run recorded in the version note). What is held here is the day arithmetic —
 * where an off-by-one is invisible until month end — and the rules the page
 * must keep.
 */

const ROOT = path.join(__dirname, "..");
const codeOf = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");

describe("which rows count as today", () => {
  it("covers exactly one day, from midnight to midnight", () => {
    const { start, end } = gaDayBounds("2026-09-07");
    expect(start.toISOString()).toBe("2026-09-07T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-08T00:00:00.000Z");
    expect(end.getTime() - start.getTime()).toBe(86_400_000);
  });

  it("does not shift the stored date by the Dhaka offset a second time", () => {
    /*
     * The off-by-one this guards.
     *
     * The GA importer stores `activationDate` as UTC midnight of the date
     * PRINTED in the file (`dateOnlyUtc`) — it is a date, not an instant.
     * Subtracting six hours to "convert to Dhaka" would make the window start
     * at 18:00 the previous day and end at 18:00 today, so every morning the
     * screen would show yesterday's activations and drop the late ones. It is
     * invisible until somebody adds the month up.
     */
    const { start } = gaDayBounds("2026-09-07");
    expect(start.getUTCHours(), "the day window was shifted into the previous evening").toBe(0);
    expect(start.getUTCDate()).toBe(7);
  });

  it("rolls over at midnight Dhaka, not midnight UTC", () => {
    // 18:30 UTC on the 6th is already 00:30 on the 7th in Dhaka.
    expect(dhakaToday(new Date("2026-09-06T18:30:00.000Z"))).toBe("2026-09-07");
    // …and 17:30 UTC is still the 6th there.
    expect(dhakaToday(new Date("2026-09-06T17:30:00.000Z"))).toBe("2026-09-06");
    expect(dhakaToday(new Date("2026-09-07T05:00:00.000Z"))).toBe("2026-09-07");
  });

  it("handles the end of a month and a year", () => {
    expect(dhakaToday(new Date("2026-08-31T18:30:00.000Z"))).toBe("2026-09-01");
    expect(dhakaToday(new Date("2026-12-31T18:30:00.000Z"))).toBe("2027-01-01");
    expect(gaDayBounds("2026-12-31").end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("the rules the screen must keep", () => {
  it("counts standard GA only, never swaps", () => {
    /*
     * `withStandardGa` is the app's single definition of what counts (v157,
     * v99). Any hand-written product filter here would be a second answer to a
     * question that already has one, and the two would drift.
     */
    const src = codeOf(read("lib", "live-ga.ts"));
    expect(src).toMatch(/withStandardGa\(/);
    expect(src, "Live GA filters products on its own instead of using the shared rule").not.toMatch(
      /productCode:\s*\{?\s*(in|equals)/,
    );
    expect(src).not.toMatch(/SIMWAP|EV-SWAP/);
  });

  it("never falls back to another day when today is empty", () => {
    /*
     * The rule the owner was most explicit about. A `findFirst` ordered by
     * activationDate to "find the latest day with data" is the shape this must
     * never take.
     */
    const lib = codeOf(read("lib", "live-ga.ts"));
    const page = codeOf(read("app", "live-ga", "page.tsx"));
    for (const [name, src] of [
      ["lib/live-ga.ts", lib],
      ["app/live-ga/page.tsx", page],
    ] as const)
      expect(src, `${name} looks for the latest day with data instead of using today`).not.toMatch(
        /orderBy:\s*\{\s*activationDate/,
      );
    // And the page's date is today unless one is explicitly asked for.
    expect(page).toMatch(/const today = dhakaToday\(\)/);
    expect(page).toMatch(/sp\.date!?\s*:\s*today/);
  });

  it("shows when the data was last refreshed — the time, and only the time", () => {
    const lib = codeOf(read("lib", "live-ga.ts"));
    expect(lib).toMatch(/ImportType\.GA/);
    expect(lib).toMatch(/orderBy:\s*\{\s*uploadedAt:\s*"desc"/);

    const page = codeOf(read("app", "live-ga", "page.tsx"));
    expect(page).toMatch(/Updated \{updated\}/);
    // In Dhaka time, so every role reads the same clock.
    expect(page).toMatch(/timeZone:\s*"Asia\/Dhaka"/);
    // And it says so plainly when there is no upload at all to report.
    expect(page).toMatch(/No GA file has been uploaded yet/);

    /*
     * The file name is gone, and stays gone.
     *
     * It used to sit under the timestamp — "ActivationDetailsReport (3).xlsx" —
     * answering a question nobody asked while crowding the half that matters.
     * The strongest way to hold that is for the name never to leave the
     * database: `lastGaUpload` selects the time alone, so there is nothing for
     * a later edit to put back on screen by accident.
     */
    expect(lib, "the upload's file name is being read again").not.toMatch(/fileName/);
    expect(page).not.toMatch(/fileName/);
  });

  it("counts in grouped queries, not one per row", () => {
    /*
     * This screen fans out over supervisors → RSOs → retailers. A count query
     * per row is the defect this project has fixed twice already (v120's BP
     * list, v163's monthly summaries), and it is easiest to reintroduce
     * exactly here.
     */
    const src = codeOf(read("lib", "live-ga.ts"));
    expect(src).toMatch(/groupBy\(/);
    expect(src, "Live GA counts with a query per row").not.toMatch(/gaActivation\.count\(/);
    /*
     * The danger is a fan-out — one query per row — not concurrency. This used
     * to ban `Promise.all(` outright, which is too blunt: v177 pairs the day's
     * single `groupBy` with the cached tariff lookup, two fixed queries that do
     * not grow with the list, and the blanket ban failed on it.
     *
     * What actually reintroduces the defect is awaiting a MAPPED array, so
     * that is what is banned now. The two assertions above still hold the
     * main line.
     */
    expect(src, "Live GA awaits a mapped array — that is one query per row").not.toMatch(
      /Promise\.all\(\s*[\w.]*\.map\(/,
    );
  });
});

describe("who sees what", () => {
  const lib = codeOf(read("lib", "live-ga.ts"));

  it("scopes every role to its own people", () => {
    // A live screen that leaked another supervisor's team would be a
    // permissions bug wearing a dashboard.
    expect(lib).toMatch(/role === "BP"[\s\S]{0,200}bpRetailerId/);
    expect(lib).toMatch(/role === "RSO"[\s\S]{0,200}employeeId/);
    expect(lib).toMatch(/role === "SUPERVISOR"[\s\S]{0,240}supervisorId/);
    // A manager sees only the supervisors assigned to them.
    expect(lib).toMatch(/role === "MANAGER"[\s\S]{0,120}managerScope\(/);
  });

  it("gives a role with no linked record nothing rather than everything", () => {
    /*
     * An RSO login whose `employeeId` is null must not fall through to an
     * unfiltered query. `{ employeeId: null }` in Prisma means "retailers with
     * no RSO", and `{}` means everyone — both are wrong, and the second is a
     * leak.
     */
    // `total` is a zeroed tier triple since v177, not a bare 0 — the property
    // guarded is the early return, not how "nothing" is spelled.
    const nothing = String.raw`return \{ \.\.\.base, total: (0|noTiers\(\))`;
    expect(lib).toMatch(new RegExp(String.raw`if \(!employeeId\) ` + nothing));
    expect(lib).toMatch(new RegExp(String.raw`if \(!viewer\.bpRetailerId\) ` + nothing));
    expect(lib).toMatch(new RegExp(String.raw`if \(!supervisorId\) ` + nothing));
  });

  it("does not add BP totals on top of RSO totals", () => {
    /*
     * A BP's retailer is one of its RSO's retailers, so a headline of
     * "RSO total + BP total" counts the same activation twice. The BP list is
     * a breakdown inside the number, not an addition to it — and a double
     * count is the kind of error that only surfaces when a target looks met.
     */
    // The headline is built from the RSO rows ALONE. `sumRows` replaced the
    // inline reduce in v177; either spelling is fine, taking `bps` in is not.
    expect(lib).toMatch(/total: (sumRows\(rsoRows\)|rsoRows\.reduce)/);
    expect(lib, "the team headline adds the BP rows to the RSO rows").not.toMatch(
      /total:\s*(sumRows\(rsoRows[\s\S]{0,60}bps|rsoRows\.reduce[\s\S]{0,120}\+\s*bps\.)/,
    );
  });
});

describe("the menu entry", () => {
  const shell = read("app", "components", "AppShell.tsx");

  it("is in every role's navigation", () => {
    /*
     * "Every role" was the request, and a role whose menu lacks it can only
     * reach the page by typing the URL. Counted rather than eyeballed: admin,
     * manager, supervisor, accounts, rso, bp — IT shares the admin list.
     */
    const entries = [...shell.matchAll(/href: "\/live-ga"/g)].length;
    expect(entries, `only ${entries} role menus have Live GA`).toBeGreaterThanOrEqual(6);
    for (const anchor of ['"/manager"', '"/supervisor"', '"/accounts"', '"/rso"', '"/bp"']) {
      const i = shell.indexOf(`href: ${anchor},`);
      expect(i, `no nav block found for ${anchor}`).toBeGreaterThan(0);
      expect(shell.slice(i, i + 260), `${anchor}'s menu has no Live GA`).toMatch(/live-ga/);
    }
  });

  it("puts the dot in the bottom bar too, where a phone actually looks", () => {
    /*
     * Caught in the browser, not here: at 390px the sidebar is `display: none`,
     * so the bottom bar is the only navigation a field user has. The first
     * version rendered the dot only in `NavLink`, which meant the RSO and BP —
     * the people the indicator is for — never saw it.
     */
    const bar = shell.slice(shell.indexOf("bottom-link"));
    expect(bar, "the bottom bar has no live indicator").toMatch(/i\.live \?[\s\S]{0,160}nav-live-dot/);
  });

  it("carries the live indicator, and only it does", () => {
    expect(shell).toMatch(/live: true/);
    expect(shell).toMatch(/nav-live-dot/);
    // Every `live: true` belongs to a Live GA entry — the dot must not spread.
    const liveLines = shell.split("\n").filter((l) => /live: true/.test(l));
    expect(liveLines.length).toBeGreaterThanOrEqual(6);
    for (const l of liveLines) expect(l).toMatch(/\/live-ga/);
  });

  it("stops animating when the reader asks for less motion", () => {
    /*
     * A dot that pulses forever is a problem for anyone with vestibular
     * sensitivity, and this app already honours the preference elsewhere.
     */
    const css = fs.readFileSync(path.join(ROOT, "styles", "kit.css"), "utf8");

    /*
     * Each reduced-motion block is read on its own, not with one regex over the
     * whole file.
     *
     * My first version used `@media (prefers-reduced-motion: reduce) {[\s\S]*?
     * nav-live-dot[\s\S]*?animation: none`, which passed with `.nav-live-dot`
     * deleted from the block — `[\s\S]*?` walks straight past the closing brace
     * and finds the selector somewhere else in the file. A guard that matches
     * across the thing it is supposed to be looking inside is not a guard.
     */
    const blocks: string[] = [];
    for (let i = css.indexOf("@media (prefers-reduced-motion: reduce)"); i !== -1;) {
      let depth = 0;
      let j = css.indexOf("{", i);
      const from = j;
      for (; j < css.length; j++) {
        if (css[j] === "{") depth++;
        else if (css[j] === "}" && --depth === 0) break;
      }
      blocks.push(css.slice(from, j));
      i = css.indexOf("@media (prefers-reduced-motion: reduce)", j);
    }
    expect(blocks.length, "no reduced-motion block found at all").toBeGreaterThan(0);

    for (const dot of [".live-dot", ".nav-live-dot"])
      expect(
        blocks.some((b) => b.includes(dot) && /animation:\s*none/.test(b)),
        `${dot} still animates when the reader has asked for reduced motion`,
      ).toBe(true);
  });
});

describe("small wording and initials details", () => {
  it("does not say 'today' twice in the headline", async () => {
    /*
     * The label under the number already reads "GA today", so a scope of
     * "Everyone today" produced "GA TODAY · EVERYONE TODAY". Caught by looking
     * at the rendered page rather than the code.
     */
    const lib = read("lib", "live-ga.ts");
    const scopes = [...lib.matchAll(/scope: "([^"]+)"/g)].map((m) => m[1]);
    expect(scopes.length).toBeGreaterThan(3);
    for (const s of scopes) expect(s.toLowerCase(), `scope "${s}" repeats "today"`).not.toContain("today");
    // The label that carries the word is still there, once.
    expect(read("app", "live-ga", "page.tsx")).toMatch(/GA today · \{live\.scope\}/);
  });

  it("builds initials from words, not from the first two characters", () => {
    /*
     * `name.slice(0, 2)` gave "Md Mashiujjaman shuvo" and "MD SHAHIN RAHMAN
     * KHAN" the same "MD" — two supervisors, one avatar — and turned
     * "R.R Enterprise- BP 01" into "R.", a full stop in a circle.
     */
    expect(initialsOf("Md Mashiujjaman shuvo")).toBe("MM");
    expect(initialsOf("MD SHAHIN RAHMAN KHAN")).toBe("MS");
    /*
     * "R.R Enterprise" gives "RR", not "RE": splitting on punctuation makes
     * "R" and "R" the first two words, which is the distributor's own initials
     * and reads correctly. My first expectation here was "RE" — the code was
     * right and the test was guessing. What matters is only that the full stop
     * never becomes the avatar.
     */
    expect(initialsOf("R.R Enterprise- BP 01")).toBe("RR");
    expect(initialsOf("R.R Enterprise- BP 01"), "punctuation became the initial").not.toMatch(/[^A-Z0-9]/);
    expect(initialsOf("PHOTO COLY TELECOM CENTER")).toBe("PC");
    // A single word still has to produce something.
    expect(initialsOf("Shuvo")).toBe("SH");
    expect(initialsOf("X")).toBe("X");
    // And nothing at all must not crash a whole list.
    expect(initialsOf("")).toBe("?");
    expect(initialsOf("—")).toBe("?");
  });
});

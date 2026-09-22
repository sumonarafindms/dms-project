import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  dailyFeedItems,
  dailyFeedNote,
  daysBetweenYmd,
  feedDay,
  feedDayLabel,
  feedDayTone,
  shortDay,
  stalenessNote,
} from "../lib/feed-day";
import type { FeedDay } from "../lib/feed-day";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
/** Comments are stripped before matching: a guard must not be satisfied by prose. */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const LAST_DUE = "2026-09-14";

describe("a daily figure knows which day it is from", () => {
  it("is current when it is as new as the data can be", () => {
    const d = feedDay(LAST_DUE, 42, LAST_DUE);
    expect(d.freshness).toBe("current");
    expect(d.daysBehind).toBe(0);
    expect(d.value).toBe(42);
  });

  it("is current when the file arrived on the day it covers", () => {
    // Uploading today's file today is allowed and is not worth a warning.
    expect(feedDay("2026-09-15", 1, LAST_DUE).freshness).toBe("current");
  });

  it("counts whole days behind", () => {
    const d = feedDay("2026-09-11", 0, LAST_DUE);
    expect(d.freshness).toBe("behind");
    expect(d.daysBehind).toBe(3);
  });

  it("keeps a zero rather than inventing a day for it", () => {
    /*
     * The whole point. The old snapshot anchored on the newest day the VIEWER
     * had rows for, so it could never return a zero — there was no row to read
     * the date from, and the number shown was always the last good day.
     */
    const d = feedDay(LAST_DUE, 0, LAST_DUE);
    expect(d.value).toBe(0);
    expect(d.date).toBe(LAST_DUE);
    expect(d.freshness).toBe("current");
  });

  it("says so when a feed has never been imported", () => {
    const d = feedDay(null, 0, LAST_DUE);
    expect(d.freshness).toBe("none");
    expect(d.date).toBeNull();
  });

  it("measures days across a month boundary", () => {
    expect(daysBetweenYmd("2026-08-30", "2026-09-02")).toBe(3);
    expect(daysBetweenYmd("2026-09-02", "2026-08-30")).toBe(-3);
  });
});

describe("the label names the day, never 'latest'", () => {
  it("prints the day beside the feed", () => {
    expect(feedDayLabel("GA", feedDay(LAST_DUE, 9, LAST_DUE))).toBe("GA · 14 Sep");
  });

  it("does not claim a day it does not have", () => {
    expect(feedDayLabel("GA", feedDay(null, 0, LAST_DUE))).toBe("GA · no data");
  });

  it("formats the day without a clock", () => {
    /*
     * A business day is a DATE — the importer stores it as UTC midnight of the
     * date printed in the file. Formatting it through a time zone is how this
     * project has twice produced an off-by-one, so `shortDay` reads the string.
     * Asserted at both ends of a day for a value that would shift under any
     * negative offset.
     */
    expect(shortDay("2026-01-01")).toBe("1 Jan");
    expect(shortDay("2026-12-31")).toBe("31 Dec");
    expect(shortDay("2026-09-14")).toBe("14 Sep");
  });

  it("goes amber the moment a figure is stale", () => {
    expect(feedDayTone(feedDay(LAST_DUE, 1, LAST_DUE))).toBe("brand");
    expect(feedDayTone(feedDay("2026-09-10", 1, LAST_DUE))).toBe("amber");
    expect(feedDayTone(feedDay(null, 0, LAST_DUE))).toBe("amber");
  });
});

describe("the warning line", () => {
  const snap = (ga: string | null, c2c: string | null) => ({
    ga: feedDay(ga, 1, LAST_DUE),
    c2c: feedDay(c2c, 1, LAST_DUE),
  });

  it("stays quiet when every feed is current", () => {
    expect(dailyFeedNote(snap(LAST_DUE, LAST_DUE))).toBeNull();
  });

  it("names each late feed and how late it is", () => {
    const note = dailyFeedNote(snap("2026-09-13", "2026-09-04"));
    expect(note).toContain("GA is 1 day behind");
    expect(note).toContain("C2C is 10 days behind");
  });

  it("distinguishes never-imported from late", () => {
    expect(dailyFeedNote(snap(LAST_DUE, null))).toContain("C2C has never been imported");
  });

  it("only speaks for the feeds it was given", () => {
    // The manager home shows GA alone; a C2C warning there would be about a
    // tile that is not on the screen.
    const note = dailyFeedNote(snap(LAST_DUE, "2026-09-01"), ["ga"]);
    expect(note).toBeNull();
  });

  it("counts one day as a day", () => {
    const one: FeedDay = feedDay("2026-09-13", 0, LAST_DUE);
    expect(stalenessNote([{ label: "GA", day: one }])).toContain("1 day behind");
    expect(stalenessNote([{ label: "GA", day: one }])).not.toContain("1 days");
  });
});

describe("the tiles the role homes actually render", () => {
  it("labels GA with its day and C2C with its own", () => {
    const items = dailyFeedItems({
      ga: feedDay("2026-09-14", 1234, LAST_DUE),
      c2c: feedDay("2026-09-12", 5678, LAST_DUE),
    });
    expect(items[0].label).toBe("GA · 14 Sep");
    expect(items[1].label).toBe("C2C · 12 Sep");
  });

  it("writes money as money and counts as counts", () => {
    const items = dailyFeedItems({ ga: feedDay(LAST_DUE, 1234, LAST_DUE), c2c: feedDay(LAST_DUE, 5678, LAST_DUE) });
    expect(items[0].value).toBe("1,234");
    expect(items[1].value).toBe("৳5,678");
  });
});

describe("the anchor is the feed's, not the viewer's", () => {
  const src = code("lib/intelligence.ts");

  it("resolves the day with no scope filter on it", () => {
    /*
     * This is the bug, in one line. `latestGaDay` must NOT take the employee
     * scope: the moment it does, an RSO with no sales yesterday is shown their
     * last good day again, under whatever date that was.
     */
    const fn = src.slice(src.indexOf("export async function latestGaDay"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toContain("withStandardGa()");
    expect(body).not.toContain("employeeId");
    expect(body).not.toContain("scope");
  });

  it("counts the scope inside the day the feed chose", () => {
    const fn = src.slice(src.indexOf("export async function latestDailySnapshot"));
    expect(fn).toContain("latestGaDay()");
    expect(fn).toMatch(/gaScope[\s\S]{0,200}activationDate: dayRange\(gaYmd\)/);
  });

  it("measures 'behind' against yesterday, like the readiness grid", () => {
    // Against today, every screen would warn every morning before the upload.
    expect(src).toContain("dhakaYesterdayYmd(now)");
    expect(code("lib/readiness-data.ts")).toContain("dhakaYesterdayYmd(now)");
  });
});

describe("no screen says 'Latest GA' any more", () => {
  const ROLE_HOMES = [
    "app/rso/page.tsx",
    "app/supervisor/page.tsx",
    "app/manager/page.tsx",
    "app/accounts/page.tsx",
    "app/bp/page.tsx",
  ];

  it("has removed the word that made the claim", () => {
    /*
     * "Latest" asserted currency the figure could not back up. Every one of
     * these tiles now carries a date instead, and this fails if the old label
     * is typed back on any of the five.
     */
    for (const p of ROLE_HOMES) {
      expect(read(p), `${p} still labels a tile "Latest …"`).not.toMatch(/label: "Latest /);
    }
  });

  it("builds its tiles from the shared helper", () => {
    /*
     * Accounts is excluded since v197: its home no longer shows company feed
     * tiles at all. Feeds are IT's; Accounts' home is stock and money.
     */
    for (const p of ROLE_HOMES.filter((p) => p !== "app/bp/page.tsx" && p !== "app/accounts/page.tsx")) {
      expect(code(p), `${p} hand-rolls its daily tiles`).toContain("dailyFeedItems(");
    }
  });

  it("shows the staleness note wherever it shows the tiles", () => {
    // A date on a tile is easy to skim past on a phone; the amber line is not.
    for (const p of ROLE_HOMES) {
      if (p === "app/accounts/page.tsx") continue; // has its own per-feed freshness cards
      expect(code(p), `${p} shows a daily figure with no staleness warning`).toContain("<FeedNote");
    }
  });

  it("does not compute today's activations on the BP home", () => {
    /*
     * The feeds are uploaded for the PREVIOUS day, so a "today" count is zero
     * for most of every working day and says nothing about why.
     */
    const bp = code("app/bp/page.tsx");
    expect(bp).not.toContain("dhakaTodayYmd");
    expect(bp).toContain("latestGaDay()");
  });
});

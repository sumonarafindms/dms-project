import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  DAY_STATE_LABEL,
  DAY_STATE_RANK,
  classifyDay,
  coverageLabel,
  dayStateTone,
  daysInRange,
  readinessWarning,
  summariseFeed,
  worstState,
  type DayReadiness,
  type DayState,
} from "../lib/readiness";

/**
 * Readiness is a per-day question.
 *
 * The version this replaces asked whether ONE completed batch of each feed had
 * a business date anywhere in the selected range. For the default range —
 * yesterday — that is right. For a month it is close to meaningless: one GA
 * import on the 3rd painted the whole of August "Ready", in green, above totals
 * that were missing thirty days of activations.
 *
 * That is the failure this suite exists to prevent coming back, so the central
 * assertion is not about any single day: it is that one good day in a long
 * range NEVER reads as ready.
 */

const ROOT = path.join(__dirname, "..");
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");

const day = (date: string, state: DayState, rows = 0, batch = false): DayReadiness => ({ date, state, rows, batch });

describe("day classification", () => {
  const LAST_DUE = "2026-08-30";

  it("calls a day imported only when a batch AND rows agree", () => {
    expect(classifyDay("2026-08-20", { rows: 500, batch: true, failed: false }, LAST_DUE)).toBe("imported");
  });

  it("distinguishes an empty file from a missing upload", () => {
    // Both have zero rows, and they need completely different fixes: one is
    // "chase the person who never uploaded", the other is "the file you
    // uploaded contained nothing". The Upload Center shows the second as a
    // success, which is exactly why it needs saying here.
    expect(classifyDay("2026-08-20", { rows: 0, batch: true, failed: false }, LAST_DUE)).toBe("empty");
    expect(classifyDay("2026-08-20", { rows: 0, batch: false, failed: false }, LAST_DUE)).toBe("missing");
  });

  it("flags rows that arrived without a recorded import", () => {
    expect(classifyDay("2026-08-20", { rows: 12, batch: false, failed: false }, LAST_DUE)).toBe("unrecorded");
  });

  it("reports a failed import even when it wrote some rows", () => {
    // A partial write is the worst case to call "Imported": the rows are there,
    // so nothing looks wrong, and the totals are quietly short.
    expect(classifyDay("2026-08-20", { rows: 400, batch: true, failed: true }, LAST_DUE)).toBe("failed");
  });

  it("never marks a day that is not due yet", () => {
    // The feeds are uploaded for the PREVIOUS day, so today is never expected.
    // Painting it red every morning would train people to ignore the grid.
    expect(classifyDay("2026-08-31", { rows: 0, batch: false, failed: false }, LAST_DUE)).toBe("not-due");
    expect(classifyDay("2026-09-15", { rows: 0, batch: false, failed: false }, LAST_DUE)).toBe("not-due");
    // The last due day itself IS due.
    expect(classifyDay(LAST_DUE, { rows: 0, batch: false, failed: false }, LAST_DUE)).toBe("missing");
  });

  it("labels and tones every state it can produce", () => {
    const states: DayState[] = ["imported", "unrecorded", "empty", "failed", "missing", "not-due"];
    for (const s of states) {
      expect(DAY_STATE_LABEL[s], s).toBeTruthy();
      expect(DAY_STATE_RANK[s], s).toBeTypeOf("number");
      // Only tones the kit's badges already own — no fifth palette for the
      // same four meanings.
      expect(["complete", "pending", "failed", "inactive"]).toContain(dayStateTone(s));
    }
  });
});

describe("range enumeration", () => {
  it("includes both ends", () => {
    expect(daysInRange("2026-08-28", "2026-08-31")).toEqual(["2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31"]);
  });

  it("handles a single day and a month boundary", () => {
    expect(daysInRange("2026-08-31", "2026-08-31")).toEqual(["2026-08-31"]);
    expect(daysInRange("2026-07-31", "2026-08-01")).toEqual(["2026-07-31", "2026-08-01"]);
  });

  it("crosses a leap day without dropping it", () => {
    expect(daysInRange("2028-02-28", "2028-03-01")).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
  });
});

describe("one good day in a long range is not ready", () => {
  // THE regression. This is the bug that was shipped.
  const days = daysInRange("2026-08-01", "2026-08-31").map((d) =>
    d === "2026-08-03" ? day(d, "imported", 900, true) : day(d, "missing"),
  );
  const feed = summariseFeed("GA", days);

  it("counts coverage honestly", () => {
    expect(feed.covered).toBe(1);
    expect(feed.due).toBe(31);
    expect(feed.coveragePercent).toBe(3);
    expect(coverageLabel(feed)).toBe("1 of 31 days");
  });

  it("does not report the feed as imported", () => {
    expect(worstState(feed)).not.toBe("imported");
    expect(worstState(feed)).toBe("missing");
  });

  it("warns, naming the feed and the number of days", () => {
    const warning = readinessWarning([feed]);
    expect(warning).toContain("GA Activation");
    expect(warning).toContain("30 days");
  });
});

describe("feed summary", () => {
  it("is only imported when every due day is", () => {
    const clean = summariseFeed(
      "C2C",
      daysInRange("2026-08-01", "2026-08-07").map((d) => day(d, "imported", 10, true)),
    );
    expect(worstState(clean)).toBe("imported");
    expect(clean.coveragePercent).toBe(100);
    expect(readinessWarning([clean])).toBeNull();
  });

  it("excludes not-due days from the denominator", () => {
    // A range running into the future must not read as failing.
    const days = [day("2026-08-29", "imported", 5, true), day("2026-08-30", "not-due"), day("2026-08-31", "not-due")];
    const feed = summariseFeed("OB", days);
    expect(feed.due).toBe(1);
    expect(feed.coveragePercent).toBe(100);
    expect(readinessWarning([feed])).toBeNull();
  });

  it("treats a range entirely in the future as complete, not as zero", () => {
    const feed = summariseFeed("OB", [day("2026-09-01", "not-due"), day("2026-09-02", "not-due")]);
    expect(feed.coveragePercent).toBe(100);
    expect(coverageLabel(feed)).toBe("Not due yet");
    expect(worstState(feed)).toBe("not-due");
  });

  it("puts the worst problems first", () => {
    const feed = summariseFeed("C2S", [
      day("2026-08-01", "missing"),
      day("2026-08-02", "failed", 3, true),
      day("2026-08-03", "empty", 0, true),
      day("2026-08-04", "imported", 90, true),
    ]);
    expect(feed.problems.map((d) => d.state)).toEqual(["failed", "empty", "missing"]);
    expect(worstState(feed)).toBe("failed");
  });

  it("does not list a merely unrecorded day as a problem to fix", () => {
    // The data is present, so the reports are correct. It is a provenance
    // question, not a missing-data one, and listing it beside genuine gaps
    // would dilute the list people are meant to act on.
    const feed = summariseFeed("GA", [day("2026-08-01", "unrecorded", 40, false)]);
    expect(feed.problems).toEqual([]);
    expect(feed.covered).toBe(0);
  });
});

describe("the queries stay constant-cost", () => {
  const data = read("lib", "readiness-data.ts");

  it("groups by date rather than looping over days", () => {
    // One query per feed per source, whatever the range. A loop over the days
    // would be 4 × 90 round trips for a quarter.
    expect(data).toMatch(/groupBy/);
    expect(data).not.toMatch(/for\s*\(.*daysInRange/);
    expect(data).not.toMatch(/dates\.map\(async/);
  });

  it("anchors on yesterday, because the feeds arrive a day late", () => {
    expect(data).toMatch(/dhakaYesterdayYmd\(now\)/);
  });

  it("keeps a failed day failed only when nothing succeeded for it", () => {
    // A failed attempt followed by a good re-upload is a fixed day.
    expect(data).toMatch(/for \(const day of present\) failed\.delete\(day\);/);
  });
});

describe("the rules module stays Prisma-free", () => {
  it("has no database import", () => {
    // Same rule as achievement.ts, pacing.ts and comparison.ts — it is what
    // lets a client component use these labels without shipping Prisma.
    const rules = read("lib", "readiness.ts");
    expect(rules).not.toMatch(/from "\.\/prisma"/);
    expect(rules).not.toMatch(/@prisma\/client/);
  });
});

describe("the old range-wide readiness is gone", () => {
  it("is no longer defined in report-data.ts", () => {
    expect(read("lib", "report-data.ts")).not.toMatch(/export async function dataReadiness\b/);
  });

  it("has no page still rendering a bare Ready/Missing verdict for a range", () => {
    const reports = read("app", "it", "reports", "page.tsx");
    expect(reports).not.toMatch(/f\.ready \? "Ready" : "Missing"/);
    // It shows real coverage and points at the day-by-day view instead.
    expect(reports).toMatch(/coverageLabel\(f\)/);
    expect(reports).toMatch(/\/it\/readiness/);
  });
});

import { describe, expect, it } from "vitest";
import {
  WEEK_STARTS_ON,
  changeLabel,
  changeTone,
  compare,
  dayWindows,
  endExclusive,
  monthWindows,
  weekStart,
  weekWindows,
  windowsFor,
} from "../lib/comparison";

describe("percent change", () => {
  it("reports a rise and a fall", () => {
    const up = compare(120, 100);
    expect(up.difference).toBe(20);
    expect(up.percentChange).toBe(20);
    expect(up.direction).toBe("up");

    const down = compare(80, 100);
    expect(down.difference).toBe(-20);
    expect(down.percentChange).toBe(-20);
    expect(down.direction).toBe("down");
    expect(changeLabel(down)).toBe("-20%");
  });

  it("never divides by a previous value of zero", () => {
    // The classic failure: 0 -> 40 is not "+Infinity%".
    const fromNothing = compare(40, 0);
    expect(fromNothing.percentChange).toBeNull();
    expect(fromNothing.direction).toBe("new");
    expect(changeLabel(fromNothing)).toBe("New");
    // The difference is still real and worth showing.
    expect(fromNothing.difference).toBe(40);
  });

  it("says nothing happened when nothing happened either period", () => {
    const nothing = compare(0, 0);
    expect(nothing.percentChange).toBeNull();
    expect(nothing.direction).toBe("none");
    expect(changeLabel(nothing)).toBe("—");
    expect(changeTone(nothing)).toBe("neutral");
  });

  it("marks an unchanged figure as flat, not as a rise", () => {
    const flat = compare(100, 100);
    expect(flat.difference).toBe(0);
    expect(flat.percentChange).toBe(0);
    expect(flat.direction).toBe("flat");
    expect(changeLabel(flat)).toBe("0%");
  });

  it("handles a drop to zero", () => {
    const gone = compare(0, 250);
    expect(gone.percentChange).toBe(-100);
    expect(gone.direction).toBe("down");
    expect(changeLabel(gone)).toBe("-100%");
  });

  it("never produces a non-finite number, whatever it is given", () => {
    const cases = [
      compare(NaN, 100),
      compare(100, NaN),
      compare(Infinity, 100),
      compare(100, Infinity),
      compare(-Infinity, -Infinity),
      compare(0, 0),
      compare(50, 0),
    ];
    for (const c of cases) {
      expect(Number.isFinite(c.current)).toBe(true);
      expect(Number.isFinite(c.previous)).toBe(true);
      expect(Number.isFinite(c.difference)).toBe(true);
      if (c.percentChange !== null) expect(Number.isFinite(c.percentChange)).toBe(true);
      expect(changeLabel(c)).not.toMatch(/NaN|Infinity/);
    }
  });

  it("tones a new period as good and a fall as low", () => {
    expect(changeTone(compare(40, 0))).toBe("good");
    expect(changeTone(compare(120, 100))).toBe("good");
    expect(changeTone(compare(80, 100))).toBe("low");
    expect(changeTone(compare(100, 100))).toBe("neutral");
  });
});

describe("day windows", () => {
  it("compares the anchor day with the one before", () => {
    const w = dayWindows("2026-08-29");
    expect(w.current).toMatchObject({ from: "2026-08-29", to: "2026-08-29", label: "29 Aug" });
    expect(w.previous).toMatchObject({ from: "2026-08-28", to: "2026-08-28", label: "28 Aug" });
  });

  it("steps back across a month boundary", () => {
    expect(dayWindows("2026-08-01").previous.from).toBe("2026-07-31");
    // And across a year.
    expect(dayWindows("2026-01-01").previous.from).toBe("2025-12-31");
  });

  it("labels the real dates rather than claiming 'today'", () => {
    // The anchor is the last day with DATA, which is usually not today, so a
    // label saying "Today" would be a false claim.
    const w = dayWindows("2026-08-29");
    expect(w.current.label).not.toMatch(/today/i);
    expect(w.previous.label).not.toMatch(/yesterday/i);
  });
});

describe("week windows", () => {
  it("starts the week on Saturday, as the distributor confirmed", () => {
    // Locked deliberately. Changing WEEK_STARTS_ON silently redefines every
    // week-on-week number on every screen, and no other check would notice,
    // because a wrong week still produces plausible-looking figures. If this
    // ever needs to change, it needs an owner's answer, not a code review.
    expect(WEEK_STARTS_ON).toBe(6);
    // 29 Aug 2026 is a Saturday, so it is its own week start.
    expect(new Date("2026-08-29T00:00:00.000Z").getUTCDay()).toBe(6);
    expect(weekStart("2026-08-29")).toBe("2026-08-29");
    // 26 Aug 2026 is a Wednesday; its week began Saturday 22 Aug.
    expect(weekStart("2026-08-26")).toBe("2026-08-22");
  });

  it("compares the same number of days on both sides", () => {
    // Wednesday: five days into a Saturday-start week. The previous window
    // must also be five days, or every early-week comparison looks like a
    // collapse.
    const w = weekWindows("2026-08-26");
    expect(w.current).toMatchObject({ from: "2026-08-22", to: "2026-08-26" });
    expect(w.previous).toMatchObject({ from: "2026-08-15", to: "2026-08-19" });
    const span = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86400000;
    expect(span(w.current.from, w.current.to)).toBe(span(w.previous.from, w.previous.to));
  });

  it("handles the first day of a week", () => {
    // A Saturday: one day against the one day of the Saturday before.
    const w = weekWindows("2026-08-22");
    expect(w.current).toMatchObject({ from: "2026-08-22", to: "2026-08-22" });
    expect(w.previous).toMatchObject({ from: "2026-08-15", to: "2026-08-15" });
  });

  it("labels a week that straddles two months with both", () => {
    // 1 Oct 2026 is a Thursday; its week began Saturday 26 Sep.
    const w = weekWindows("2026-10-01");
    expect(w.current.from).toBe("2026-09-26");
    expect(w.current.label).toMatch(/Sep.*Oct/);
  });
});

describe("month windows", () => {
  it("compares month-to-date with the SAME days of the previous month", () => {
    // The bug this prevents: 12 days of August against the whole of July
    // reports a 60% collapse every month.
    const w = monthWindows("2026-08-12");
    expect(w.current).toMatchObject({ from: "2026-08-01", to: "2026-08-12" });
    expect(w.previous).toMatchObject({ from: "2026-07-01", to: "2026-07-12" });
  });

  it("clamps to a shorter previous month", () => {
    // 31 March has no counterpart in February.
    const w = monthWindows("2026-03-31");
    expect(w.previous).toMatchObject({ from: "2026-02-01", to: "2026-02-28" });
    // And a leap February keeps its 29th.
    expect(monthWindows("2024-03-30").previous.to).toBe("2024-02-29");
  });

  it("steps back across a year boundary", () => {
    const w = monthWindows("2026-01-10");
    expect(w.previous).toMatchObject({ from: "2025-12-01", to: "2025-12-10" });
  });

  it("handles the first of the month", () => {
    const w = monthWindows("2026-08-01");
    expect(w.current).toMatchObject({ from: "2026-08-01", to: "2026-08-01" });
    expect(w.previous).toMatchObject({ from: "2026-07-01", to: "2026-07-01" });
  });
});

describe("query bounds", () => {
  it("gives an exclusive end, so the last day is included exactly once", () => {
    const w = dayWindows("2026-08-29");
    // A query of { gte: from, lt: endExclusive } must cover 29 Aug and stop.
    expect(endExclusive(w.current).toISOString()).toBe("2026-08-30T00:00:00.000Z");
  });

  it("routes every kind through one entry point", () => {
    for (const kind of ["day", "week", "month"] as const) {
      const w = windowsFor(kind, "2026-08-29");
      expect(w.kind).toBe(kind);
      expect(w.current.from <= w.current.to).toBe(true);
      expect(w.previous.from <= w.previous.to).toBe(true);
      // The previous window must end before the current one begins.
      expect(w.previous.to < w.current.from).toBe(true);
    }
  });
});

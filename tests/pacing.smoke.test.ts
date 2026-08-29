import { describe, expect, it } from "vitest";
import {
  FORECAST_AT_RISK_PERCENT,
  coversWholeMonth,
  monthWindow,
  pacing,
  pacingForView,
  perDayLabel,
  riskTone,
} from "../lib/pacing";

/**
 * Dhaka is UTC+6, so a UTC instant of 20:00 is already the NEXT day in Dhaka.
 * These fixtures are written as UTC instants and the expected answers are the
 * Dhaka ones — that difference is the bug this suite exists to prevent.
 */
const at = (utc: string) => new Date(utc);

describe("month window", () => {
  it("counts today as still available", () => {
    // 10 August, 31-day month: days 10..31 remain, which is 22 including today.
    const w = monthWindow("2026-08", at("2026-08-10T04:00:00Z"));
    expect(w.phase).toBe("current");
    expect(w.daysInMonth).toBe(31);
    expect(w.dayOfMonth).toBe(10);
    expect(w.daysRemaining).toBe(22);
    // Data lands a day late, so nine completed days sit behind the figure.
    expect(w.elapsedDays).toBe(9);
    // The two halves must tile the month exactly — no day counted twice.
    expect(w.elapsedDays + w.daysRemaining).toBe(w.daysInMonth);
  });

  it("uses the Dhaka day, not the UTC day", () => {
    // 19:00 UTC on the 9th is already the 10th in Dhaka (+6).
    expect(monthWindow("2026-08", at("2026-08-09T19:00:00Z")).dayOfMonth).toBe(10);
    // And 19:00 UTC on the 31st is already 1 September in Dhaka, so August is
    // over — a UTC reading would still call it "current" and offer a run rate
    // for a month that has ended.
    expect(monthWindow("2026-08", at("2026-08-31T19:00:00Z")).phase).toBe("past");
  });

  it("handles the first day of the month, when yesterday is last month", () => {
    const w = monthWindow("2026-08", at("2026-08-01T04:00:00Z"));
    expect(w.dayOfMonth).toBe(1);
    expect(w.daysRemaining).toBe(31);
    // Clamped to zero rather than going negative: 31 July is not day 0 of August.
    expect(w.elapsedDays).toBe(0);
  });

  it("handles the last day", () => {
    const w = monthWindow("2026-08", at("2026-08-31T04:00:00Z"));
    expect(w.dayOfMonth).toBe(31);
    expect(w.daysRemaining).toBe(1);
    expect(w.elapsedDays).toBe(30);
  });

  it("knows February, including a leap year", () => {
    expect(monthWindow("2026-02", at("2026-02-10T04:00:00Z")).daysInMonth).toBe(28);
    expect(monthWindow("2024-02", at("2024-02-10T04:00:00Z")).daysInMonth).toBe(29);
  });

  it("treats a finished month as finished and a future one as untouched", () => {
    const past = monthWindow("2026-07", at("2026-08-10T04:00:00Z"));
    expect(past.phase).toBe("past");
    expect(past.daysRemaining).toBe(0);
    expect(past.elapsedDays).toBe(31);

    const future = monthWindow("2026-09", at("2026-08-10T04:00:00Z"));
    expect(future.phase).toBe("future");
    expect(future.daysRemaining).toBe(30);
    expect(future.elapsedDays).toBe(0);
  });

  it("accepts an explicit data date and clamps it into the month", () => {
    expect(monthWindow("2026-08", at("2026-08-10T04:00:00Z"), "2026-08-05").elapsedDays).toBe(5);
    expect(monthWindow("2026-08", at("2026-08-10T04:00:00Z"), "2026-07-20").elapsedDays).toBe(0);
    expect(monthWindow("2026-08", at("2026-08-10T04:00:00Z"), "2026-09-20").elapsedDays).toBe(31);
  });
});

describe("required and current run rate", () => {
  it("works the brief's own example", () => {
    // Target 1000, achieved 650, 7 days left -> 50 per day. Seven days left
    // including today means today is the 25th of a 31-day month.
    const p = pacing(1000, 650, "2026-08", at("2026-08-25T04:00:00Z"));
    expect(p.remaining).toBe(350);
    expect(p.window.daysRemaining).toBe(7);
    expect(p.requiredPerDay).toBeCloseTo(50);
    // 650 over the 24 completed days.
    expect(p.currentPerDay).toBeCloseTo(650 / 24);
    expect(perDayLabel(p.requiredPerDay)).toBe("50");
  });

  it("rounds the required rate UP, because the floor is not enough", () => {
    // 350 over 8 days is 43.75; doing 43 a day misses.
    const p = pacing(1000, 650, "2026-08", at("2026-08-24T04:00:00Z"));
    expect(p.window.daysRemaining).toBe(8);
    expect(perDayLabel(p.requiredPerDay)).toBe("44");
  });

  it("asks for nothing more once the target is met", () => {
    const p = pacing(1000, 1200, "2026-08", at("2026-08-10T04:00:00Z"));
    expect(p.remaining).toBe(0);
    expect(p.requiredPerDay).toBe(0);
    expect(p.status).toBe("Achieved");
  });
});

describe("forecast", () => {
  it("projects the whole month exactly once", () => {
    // 9 completed days at 100/day, 22 days left -> 900 + 2200 = 3100, which is
    // 100 x 31. If the halves overlapped or left a gap this would not hold.
    const p = pacing(4000, 900, "2026-08", at("2026-08-10T04:00:00Z"));
    expect(p.currentPerDay).toBeCloseTo(100);
    expect(p.projected).toBeCloseTo(3100);
    expect(p.projectedPercent).toBe(78);
    expect(p.gap).toBeCloseTo(-900);
  });

  it("reports a surplus as a positive gap", () => {
    const p = pacing(2000, 900, "2026-08", at("2026-08-10T04:00:00Z"));
    expect(p.projected).toBeCloseTo(3100);
    expect(p.gap).toBeCloseTo(1100);
  });

  it("refuses to project with no days of data", () => {
    // The 1st: nothing has landed, so any projection would be invention.
    const p = pacing(1000, 0, "2026-08", at("2026-08-01T04:00:00Z"));
    expect(p.currentPerDay).toBeNull();
    expect(p.projected).toBeNull();
    expect(p.status).toBe("Too early");
  });
});

describe("risk status", () => {
  const on = (achieved: number) => pacing(3100, achieved, "2026-08", at("2026-08-10T04:00:00Z")).status;

  it("labels the four live states off the projection", () => {
    expect(on(900)).toBe("On track"); // projects to exactly 3100
    expect(on(800)).toBe("At risk"); // ~2756, 89%
    expect(on(600)).toBe("Likely miss"); // ~2067, 67%
    expect(on(3100)).toBe("Achieved");
  });

  it("uses the same 80 line as the rest of the app", () => {
    expect(FORECAST_AT_RISK_PERCENT).toBe(80);
  });

  it("does not call a finished month at risk", () => {
    expect(pacing(1000, 400, "2026-07", at("2026-08-10T04:00:00Z")).status).toBe("Missed");
    expect(pacing(1000, 1000, "2026-07", at("2026-08-10T04:00:00Z")).status).toBe("Achieved");
  });

  it("does not report a row with no target as failing one", () => {
    const p = pacing(0, 0, "2026-08", at("2026-08-10T04:00:00Z"));
    expect(p.status).toBe("No target");
    expect(p.percent).toBe(0);
    expect(p.projectedPercent).toBeNull();
  });

  it("maps every status to a tone", () => {
    for (const s of ["Achieved", "On track", "At risk", "Likely miss", "Missed", "Too early", "No target"] as const)
      expect(["good", "mid", "low", "neutral"]).toContain(riskTone(s));
  });
});

describe("never shows a broken number", () => {
  it("survives zero, negative and non-finite input", () => {
    const cases = [
      pacing(0, 500, "2026-08", at("2026-08-10T04:00:00Z")),
      pacing(1000, -50, "2026-08", at("2026-08-10T04:00:00Z")),
      pacing(NaN, 100, "2026-08", at("2026-08-10T04:00:00Z")),
      pacing(1000, NaN, "2026-08", at("2026-08-10T04:00:00Z")),
      pacing(Infinity, 100, "2026-08", at("2026-08-10T04:00:00Z")),
      pacing(1000, 500, "2026-07", at("2026-08-10T04:00:00Z")),
      pacing(1000, 500, "2026-09", at("2026-08-10T04:00:00Z")),
    ];
    for (const p of cases)
      for (const [k, v] of Object.entries(p))
        if (typeof v === "number") expect(Number.isFinite(v), `${k} = ${v}`).toBe(true);
  });

  it("prints a dash rather than NaN when there is nothing to show", () => {
    expect(perDayLabel(null)).toBe("—");
    expect(perDayLabel(NaN)).toBe("—");
    expect(perDayLabel(Infinity)).toBe("—");
  });
});

describe("pacing is withheld from a narrowed date range", () => {
  it("treats a plain month, and a range spanning it, as the whole month", () => {
    expect(coversWholeMonth("2026-08")).toBe(true);
    expect(coversWholeMonth("2026-08", "2026-08-01", "2026-08-31")).toBe(true);
    // Wider than the month still contains it.
    expect(coversWholeMonth("2026-08", "2026-07-01", "2026-09-30")).toBe(true);
  });

  it("rejects anything narrower", () => {
    expect(coversWholeMonth("2026-08", "2026-08-05", "2026-08-12")).toBe(false);
    expect(coversWholeMonth("2026-08", "2026-08-02", null)).toBe(false);
    expect(coversWholeMonth("2026-08", null, "2026-08-20")).toBe(false);
    // February's last day is the 28th, not the 30th — a fixed 30/31 would
    // wrongly reject a full February.
    expect(coversWholeMonth("2026-02", "2026-02-01", "2026-02-28")).toBe(true);
    expect(coversWholeMonth("2026-02", "2026-02-01", "2026-02-27")).toBe(false);
  });

  it("returns null instead of a monthly figure over an eight-day window", () => {
    // "22 days left, need 44/day" printed over a custom range would describe
    // something other than what is on screen.
    const narrow = pacingForView(1000, 650, "2026-08", {
      from: "2026-08-05",
      to: "2026-08-12",
      now: at("2026-08-25T04:00:00Z"),
    });
    expect(narrow).toBeNull();

    const whole = pacingForView(1000, 650, "2026-08", { now: at("2026-08-25T04:00:00Z") });
    expect(whole).not.toBeNull();
    expect(whole!.window.daysRemaining).toBe(7);
  });
});

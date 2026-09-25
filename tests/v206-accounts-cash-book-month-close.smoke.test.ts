/**
 * v206 — Accounts: Cash Book & Day Close, Month close / lock, Collections,
 * Today's work, and the premium home.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CASH_BOOK_READ_ROLES,
  CASH_BOOK_WRITE_ROLES,
  cashLedger,
  cleanDenominations,
  countedCash,
  varianceTone,
  type DayFlow,
  type StoredClose,
} from "../lib/cash-book-rules";
import {
  MONTH_CLOSE_ROLES,
  MONTH_REOPEN_ROLES,
  closedMessage,
  closedOnOrAfter,
  isClosedDate,
  monthDays,
  monthHasEnded,
  monthLabel,
  nextMonthOf,
  prevMonthOf,
} from "../lib/month-close-rules";
import { collectionRate, niceMax } from "../lib/collections-rate";

const read = (p: string) => readFileSync(p, "utf8");

const flow = (date: string, deposits = 0, expenses = 0, movesIn = 0, movesOut = 0): DayFlow => ({
  date,
  deposits,
  expenses,
  movesIn,
  movesOut,
});
const close = (date: string, openingCash: number, cashIn: number, cashOut: number, counted: number): StoredClose => ({
  date,
  openingCash,
  openingTyped: false,
  cashIn,
  cashOut,
  expected: openingCash + cashIn - cashOut,
  counted,
});

describe("the cash box", () => {
  it("expected = opening + cash in − cash out, and a count carries forward (not the expected)", () => {
    const flows = new Map([
      ["2026-09-01", flow("2026-09-01", 10000, 500)],
      ["2026-09-02", flow("2026-09-02", 4000, 0, 0, 3000)],
    ]);
    // Day 1 closed 100 short: 5,000 + 10,000 − 500 = 14,500 expected, 14,400 counted.
    const closes = new Map([["2026-09-01", { ...close("2026-09-01", 5000, 10000, 500, 14400) }]]);
    const [d1, d2] = cashLedger(["2026-09-01", "2026-09-02"], flows, closes, null);
    expect(d1.expected).toBe(14500);
    expect(d1.variance).toBe(-100);
    expect(d1.changed).toBe(false);
    // Day 2 starts from what was COUNTED: 14,400 + 4,000 − 3,000.
    expect(d2.opening).toBe(14400);
    expect(d2.expected).toBe(15400);
    expect(d2.close).toBeNull();
  });

  it("before any count there is nothing to start from", () => {
    const [d] = cashLedger(["2026-09-01"], new Map([["2026-09-01", flow("2026-09-01", 100)]]), new Map(), null);
    expect(d.opening).toBeNull();
    expect(d.expected).toBeNull();
    expect(d.carriedIn).toBeNull();
  });

  it("a count carried across uncounted days picks up what moved on them", () => {
    const seed = close("2026-08-31", 0, 0, 0, 2000);
    const days = cashLedger(
      ["2026-09-01", "2026-09-02"],
      new Map([["2026-09-01", flow("2026-09-01", 500)]]),
      new Map([["2026-09-02", close("2026-09-02", 2500, 0, 0, 2500)]]),
      seed,
    );
    expect(days[1].carriedIn).toBe(2500);
    expect(days[1].changed).toBe(false);
  });

  it("an entry changed after closing is flagged — the count is never silently rewritten", () => {
    // Closed expecting 1,000 in; a deposit was then corrected to 1,200.
    const c = close("2026-09-05", 0, 1000, 0, 1000);
    const [d] = cashLedger(
      ["2026-09-05"],
      new Map([["2026-09-05", flow("2026-09-05", 1200)]]),
      new Map([["2026-09-05", c]]),
      null,
    );
    expect(d.changed).toBe(true);
    expect(d.expected).toBe(1200);
    expect(d.close!.expected).toBe(1000);
  });

  it("…and so is a day whose opening moved because an earlier count changed", () => {
    const seed = close("2026-09-04", 0, 0, 0, 900); // re-counted: was 1,000
    const [d] = cashLedger(
      ["2026-09-05"],
      new Map(),
      new Map([["2026-09-05", close("2026-09-05", 1000, 0, 0, 1000)]]),
      seed,
    );
    expect(d.changed).toBe(true);
    expect(d.carriedIn).toBe(900);
  });

  it("counts notes and coins, and refuses what is not a count", () => {
    expect(countedCash({ "1000": 3, "500": 1, "10": 2, "1": 4 })).toBe(3524);
    expect(cleanDenominations({ "1000": "2", "500": "", "7": 9 })).toEqual({ "1000": 2 });
    expect(cleanDenominations({ "100": -1 })).toBeNull();
    expect(cleanDenominations({ "100": 1.5 })).toBeNull();
    expect(cleanDenominations("x")).toEqual({});
  });

  it("a coin's worth is not a shortfall", () => {
    expect(varianceTone(-0.4)).toBe("even");
    expect(varianceTone(-50)).toBe("short");
    expect(varianceTone(20)).toBe("over");
  });

  it("only Accounts counts; Admin and IT read", () => {
    expect(CASH_BOOK_WRITE_ROLES).toEqual(["ACCOUNTS"]);
    expect(CASH_BOOK_READ_ROLES).toEqual(["ACCOUNTS", "ADMIN", "IT"]);
    expect(read("app/stock/cash-book/page.tsx")).toContain('requireUser(["ACCOUNTS", "ADMIN", "IT"])');
  });

  it("the expected figure is computed by the server, and a difference needs a reason", () => {
    const api = read("app/api/stock/cash-book/close/route.ts");
    expect(api).toContain("const [day] = await cashBookLedger(date, date);");
    expect(api).not.toMatch(/b\.expected/);
    expect(api).toContain("Math.abs(variance) > VARIANCE_TOLERANCE && note.length < 3");
  });
});

describe("closed months", () => {
  it("names and walks months", () => {
    expect(monthLabel("2026-09")).toBe("September 2026");
    expect(prevMonthOf("2026-01")).toBe("2025-12");
    expect(nextMonthOf("2026-12")).toBe("2027-01");
    expect(monthDays("2024-02")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });
  it("a month can be closed only once it is over", () => {
    expect(monthHasEnded("2026-08", "2026-09-25")).toBe(true);
    expect(monthHasEnded("2026-09", "2026-09-30")).toBe(false);
  });
  it("says the same thing everywhere", () => {
    expect(closedMessage("2026-08")).toBe(
      "August 2026 is closed — nothing dated in it can be changed. Admin can reopen it.",
    );
    expect(isClosedDate(["2026-08"], "2026-08-31")).toBe(true);
    expect(isClosedDate(["2026-08"], "2026-09-01")).toBe(false);
  });
  it("an opening is locked by any closed month from its own on", () => {
    expect(closedOnOrAfter(["2026-07", "2026-09"], "2026-08-15")).toBe("2026-09");
    expect(closedOnOrAfter(["2026-07"], "2026-08-15")).toBeNull();
  });
  it("Accounts closes; only Admin reopens, with a reason", () => {
    expect(MONTH_CLOSE_ROLES).toEqual(["ACCOUNTS"]);
    expect(MONTH_REOPEN_ROLES).toEqual(["ADMIN"]);
    const api = read("app/api/stock/month-close/route.ts");
    expect(api).toContain("if (!monthHasEnded(month, dhakaTodayYmd()))");
    expect(api).toContain('if (reason.length < 3) return NextResponse.json({ error: "Say why it is being reopened." }');
    expect(api).toContain('"REOPEN_MONTH"');
  });

  it.each([
    ["app/api/stock/day/route.ts", "lockedFor([date])"],
    ["app/api/stock/expenses/route.ts", "lockedFor([date])"],
    ["app/api/stock/expenses/route.ts", "lockedFor([row.date])"],
    ["app/api/stock/lifting/route.ts", "lockedFor([date])"],
    ["app/api/stock/lifting/route.ts", "lockedFor([row.date])"],
    ["app/api/stock/cash-book/moves/route.ts", "lockedFor([date])"],
    ["app/api/stock/cash-book/moves/route.ts", "lockedFor([row.date])"],
    ["app/api/stock/cash-book/close/route.ts", "lockedFor([date])"],
    ["app/api/stock/opening/route.ts", "openingLockedFor([asOfDate, existing?.asOfDate])"],
  ])("%s refuses a closed month (%s)", (file, call) => {
    const src = read(file);
    expect(src).toContain(`await ${call}`);
    expect(src).toContain("{ status: 423 }");
  });

  it("every screen that writes a dated row knows the month is closed", () => {
    expect(read("app/stock/daily/page.tsx")).toContain("locked={await lockedFor([date])}");
    expect(read("app/stock/expenses/page.tsx")).toContain("closed={closed}");
    expect(read("app/stock/lifting/page.tsx")).toContain("closed={closed}");
  });
});

describe("Collections", () => {
  it("a team's due is never summed; goods and money are", () => {
    const lib = read("lib/collections.ts");
    expect(lib).toContain("closing: companyWide ? sum((r) => r.closing) : null");
    expect(lib).toContain("const companyWide = scope.holders === null;");
  });
  it("the rate is money in over goods out, net of returns", () => {
    expect(collectionRate(9000, 10000)).toBe(90);
    expect(collectionRate(500, 0)).toBeNull();
  });
  it("the chart's axis tops out on a clean number", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(730)).toBe(1000);
    expect(niceMax(1_450_000)).toBe(2_000_000);
    expect(niceMax(5000)).toBe(5000);
  });
  it("is scoped like the ledger", () => {
    expect(read("tests/route-map.ts")).toContain(
      '"/stock/collections": ["ACCOUNTS", "ADMIN", "IT", "MANAGER", "SUPERVISOR"]',
    );
  });
});

describe("client screens name no server module", () => {
  it.each([
    "app/components/CashBookView.tsx",
    "app/components/MonthCloseView.tsx",
    "app/components/CollectionsView.tsx",
    "app/components/CollectionChart.tsx",
    "app/components/TodayChecklist.tsx",
  ])("%s", (file) => {
    const src = read(file);
    expect(src).not.toMatch(/from "@\/lib\/(cash-book|month-close|collections|accounts-today|prisma|stock-data)"/);
  });
});

describe("Today's work and Daily Entry", () => {
  it("every item links to the page that does it", () => {
    const lib = read("lib/accounts-today.ts");
    for (const href of [
      "/stock/cash-book",
      "/stock/month-close",
      "/stock/reminders",
      "/stock/products",
      "/stock/sim-check",
    ])
      expect(lib).toContain(href);
  });
  it("Ctrl+S saves from anywhere on the form, and a closed month cannot be saved", () => {
    const ui = read("app/components/StockDayEntry.tsx");
    expect(ui).toContain('(e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "s"');
    expect(ui).toContain("e.preventDefault();");
    expect(ui).toContain("const canSave = !locked && !busy");
  });
});

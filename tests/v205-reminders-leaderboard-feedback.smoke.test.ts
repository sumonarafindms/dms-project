/**
 * v205 — Due reminders, Leaderboard, toasts & confirm dialogs, sparklines.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { daysBetween, reminderText, REMINDER_ROLES } from "../lib/reminder-text";
import { Sparkline } from "../app/components/Kit";

const read = (p: string) => readFileSync(p, "utf8");
// Kit.tsx is compiled with the automatic runtime in Next; vitest uses the classic one.
(globalThis as { React?: unknown }).React = React;

describe("Due reminders", () => {
  it("the message states the due and the last payment, politely", () => {
    const t = reminderText({
      name: "RSO 10",
      due: 98520,
      today: "2026-09-24",
      lastDeposit: "2026-09-12",
      lastAmount: 100,
    });
    expect(t).toContain("24/09/26");
    expect(t).toContain("প্রিয় RSO 10,");
    expect(t).toContain("মোট বাকি: ৳98,520");
    expect(t).toContain("শেষ জমা: 12/09/26 (৳100)");
    expect(t).toContain("ধন্যবাদ");
    expect(reminderText({ name: "X", due: 5, today: "2026-09-24", lastDeposit: null })).toContain("এখনো কোনো জমা");
  });
  it("counts whole days", () => {
    expect(daysBetween("2026-09-20", "2026-09-24")).toBe(4);
    expect(daysBetween("2026-08-31", "2026-09-01")).toBe(1);
  });
  it("only those who chase money see it; the field does not", () => {
    expect(REMINDER_ROLES).toEqual(["ACCOUNTS", "ADMIN", "IT", "MANAGER", "SUPERVISOR"]);
    expect(read("tests/route-map.ts")).toContain(
      '"/stock/reminders": ["ACCOUNTS", "ADMIN", "IT", "MANAGER", "SUPERVISOR"]',
    );
  });
  it("recording a reminder is scoped like the ledger, and audited", () => {
    const api = read("app/api/stock/reminders/route.ts");
    expect(api).toContain("if (!mayOpen(scope, parsed.type, parsed.id))");
    expect(api).toContain('"REMIND_DUE"');
  });
  it("a team is never shown a money total that belongs to nobody", () => {
    expect(read("app/stock/reminders/page.tsx")).toContain("scope.holders === null");
  });
  it("the list is the ledger's own dues, per person", () => {
    expect(read("lib/reminders.ts")).toContain("(await holderDues(scope)).filter((h) => h.due > 0)");
  });
});

describe("Leaderboard", () => {
  const lib = read("lib/leaderboard.ts");
  it("uses the same GA every performance screen uses", () => {
    expect(lib).toContain("employeePerformance(`${month}-01`, undefined, from, to)");
    expect(lib).toContain('listBpAssignments({ role: "ADMIN" }, month, from, to)');
  });
  it("a one-day board carries no target %", () => {
    expect(lib).toContain("const target = day ? null : p.gaTarget || null;");
    expect(read("app/components/LeaderboardView.tsx")).toContain(
      'const showMeter = board.period !== "day" && rows.some((r) => r.target !== null);',
    );
  });
  it("a team's % needs every RSO's target", () => {
    expect(lib).toContain("t.target = gaps.has(t.id) ? null : t.target || null;");
  });
  it("a supervisor finds their own team marked", () => {
    expect(lib).toContain('mine: viewer.role === "SUPERVISOR" && !!id && id === viewer.supervisorId,');
  });
  it("an outlet held by two RSOs is one row", () => {
    expect(lib).toContain("byOutlet.get(a.retailerId)");
  });
  it("shows names and GA only — no money, no phones", () => {
    const types = read("lib/leaderboard-types.ts");
    expect(types).not.toMatch(/phone|due|amount|c2c/i);
  });
  it("the client screen names no Prisma module", () => {
    expect(read("app/components/LeaderboardView.tsx")).not.toMatch(/from "@\/lib\/leaderboard"/);
  });
});

describe("toasts and confirm dialogs", () => {
  it("one provider for the whole app", () => {
    const shell = read("app/components/AppShell.tsx");
    expect(shell.match(/<FeedbackProvider>/g)?.length).toBe(2);
  });
  it("no browser confirm box is left anywhere", () => {
    // Walked in node, not with grep: the suite also runs on Windows.
    const files = (readdirSync("app", { recursive: true }) as string[]).filter((f) => f.endsWith(".tsx"));
    const hits = files.filter((f) => /window\.confirm\(|[^.a-zA-Z]confirm\("/.test(read(join("app", f))));
    expect(hits).toEqual([]);
  });
  it.each([
    ["app/components/ExpenseViews.tsx", "Remove this expense?"],
    ["app/components/LiftingViews.tsx", "Remove this lifting?"],
    ["app/components/ProductMaster.tsx", "title: `Retire ${p.subType}?`"],
    ["app/components/ProductMaster.tsx", "title: `Remove the ${fmtMoney(pr.price)} price"],
    ["app/components/NoticeViews.tsx", "title: `Take down"],
    ["app/admin/bp-management/BpManager.tsx", 'title: "End this BP assignment?"'],
    ["app/components/PermissionEditor.tsx", "permissions?`"],
  ])("%s asks first", (file, text) => {
    expect(read(file)).toContain(text);
  });
});

describe("sparkline", () => {
  const pts = (vals: number[]) => vals.map((v, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, value: v }));
  it("draws the shape between the period's low and high, and names the best day", () => {
    const html = renderToStaticMarkup(
      createElement(Sparkline, { points: pts([100, 120, 110]), unit: "৳", label: "C2C" }),
    );
    expect(html).toContain("<polyline");
    // lowest point on the floor, highest at the top
    expect(html).toMatch(/points="3\.0,29\.0 70\.0,3\.0 137\.0,16\.0"/);
    expect(html).toContain("best ৳120 on 02/09");
  });
  it("a flat period draws flat through the middle", () => {
    const html = renderToStaticMarkup(createElement(Sparkline, { points: pts([5, 5, 5]), label: "GA" }));
    expect(html).toMatch(/points="3\.0,16\.0 70\.0,16\.0 137\.0,16\.0"/);
  });
  it("its series is the comparison's own scope and rule", () => {
    const data = read("lib/comparison-data.ts");
    const flat = data.replace(/\s+/g, " ");
    expect(flat).toContain(
      "withStandardGa({ ...scope(employeeIds), activationDate: { gte: since(gaAnchor), lt: until(gaAnchor) }, })",
    );
    expect(flat).toContain("const where = { ...scope(employeeIds), date: { gte: since(anchor), lt: until(anchor) } };");
  });
});

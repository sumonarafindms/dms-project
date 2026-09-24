/**
 * v203 — the "user friendly" additions the owner picked, plus the outlet
 * search on Support Codes he asked for with a screenshot.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dayReceipt, whatsappLink } from "../lib/receipt";
import { buildStatement, statementMessage } from "../lib/statement";
import { audiencesFor, checkNotice, NOTICE_MAX_DAYS } from "../lib/notice-rules";

const read = (p: string) => readFileSync(p, "utf8");

describe("WhatsApp receipt", () => {
  const base = {
    name: "RSO 10",
    code: "E0010",
    dateYmd: "2026-09-12",
    given: [
      { name: "Normal 150", qty: 30, value: 4500, money: false },
      { name: "iTopup", qty: 10000, value: 10000, money: true },
      { name: "Swap 300", qty: 0, value: 0, money: false },
    ],
    returned: [{ name: "Normal 150", qty: 2, value: 300, money: false }],
    sold: [],
    cash: 2000,
    bank: 1000,
    bankRef: "TX9",
    dueBefore: 5000,
    dueAfter: 16200,
  };
  it("lists what was given, returned and paid, and ends on the due", () => {
    const t = dayReceipt(base);
    expect(t).toContain("12/09/26");
    expect(t).toContain("নাম: RSO 10 (E0010)");
    expect(t).toContain("• Normal 150 × 30 = ৳4,500");
    expect(t).toContain("• iTopup ৳10,000");
    expect(t).not.toContain("Swap 300");
    expect(t).toContain("↩️ ফেরত");
    expect(t).toContain("• Cash ৳2,000");
    expect(t).toContain("• Bank ৳1,000 (Ref TX9)");
    expect(t).toContain("আগের বাকি: ৳5,000");
    expect(t).toContain("এখন মোট বাকি: ৳16,200");
  });
  it("says settled, or in credit, rather than printing a minus", () => {
    expect(dayReceipt({ ...base, dueAfter: 0 })).toContain("পরিশোধিত");
    expect(dayReceipt({ ...base, dueAfter: -500 })).toContain("অগ্রিম জমা: ৳500");
  });
  it("a WhatsApp link to any way a number is written", () => {
    for (const n of ["01712345678", "+8801712345678", "8801712345678", "1712345678", "01712-345678"])
      expect(whatsappLink(n, "hi"), n).toBe("https://wa.me/8801712345678?text=hi");
    expect(whatsappLink(null, "a b")).toBe("https://wa.me/?text=a%20b");
    expect(whatsappLink("12345", "x")).toBe("https://wa.me/?text=x");
  });
  it("is only offered for what is saved", () => {
    const src = read("app/components/StockDayEntry.tsx");
    expect(src).toContain("{unsaved ? null : <SupportOfferMessage");
    expect(read("app/stock/daily/page.tsx")).toContain("phone: holder.loginPhone ?? holder.phones?.[0] ?? null");
  });
});

describe("statement", () => {
  const products = [
    { id: "sim", name: "Normal 150", money: false },
    { id: "top", name: "iTopup", money: true },
  ];
  const s = buildStatement({
    from: "2026-09-01",
    to: "2026-09-30",
    openingDue: 1000,
    products,
    movements: [
      { kind: "OPENING", productId: "sim", qty: 10, unitPrice: 150, date: "2026-08-01" },
      { kind: "GIVEN", productId: "sim", qty: 10, unitPrice: 150, date: "2026-08-20" }, // before: +1500
      { kind: "GIVEN", productId: "sim", qty: 20, unitPrice: 150, date: "2026-09-02" }, // +3000
      { kind: "SOLD", productId: "sim", qty: 15, unitPrice: 150, date: "2026-09-02" }, // never moves the due
      { kind: "GIVEN", productId: "top", qty: 5000, unitPrice: 1, date: "2026-09-02" }, // +5000
      { kind: "RETURNED", productId: "sim", qty: 4, unitPrice: 150, date: "2026-09-05" }, // −600
      { kind: "GIVEN", productId: "sim", qty: 99, unitPrice: 150, date: "2026-10-01" }, // after the period
    ],
    deposits: [
      { date: "2026-08-25", cash: 500, bank: 0 }, // before: −500
      { date: "2026-09-05", cash: 2000, bank: 1000, bankRef: "B1" },
    ],
  });
  it("brought forward is the running due on the first morning", () => {
    expect(s.broughtForward).toBe(1000 + 1500 - 500);
  });
  it("each day ends on its own running due; a sale moves nothing", () => {
    expect(s.days.map((d) => [d.date, d.due])).toEqual([
      ["2026-09-02", 2000 + 3000 + 5000],
      ["2026-09-05", 10000 - 600 - 3000],
    ]);
    expect(s.days[0].soldValue).toBe(2250);
    expect(s.days[1].bankRef).toBe("B1");
  });
  it("carried forward = brought forward + given − returned − deposited, and nothing after the period", () => {
    expect(s.carriedForward).toBe(
      s.broughtForward + s.totals.given - s.totals.returned - s.totals.cash - s.totals.bank,
    );
    expect(s.carriedForward).toBe(6400);
  });
  it("counts each product over the period", () => {
    expect(s.products).toEqual([
      { productId: "sim", name: "Normal 150", money: false, given: 20, returned: 4, sold: 15 },
      { productId: "top", name: "iTopup", money: true, given: 5000, returned: 0, sold: 0 },
    ]);
  });
  it("an empty month carries forward what it brought", () => {
    const e = buildStatement({
      from: "2026-07-01",
      to: "2026-07-31",
      openingDue: 700,
      products,
      movements: [],
      deposits: [],
    });
    expect([e.broughtForward, e.carriedForward, e.days.length]).toEqual([700, 700, 0]);
  });
  it("the message ends on the month's due", () => {
    const t = statementMessage(s, { name: "RSO 10", code: "E0010" });
    expect(t).toContain("01/09/26 থেকে 30/09/26");
    expect(t).toContain("আগের বাকি: ৳2,000");
    expect(t).toContain("মোট বাকি: ৳6,400");
  });
  it("the page is guarded like the ledger, and linked from it", () => {
    const page = read("app/stock/[type]/[id]/statement/page.tsx");
    expect(page).toContain('if (!mayOpen(scope, type, id)) redirect("/stock");');
    expect(read("app/stock/[type]/[id]/page.tsx")).toContain("/statement`}");
    const route = read("app/api/stock/export/route.ts");
    const block = route.slice(route.indexOf('report === "statement"'), route.indexOf('report === "simcheck"'));
    expect(block).toContain("if (!mayOpen(scope, type, id)) return deny();");
  });
});

describe("Quick search", () => {
  const lib = read("lib/quick-search.ts");
  it("links each role only to pages that role can open", () => {
    const map = read("tests/route-map.ts");
    for (const [role, prefix] of [
      ["MANAGER", "/manager/"],
      ["SUPERVISOR", "/supervisor/"],
      ["RSO", "/rso/"],
    ] as const) {
      const block = lib.slice(lib.indexOf(`  ${role}: {`), lib.indexOf("},", lib.indexOf(`  ${role}: {`)));
      for (const href of block.match(/`[^`]+`/g) || []) expect(href, role).toContain(prefix);
    }
    expect(map).toContain('"/manager/rsos/[id]": ["MANAGER"]');
  });
  it("a BP is given pages only, and a manager their own teams", () => {
    expect(lib).not.toMatch(/\n  BP: \{/);
    expect(lib).toContain('if (v.role === "MANAGER") return managerScope(v.id);');
  });
  it("the search box is on every signed-in screen, and Ctrl K opens it", () => {
    const shell = read("app/components/AppShell.tsx");
    expect(shell).toContain('<QuickSearch variant="sidebar"');
    expect(shell).toContain('<QuickSearch variant="icon"');
    expect(read("app/components/QuickSearch.tsx")).toContain(
      '(e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)',
    );
  });
  it("the client box imports no Prisma module, even for a type", () => {
    expect(read("app/components/QuickSearch.tsx")).not.toMatch(/from "@\/lib\/quick-search"/);
  });
});

describe("Notice board", () => {
  const today = "2026-09-24";
  it("needs a heading, a body and an audience", () => {
    expect(checkNotice({ title: "", body: "b", audience: ["RSO"] }, "ADMIN", today)).toMatchObject({ ok: false });
    expect(checkNotice({ title: "t", body: " ", audience: ["RSO"] }, "ADMIN", today)).toMatchObject({ ok: false });
    expect(checkNotice({ title: "t", body: "b", audience: [] }, "ADMIN", today)).toMatchObject({ ok: false });
    const ok = checkNotice(
      { title: "  Meeting   today ", body: "b", audience: ["RSO", "BP"], urgent: true },
      "ADMIN",
      today,
    );
    expect(ok).toEqual({
      ok: true,
      notice: { title: "Meeting today", body: "b", audience: ["RSO", "BP"], urgent: true, expiresOn: null },
    });
  });
  it("a manager speaks to their own teams only", () => {
    expect(audiencesFor("MANAGER")).toEqual(["RSO", "BP", "SUPERVISOR"]);
    expect(checkNotice({ title: "t", body: "b", audience: ["ACCOUNTS"] }, "MANAGER", today)).toMatchObject({
      ok: false,
    });
    expect(read("app/api/notices/route.ts")).toContain("supervisorIds = (await managerScope(me.id)).supervisorIds;");
  });
  it("the last day is real, not past, and at most 90 days away", () => {
    expect(NOTICE_MAX_DAYS).toBe(90);
    const f = (expiresOn: string) =>
      checkNotice({ title: "t", body: "b", audience: ["RSO"], expiresOn }, "ADMIN", today);
    expect(f("2026-09-23")).toMatchObject({ ok: false });
    expect(f("2026-02-31")).toMatchObject({ ok: false });
    expect(f("2027-01-30")).toMatchObject({ ok: false });
    expect(f("2026-09-24")).toMatchObject({ ok: true });
    expect(f("2026-12-23")).toMatchObject({ ok: true });
  });
  it("the migration is additive", () => {
    const sql = read("prisma/migrations/20260925100000_notice_board/migration.sql");
    expect(sql).toContain('CREATE TABLE "Notice"');
    expect(sql).not.toMatch(/DROP|ALTER TABLE/);
  });
  it("shows on the home screen, and a failure there never takes the app down", () => {
    expect(read("app/layout.tsx")).toContain("noticesFor(user).catch(() => [])");
    expect(read("app/components/AppShell.tsx")).toContain("path === role.home && notices.length");
  });
});

describe("Support codes: find an outlet and tick it", () => {
  const src = read("app/components/SupportCodePicker.tsx");
  it("each open RSO has an outlet search, Enter ticks the single match", () => {
    expect(src).toContain('placeholder="Find an outlet: code, name or number"');
    expect(src).toMatch(/if \(outlets\.length === 1\) \{\s*if \(!chosen\.includes\(outlets\[0\]\.id\)\) toggle/);
  });
  it("the top search finds an RSO by an outlet's code", () => {
    expect(src).toContain("r.retailers.some((x) => outletMatches(x, q))");
  });
  it("picked outlets are chips that un-pick on tap", () => {
    expect(src).toContain('className="sup-code-chip"');
  });
});

describe("tables on a phone", () => {
  it("a report table's wrap is never hidden below 640px", () => {
    const css = read("styles/kit.css");
    expect(css).toMatch(/\.kit-table-wrap:has\(> \.kit-report-table\) \{\s*display: block;/);
    expect(css).toMatch(/table\.kit-report-table \{\s*display: block;/);
  });
});

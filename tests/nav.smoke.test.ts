import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Every menu entry the code defines must actually be drawn.
 *
 * ## The bug
 *
 * IT could not see the Reporting Center. The entry existed — `itNav` was built
 * as "admin's menu plus the Reporting Center", filtered by permission into
 * `visibleNav`, and looked entirely correct in the source. It was never
 * rendered: the sidebar branched on `isAdmin`, which is true for ADMIN **and**
 * IT, and the admin branch called `<AdminNav>`, which read the module-level
 * `adminNav` constant rather than the role's own list.
 *
 * So one list was computed and a different one displayed, with nothing to
 * connect them. No error, no empty menu — just a missing item that only the
 * person looking for it would notice.
 *
 * ## The second half of the same bug
 *
 * The groups were INDEX SLICES: `adminNav.slice(5, 11)`. Inserting a single
 * item anywhere shifted every group after it, and an item past the last slice
 * would simply vanish. Both are now impossible: items carry a `group`, and the
 * tests below assert nothing falls outside one.
 */

const SHELL = fs.readFileSync(path.join(__dirname, "..", "app", "components", "AppShell.tsx"), "utf8");
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
const CODE = stripComments(SHELL);

/** The `adminNav` array literal, as text. */
function adminNavSource() {
  const start = CODE.indexOf("const adminNav: NavItem[] = [");
  expect(start, "adminNav was not found — did it get renamed?").toBeGreaterThan(-1);
  const end = CODE.indexOf("\n];", start);
  return CODE.slice(start, end);
}

function adminNavItems() {
  const src = adminNavSource();
  // Items are pretty-printed across several lines, so match on the whole block
  // rather than line by line.
  const out: { href: string; group: string | null }[] = [];
  for (const block of src.split(/\},\s*\{/)) {
    const href = /href:\s*"([^"]+)"/.exec(block)?.[1];
    if (!href) continue;
    out.push({ href, group: /group:\s*"([^"]+)"/.exec(block)?.[1] ?? null });
  }
  return out;
}

describe("the admin and IT sidebar", () => {
  const items = adminNavItems();

  it("finds the menu it is meant to police", () => {
    expect(items.length).toBeGreaterThanOrEqual(15);
    expect(items.map((i) => i.href)).toContain("/dashboard");
  });

  it("gives every item a group, so none can silently vanish", () => {
    const ungrouped = items.filter((i) => !i.group).map((i) => i.href);
    expect(ungrouped, "an item with no group is never drawn in the admin sidebar").toEqual([]);
  });

  it("uses only groups the sidebar actually renders", () => {
    const rendered = new Set([...CODE.matchAll(/\{\s*label:\s*"([^"]+)",\s*icon:\s*"[^"]+"\s*\}/g)].map((m) => m[1]));
    expect(rendered.size, "NAV_GROUPS was not found").toBeGreaterThanOrEqual(4);
    for (const i of items) expect(rendered.has(i.group!), `${i.href} is in group "${i.group}"`).toBe(true);
  });

  it("no longer slices the menu by index", () => {
    // `adminNav.slice(5, 11)` shifted every group whenever one item was added.
    expect(CODE).not.toMatch(/adminNav\.slice\(/);
    expect(CODE).not.toMatch(/adminNav\[\d+\]/);
    expect(CODE).not.toMatch(/itNav\[\d+\]/);
  });

  it("renders the role's own list rather than a hardcoded one", () => {
    // The whole bug: <AdminNav> read `adminNav` directly, so IT saw admin's
    // menu whatever its config said.
    expect(CODE).toMatch(/function AdminNav\(\{\s*nav,/);
    expect(CODE).toMatch(/<AdminNav\s+nav=\{role\.nav\}/);
    const body = CODE.slice(CODE.indexOf("function AdminNav("));
    expect(body.slice(0, 600)).not.toMatch(/\badminNav\b/);
  });
});

describe("reports are reachable from the menu", () => {
  const items = adminNavItems();
  const hrefs = items.map((i) => i.href);

  it("offers the Reporting Center to both ADMIN and IT", () => {
    // The routes have always allowed ADMIN; only the menu entry was IT-only,
    // and then not even shown to IT.
    expect(hrefs).toContain("/it/reports");
    expect(CODE).toMatch(/const itNav: NavItem\[\] = adminNav;/);
  });

  it("offers Data Readiness alongside it", () => {
    expect(hrefs).toContain("/it/readiness");
    for (const href of ["/it/reports", "/it/readiness"])
      expect(items.find((i) => i.href === href)?.group).toBe("Reports");
  });

  it("puts the Reporting Center on the mobile bar too", () => {
    expect(CODE).toMatch(/ADMIN_BOTTOM = \[[^\]]*"\/it\/reports"/);
  });

  it("picks the mobile bar by href, not by position", () => {
    // It used to be `adminNav[11]`, so inserting a menu item quietly changed
    // which five buttons a phone showed.
    expect(CODE).toMatch(/const pick = \(nav: NavItem\[\], hrefs: string\[\]\)/);
  });
});

describe("every menu href resolves to a real page", () => {
  it("has no entry pointing at a route that does not exist", () => {
    // A menu item that 404s is worse than a missing one.
    const app = path.join(__dirname, "..", "app");
    for (const { href } of adminNavItems()) {
      const dir = path.join(app, href.replace(/^\//, ""));
      expect(fs.existsSync(path.join(dir, "page.tsx")), `${href} has no page.tsx`).toBe(true);
    }
  });
});

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PICKER_LIMIT, matchOptions, type PickerOption } from "../app/components/Picker";

/**
 * A list you can type into, everywhere a list can get long.
 *
 * ## What was wrong
 *
 * Add BP asked for an RSO and then a retailer code from two native `<select>`
 * menus. There are hundreds of RSOs and roughly 2,190 retailers, so choosing
 * one meant scrolling with no way to jump — on a phone, which is what nine in
 * ten of this app's users are holding:
 *
 *     "ai jagai search korar option nai...scroll kore khujte hoi"
 *
 * BP Management had already hit this and worked around it with a separate
 * "Find retailer" text box beside the select — two controls for one decision,
 * on the one screen somebody had complained about.
 *
 * So the search lives in the control, per the rule this project learned in
 * v155: *a hazard that belongs to a control belongs to that control's
 * component, or every new field starts out broken and waits to be spotted.*
 */

const ROOT = path.join(__dirname, "..");

const OPTIONS: PickerOption[] = [
  { id: "1", label: "KAMAL TELECOM", meta: "R565817 · 01935599620" },
  { id: "2", label: "Ma Electronics", meta: "R342717 · 01967046995" },
  { id: "3", label: "R.R Enterprise- BP 01", meta: "01700000009 · Dhaka North" },
  { id: "4", label: "রহিম স্টোর", meta: "R100200 · 01811112222" },
];

describe("what the picker matches", () => {
  it("shows everything until something is typed", () => {
    expect(matchOptions(OPTIONS, "")).toHaveLength(4);
    expect(matchOptions(OPTIONS, "   ")).toHaveLength(4);
  });

  it("ignores case, and searches the second line too", () => {
    // The code and the wallet live in `meta`; searching only the name would
    // miss the two things an operator is most likely to type.
    expect(matchOptions(OPTIONS, "kamal").map((o) => o.id)).toEqual(["1"]);
    expect(matchOptions(OPTIONS, "R342717").map((o) => o.id)).toEqual(["2"]);
    expect(matchOptions(OPTIONS, "01967046995").map((o) => o.id)).toEqual(["2"]);
    expect(matchOptions(OPTIONS, "dhaka north").map((o) => o.id)).toEqual(["3"]);
  });

  it("takes the words in any order", () => {
    /*
     * People type what they remember, in the order they remember it. Requiring
     * one contiguous substring means "kamal 0193" finds nothing even though
     * both halves are right there on the row.
     */
    expect(matchOptions(OPTIONS, "kamal 0193").map((o) => o.id)).toEqual(["1"]);
    expect(matchOptions(OPTIONS, "0193 kamal").map((o) => o.id)).toEqual(["1"]);
    expect(matchOptions(OPTIONS, "telecom kamal").map((o) => o.id)).toEqual(["1"]);
    // Every word still has to appear — this is a filter, not a fuzzy guess.
    expect(matchOptions(OPTIONS, "kamal electronics")).toEqual([]);
  });

  it("finds a Latin wallet typed on a Bengali keyboard", () => {
    /*
     * The same fold v155 put on report search. `০১৯৩৫৫৯৯৬২০` and
     * `01935599620` are the same number with not one character in common, and
     * an operator on a Bengali keyboard has no way to tell why the list is
     * empty.
     */
    expect(matchOptions(OPTIONS, "০১৯৩৫৫৯৯৬২০").map((o) => o.id)).toEqual(["1"]);
    expect(matchOptions(OPTIONS, "০১৯৩").map((o) => o.id)).toEqual(["1"]);
    // Bengali letters are untouched, so a Bengali name still matches itself.
    expect(matchOptions(OPTIONS, "রহিম").map((o) => o.id)).toEqual(["4"]);
  });

  it("returns nothing rather than everything when nothing matches", () => {
    // A filter that falls back to the full list is worse than an empty one:
    // the reader thinks their search worked and picks the wrong row.
    expect(matchOptions(OPTIONS, "zzzz")).toEqual([]);
  });

  it("caps what it renders, not what it searches", () => {
    /*
     * 2,190 options in the DOM on every keystroke is what makes a picker feel
     * slower than the scrolling it replaced. The component slices to
     * PICKER_LIMIT for display — `matchOptions` itself must NOT, or the count
     * it reports ("first 50 of 2,190") would be a lie.
     */
    const many: PickerOption[] = Array.from({ length: 2190 }, (_, i) => ({
      id: String(i),
      label: `R${100000 + i}`,
      meta: `SHOP ${i}`,
    }));
    expect(matchOptions(many, "").length).toBe(2190);
    expect(matchOptions(many, "shop 1").length).toBeGreaterThan(PICKER_LIMIT);
    expect(PICKER_LIMIT).toBeGreaterThan(10);
    expect(PICKER_LIMIT).toBeLessThan(200);
  });
});

describe("no long list is left in a native menu", () => {
  /*
   * The rule, enforced rather than remembered: a `<select>` may only render a
   * fixed set of options. Anything built from data — people, outlets, logins —
   * goes through the picker, because that is the list nobody can scroll.
   *
   * The allow-list is short and each entry says why. Adding a new `<select>`
   * over a mapped list fails here, which forces the choice to be made rather
   * than skipped.
   */
  /** file -> the identifiers it may map inside a <select>, and why. */
  const ALLOWED: Record<string, Record<string, string>> = {
    [path.join("app", "components", "ListControls.tsx")]: {
      sort: "a handful of sort orders, fixed in code",
    },
    [path.join("app", "components", "ReminderList.tsx")]: {
      SORTS: "three sort orders, fixed in code",
    },
    [path.join("app", "components", "CollectionsView.tsx")]: {
      SORTS: "four sort orders, fixed in code",
    },
    [path.join("app", "admin", "users", "UserManager.tsx")]: {
      ROLES: "the seven roles, fixed in code",
    },
    [path.join("app", "components", "ProductMaster.tsx")]: {
      KIND_OPTIONS: "the built-in product kinds, fixed in code — an enum, not a list of people or outlets",
      customKinds:
        "the owner's own product kinds (v201) — a handful of names like 'Smart watch', never a list of people or outlets",
      ACTIVATION_OPTIONS: "the three activation kinds and 'not linked', fixed in code — an enum (v198)",
    },
    [path.join("app", "components", "ExpenseViews.tsx")]: {
      BUILT_IN: "the built-in expense kinds, fixed in code — an enum, not a list of people or outlets",
      kinds: "the owner's own expense kinds (v201) — a handful of names like 'Internet', never people or outlets",
    },
    [path.join("app", "components", "ServerSearchBar.tsx")]: {
      options:
        "ServerSelect is a URL-param filter over a short enumeration — sort orders, audit modules and actions — not a list of people or outlets",
    },
  };

  function tsxFiles(dir: string): string[] {
    const out: string[] = [];
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...tsxFiles(rel));
      else if (e.name.endsWith(".tsx")) out.push(rel);
    }
    return out;
  }
  const FILES = tsxFiles("app").map((file) => ({
    file,
    src: fs.readFileSync(path.join(ROOT, file), "utf8"),
  }));

  /** Every `<select …>` … `</select>` block, whole. */
  const selects = FILES.flatMap(({ file, src }) =>
    [...src.matchAll(/<select[\s\S]*?<\/select>/g)].map((m) => ({ file, body: m[0] })),
  );

  it("is finding the selects it means to", () => {
    expect(FILES.length).toBeGreaterThan(60);
    expect(selects.length).toBeGreaterThan(2);
    // An allow-list entry for a file that no longer exists is a hole waiting
    // for a new file to be given the same name.
    for (const file of Object.keys(ALLOWED))
      expect(fs.existsSync(path.join(ROOT, file)), `ALLOWED names ${file}, which is gone`).toBe(true);
  });

  it("finds none built from a data list", () => {
    const offenders: string[] = [];
    for (const { file, body } of selects)
      for (const m of body.matchAll(/\{\s*([A-Za-z_$][\w$]*)\s*\.map\(/g))
        if (!ALLOWED[file]?.[m[1]]) offenders.push(`${file}: <select> maps over \`${m[1]}\``);
    expect(offenders, `use <Picker> — a native menu cannot be searched:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });

  it("would notice one if it came back", () => {
    // The regexes span multiple lines and are easy to get subtly wrong.
    const bad = `<select className="x">\n  {employees.map((e) => (\n <option/>))}\n</select>`;
    const found = [...bad.matchAll(/<select[\s\S]*?<\/select>/g)].flatMap((m) => [
      ...m[0].matchAll(/\{\s*([A-Za-z_$][\w$]*)\s*\.map\(/g),
    ]);
    expect(found.map((m) => m[1])).toEqual(["employees"]);
    // And a select of literal options is left alone.
    const fine = `<select><option value="A">A</option></select>`;
    expect([...fine.matchAll(/\{\s*([A-Za-z_$][\w$]*)\s*\.map\(/g)]).toHaveLength(0);
  });

  it("keeps the picker where every caller can reach it", () => {
    // One component, not one per screen — the reason BP Management's private
    // search box existed at all.
    const users = FILES.filter((f) => /<Picker\b/.test(f.src)).map((f) => f.file);
    expect(users.length, "nothing uses the picker").toBeGreaterThanOrEqual(4);
    expect(fs.existsSync(path.join(ROOT, "app", "components", "Picker.tsx"))).toBe(true);
  });
});

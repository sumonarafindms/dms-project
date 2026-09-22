/**
 * An empty screen is a claim, and it has to be the right one.
 *
 * Every assertion here comes from a screen that rendered nothing, or rendered
 * a green tick, in a situation that was not good news:
 *
 *   - the RSO home returned `null` for an inactive employee record — a white
 *     page with no heading, no message and, on a phone, no way back;
 *   - three attention centres congratulated an unmapped login on having no
 *     outstanding work, when what they had was no scope at all;
 *   - the SSO/LSO worklist said "All SSO complete" when NOTHING was complete,
 *     because the reader had tapped the Complete filter;
 *   - five KPI tiles showed a 0% ring for a month whose target was never
 *     uploaded.
 *
 * None of these produced an error. They are all the same defect — output that
 * looks correct and is not — so they are guarded together.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** Every page a role can land on that resolves its own scope and can find none. */
const SCOPED_PAGES = [
  "app/rso/page.tsx",
  "app/rso/attention/page.tsx",
  "app/rso/retailers/page.tsx",
  "app/rso/sso/page.tsx",
  "app/rso/lso/page.tsx",
  "app/supervisor/attention/page.tsx",
  "app/bp/page.tsx",
];

describe("no page renders nothing at all", () => {
  it("never returns null from a page component", () => {
    /*
     * `return null` is a legitimate thing for a small component to do. For a
     * PAGE it is a blank browser tab, and the RSO home did exactly that for
     * any employee record that had been deactivated.
     *
     * Matched on the file's code, comments stripped, so this cannot be
     * satisfied by the paragraph above it.
     */
    for (const p of SCOPED_PAGES) {
      expect(code(p), `${p} can render a blank page`).not.toMatch(/\breturn null;/);
    }
  });

  it("explains an inactive record rather than a missing one", () => {
    // Two different problems, two different people to ask.
    const rso = read("app/rso/page.tsx");
    expect(rso).toContain("Your employee record is inactive");
    expect(rso).toContain("Employee record not found");
  });

  it("uses the shared notice instead of four hand-rolled copies", () => {
    for (const p of ["app/rso/page.tsx", "app/rso/sso/page.tsx", "app/rso/lso/page.tsx", "app/bp/page.tsx"]) {
      expect(code(p), `${p} hand-rolls its own notice`).toMatch(/<(PageNotice|Notice)\b/);
    }
  });
});

describe("an empty attention list does not congratulate anyone", () => {
  const VIEW = code("app/components/RoleAttention.tsx");

  it("makes the caller say what empty means", () => {
    /*
     * The fixed "No attention items — execution rules are complete for this
     * scope" is gone. The component cannot know which of four things happened,
     * so it is told.
     */
    expect(VIEW).toContain("empty.title");
    expect(VIEW).not.toMatch(/title="No attention items"/);
  });

  it("only the genuine all-clear is positive", () => {
    // `positive` is the green tick. It must be bound, never hardcoded on.
    expect(VIEW).toContain("positive={empty.positive}");
    // A BARE `positive` is the hardcoded tick. `positive={…}` is the bound one.
    expect(VIEW).not.toMatch(/<EmptyState\s+positive(?![=\w])/);
  });

  it("distinguishes a search with no match from a clean scope", () => {
    expect(VIEW).toMatch(/Nothing matches/);
    expect(VIEW).toMatch(/list\.q\s*$/m);
  });

  it("every attention route says what an empty scope means for its role", () => {
    for (const p of [
      "app/rso/attention/page.tsx",
      "app/supervisor/attention/page.tsx",
      "app/manager/attention/page.tsx",
    ]) {
      expect(code(p), `${p} does not say what an empty scope means`).toContain("emptyScope");
    }
  });

  it("an unmapped login is sent to a notice, not to an empty list", () => {
    /*
     * Both pages used to build the empty array inline — `u.employeeId ? … : []`
     * — and hand it to the list, which then reported all clear.
     */
    expect(code("app/rso/attention/page.tsx")).not.toMatch(/u\.employeeId\s*\?[\s\S]{0,120}:\s*\[\]/);
    expect(code("app/rso/retailers/page.tsx")).not.toMatch(/u\.employeeId\s*\?[\s\S]{0,120}:\s*\[\]/);
    expect(code("app/supervisor/attention/page.tsx")).toContain("u.supervisorId");
  });
});

describe("the worklist tells the truth about an empty filter", () => {
  const WORK = code("app/rso/OperationalWorklist.tsx");

  it("does not announce completion unconditionally", () => {
    /*
     * The bug: one branch, always positive, always "All <title> complete".
     * Tapping "Complete" with nothing complete produced the exact inversion of
     * the truth.
     */
    expect(WORK).toContain("emptyMessage");
    // The one bare `positive` left is the grouped view's Pending section, and
    // it is now rendered only when Pending is the group the reader asked for.
    expect((WORK.match(/<EmptyState\s+positive(?![=\w])/g) ?? []).length).toBe(1);
    expect(WORK).toContain('const showPending = statusFilter !== "complete"');
    expect(WORK).toContain('const showDone = statusFilter !== "pending"');
  });

  it("has a branch for 'nothing complete yet'", () => {
    expect(WORK).toMatch(/statusFilter === "complete"/);
    expect(WORK).toContain("complete yet");
  });

  it("has a branch for an empty scope, worded by the caller", () => {
    expect(WORK).toMatch(/total === 0/);
    expect(WORK).toContain("emptyScope");
    expect(code("app/rso/sso/page.tsx")).toContain("No SIM-seller retailers");
    expect(code("app/rso/lso/page.tsx")).toContain("No retailers assigned");
  });

  it("only the all-done branch is positive", () => {
    const block = WORK.slice(WORK.indexOf("const emptyMessage"), WORK.indexOf("const link ="));
    expect((block.match(/positive: true/g) ?? []).length).toBe(1);
    // …and it is the branch that names completion, not the one that names a gap.
    const positiveAt = block.indexOf("positive: true");
    expect(block.lastIndexOf("complete yet")).toBeLessThan(positiveAt);
  });

  it("names the month it is reporting on", () => {
    // The month drives every figure on the page and arrived only as a silent
    // `?month=` the reader could neither see nor change.
    expect(WORK).toMatch(/subtitle=\{`\$\{month\}/);
  });
});

describe("a missing target is not a target of zero", () => {
  const KIT = code("app/components/Kit.tsx");
  const CARD = KIT.slice(KIT.indexOf("export function KpiCard"), KIT.indexOf("export function ComparisonCard"));

  it("draws no ring when there is no target", () => {
    /*
     * `targetPercent(a, 0)` is 0 by design. Painting that into a ring and a bar
     * told an RSO whose month had no uploaded target that they were at zero
     * percent, in the colour the app uses for failing.
     */
    expect(CARD).toContain("const hasTarget = target > 0");
    expect(CARD).toMatch(/\{hasTarget && <Ring/);
    expect(CARD).not.toMatch(/^\s*<Ring value=\{p\}/m);
  });

  it("says the target is missing in words", () => {
    // v183 folded the card's two sentences into one — it used to print "No
    // target set" and then "Ask Admin to upload this month's target." on the
    // line below, and an RSO's home renders five of these. Both facts still
    // reach the reader; the assertion is that BOTH still do.
    expect(CARD).toContain("No target");
    expect(CARD).toContain("ask Admin");
  });

  it("does not print a remaining figure it cannot compute", () => {
    const remainingAt = CARD.indexOf("Remaining:");
    const guardAt = CARD.indexOf("hasTarget ? (");
    expect(guardAt).toBeGreaterThan(-1);
    expect(remainingAt).toBeGreaterThan(guardAt);
  });

  it("still shows what was achieved, because that part is real", () => {
    // The figure moved out of `.kit-kpi-meta` and onto a line of its own in
    // v183 (so two cards fit a phone row); it is still printed, and it is
    // still printed OUTSIDE the hasTarget branch, which is the part that
    // matters.
    const value = CARD.slice(CARD.indexOf('className="kit-kpi-value"'), CARD.indexOf('className="kit-kpi-of"'));
    expect(value).toContain("fmt(Math.round(achieved))");
    expect(CARD.indexOf('className="kit-kpi-value"')).toBeLessThan(CARD.indexOf("hasTarget ? ("));
  });

  /* ---------------------------------------------------------------- *
   * v183: the same ruling, applied to the cards that had not had it
   * ---------------------------------------------------------------- */

  it("an entity card draws no ring and no band when there is no target", () => {
    const entity = KIT.slice(KIT.indexOf("export function EntityCard"), KIT.indexOf("export function DropZone"));
    // A supervisor's RSO list showed seven red "Behind Target" badges and
    // seven 0% rings for a month whose recharge target nobody had uploaded.
    expect(entity).toContain("percent: number | null");
    expect(entity).toContain("percent === null");
    expect(entity).toContain("kit-ring-empty");
  });

  it("the status badge names the missing target instead of a band", () => {
    const badge = KIT.slice(KIT.indexOf("export function StatusBadge"), KIT.indexOf("type BtnVariant"));
    expect(badge).toContain("percent: number | null");
    expect(badge).toContain('if (percent === null) return <Badge tone="neutral">No target</Badge>');
  });

  it("a metric bar prints no bar and no percentage against a target of zero", () => {
    const bar = KIT.slice(KIT.indexOf("export function MetricBar"), KIT.indexOf("export function ProgressLine"));
    expect(bar).toContain("const hasTarget = target > 0");
    expect(bar).toMatch(/\{hasTarget && <Bar value=\{p\} \/>\}/);
    expect(bar).toContain('<em className="is-unset">No target</em>');
    // The achievement is real and stays.
    expect(bar).toContain("fmt(Math.round(achieved))");
  });

  it("no page passes a raw percentage where a missing target is possible", () => {
    /*
     * Every call site computes the headline percentage from an achieved and a
     * target it has in hand, so each one has to decide. This catches the one
     * that forgets and goes back to `pct(a, t)`, which silently means 0%.
     */
    const offenders: string[] = [];
    for (const f of [
      "app/supervisor/rsos/page.tsx",
      "app/supervisor/page.tsx",
      "app/manager/rsos/page.tsx",
      "app/manager/page.tsx",
      "app/manager/supervisors/page.tsx",
      "app/manager/supervisors/[id]/page.tsx",
      "app/admin/performance/rsos/page.tsx",
      "app/admin/performance/supervisors/page.tsx",
      "app/admin/performance/supervisors/[id]/page.tsx",
      "app/admin/performance/bps/page.tsx",
    ]) {
      const src = code(f);
      for (const m of src.matchAll(/percent[:=]\s*\{?pct\(/g)) offenders.push(`${f}: ${m[0]}`);
    }
    expect(offenders, `a headline percentage that cannot say "no target": ${offenders.join(", ")}`).toEqual([]);
  });

  it("an operator table prints 'No target' rather than a 0% bar", () => {
    /*
     * v186, and the last place still painting it. The four import screens
     * showed "1,666 achieved · 0 target · 0%" with an empty red bar under a
     * column headed "GA Progress" for every RSO whose target nobody had
     * uploaded.
     */
    const ui = code("app/components/OperationsPremiumUI.tsx");
    expect(ui).toContain("export function ProgressCell({ value, target }");
    expect(ui).toContain(
      'if (target !== undefined && !(target > 0)) return <span className="kit-cell-unset">No target</span>',
    );
    // And every caller hands it the target it already has.
    for (const f of ["app/ga/page.tsx", "app/c2c/page.tsx", "app/c2s/page.tsx"]) {
      const src = code(f);
      const cells = src.match(/<ProgressCell/g)?.length ?? 0;
      const withTarget = src.match(/target=\{/g)?.length ?? 0;
      expect(cells, `${f} renders no progress cells`).toBeGreaterThan(0);
      expect(
        withTarget,
        `${f} has a ProgressCell that cannot tell a missing target from a zero one`,
      ).toBeGreaterThanOrEqual(cells);
    }
  });

  it("a list's own summary does not count an untargeted row as behind", () => {
    /*
     * The strip above the cards said "Below Target 7" while all seven cards
     * below it said "No target". One rule, in one place, counts three buckets.
     */
    const lib = code("lib/achievement.ts");
    expect(lib).toContain("export function splitByTarget");
    expect(lib).toContain("untargeted");
    for (const f of ["app/supervisor/rsos/page.tsx", "app/manager/rsos/page.tsx"]) {
      const src = code(f);
      expect(src, `${f} still tallies its own bands`).toContain("splitByTarget(");
      expect(src, `${f} still counts everything-not-on-track as behind`).not.toMatch(/all\.length - (strong|onTrack)/);
    }
  });

  it("agrees with the pacing line, which already declined to guess", () => {
    const pace = KIT.slice(KIT.indexOf("export function PaceFoot"));
    expect(pace).toContain('if (pace.status === "No target") return null;');
  });

  it("the raw achieved/target pair beside the percentage says it too", () => {
    /*
     * v191, found by reading every page as every role. The percentage columns
     * on /it/reports/target correctly printed "—" for a target nobody set, and
     * the column immediately to their left printed "289 / 0" and "0 / 0" on
     * the same row. One row, two answers; the honest one is easy to miss when
     * the dishonest one is the bigger number.
     *
     * The rule lives in lib/achievement.ts beside targetPercent, which has
     * returned 0 for a zero target on purpose since v175, so the pair and the
     * percentage cannot drift apart again.
     */
    const lib = code("lib/achievement.ts");
    expect(lib).toContain("export function againstTarget");
    expect(lib).toContain("export const NO_TARGET_MARK");

    /*
     * No page may interpolate an achievement and its target into one string by
     * hand. `${a} / ${b}` and `${a}/${b}` are the two shapes this defect has
     * taken; either is a page answering the question for itself.
     */
    const PAIR_PAGES = [
      "app/it/reports/target/page.tsx",
      "app/ga/page.tsx",
      "app/components/EmployeeDetailView.tsx",
      "app/admin/performance/supervisors/[id]/page.tsx",
    ];
    for (const f of PAIR_PAGES) {
      const src = code(f);
      expect(src, `${f} no longer prints a pair at all`).toContain("againstTarget(");
      expect(src, `${f} still builds an achieved/target pair by hand`).not.toMatch(
        /\$\{[^}]*\}\s*\/\s*\$\{[^}]*Target[^}]*\}/,
      );
    }

    /* And no screen falls back to a literal "0%" when there is no target. */
    for (const f of ["app/ga/page.tsx", "app/c2c/page.tsx", "app/c2s/page.tsx"]) {
      expect(code(f), `${f} prints 0% for a target nobody set`).not.toContain(': "0%"');
    }
  });
});

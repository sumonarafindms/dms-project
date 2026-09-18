import { test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { login } from "./helpers";
import { EXPECTED } from "../tests/route-map";

/**
 * Every route, checked against WCAG, at the width most of them are read at.
 *
 * ## Why this, and why now
 *
 * Around nine in ten of this app's users are RSOs and BPs on a phone, in the
 * field, often one-handed. The suite already had two things pointing that way —
 * `expectUsableTapTargets` (WCAG 2.5.8, touch size) and
 * `expectNoHorizontalOverflow` — and both were hand-written checks for two
 * specific rules.
 *
 * Everything else was unmeasured. A `<select>` with no accessible name, an
 * input whose only label is a placeholder, a colour pair that fails contrast in
 * the field, a heading order that jumps h1 to h3, a landmark nested wrong: none
 * of it shows up in a screenshot, and none of it fails a layout test. It shows
 * up when someone using a screen reader, or reading a dim phone in daylight,
 * cannot work out what a control does.
 *
 * axe-core is the standard implementation of those rules. Running it over the
 * canonical route map means the check grows with the app rather than with
 * whatever anyone remembered to hand-write.
 *
 * ## What it fails on, and what it does not
 *
 * Fails on `serious` and `critical` only. `minor` and `moderate` are reported
 * in the run's annotation but do not fail, because a suite that fails on
 * everything gets switched off, and this one has to survive to be useful.
 *
 * Colour-contrast is included: it is the rule most likely to matter for a
 * phone screen in sunlight, and the one most easily lost when a palette is
 * chosen on a desktop monitor.
 *
 * ## Discovery, not a hand-list
 *
 * The same shape as `coverage.spec.ts` and `interaction.spec.ts`: walk the map,
 * so a new page joins automatically. And, as there, a FLOOR — a role that
 * reaches five or more routes must actually have scanned some, or a selector or
 * login change has quietly turned the sweep into a no-op.
 */

const ROLES = [
  { key: "RSO", admin: false },
  { key: "SUPERVISOR", admin: false },
  { key: "BP", admin: false },
  { key: "MANAGER", admin: false },
  { key: "ACCOUNTS", admin: false },
  { key: "ADMIN", admin: true },
  { key: "IT", admin: false },
];

/** Static routes this role may load. `[id]` pages are covered by their parents' shape. */
function routesFor(role: string) {
  return Object.entries(EXPECTED)
    .filter(([route, roles]) => roles !== "PUBLIC" && (roles as string[]).includes(role) && !route.includes("["))
    .map(([route]) => route)
    .sort();
}

const DATA_MONTH =
  process.env.E2E_DATA_MONTH ||
  (() => {
    const now = new Date();
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  })();

const WIDTH_PROJECT = "w390";
const BLOCKING = new Set(["serious", "critical"]);

type Finding = { route: string; id: string; impact: string; help: string; nodes: string[] };

/** WCAG 2.1 A and AA — the level this app is measured against. */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

for (const role of ROLES) {
  const user = process.env[`E2E_${role.key}_USER`];
  const pass = process.env[`E2E_${role.key}_PASS`];
  const routes = routesFor(role.key);

  test.describe(`${role.key} accessibility`, () => {
    test.skip(!user || !pass, `set E2E_${role.key}_USER and E2E_${role.key}_PASS to run`);

    test(`${role.key}: ${routes.length} routes meet WCAG 2.1 AA`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== WIDTH_PROJECT, `accessibility sweep runs at ${WIDTH_PROJECT} only`);
      test.setTimeout(600_000);

      await login(page, user!, pass!, role.admin);

      const blocking: Finding[] = [];
      const advisory = new Map<string, number>();
      let scanned = 0;

      for (const route of routes) {
        await page.goto(`${route}?month=${DATA_MONTH}`, { waitUntil: "load" }).catch(() => null);
        if (new URL(page.url()).pathname !== route) continue; // redirects are coverage.spec's business
        // Let the client components mount; axe reads the live tree, and a bar
        // that has not rendered yet is a bar whose labels go unchecked.
        await page.waitForLoadState("networkidle").catch(() => null);

        const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        scanned++;

        for (const v of result.violations) {
          if (BLOCKING.has(v.impact || "")) {
            blocking.push({
              route,
              id: v.id,
              impact: v.impact || "",
              help: v.help,
              // Two examples is enough to find it; the whole list is noise.
              nodes: v.nodes.slice(0, 2).map((n) => n.html.replace(/\s+/g, " ").slice(0, 120)),
            });
          } else {
            advisory.set(v.id, (advisory.get(v.id) || 0) + 1);
          }
        }
      }

      testInfo.annotations.push({
        type: "a11y",
        description:
          `${scanned} routes scanned at ${WIDTH_PROJECT}, month ${DATA_MONTH}` +
          (advisory.size
            ? ` | advisory (not failing): ${[...advisory].map(([id, n]) => `${id}×${n}`).join(", ")}`
            : " | no advisory findings"),
      });

      if (blocking.length) {
        // Grouped by rule: twelve instances of one missing label is one problem
        // with one fix, and reading it as twelve is how a report gets ignored.
        const byRule = new Map<string, Finding[]>();
        for (const f of blocking) byRule.set(f.id, [...(byRule.get(f.id) || []), f]);
        const report = [...byRule]
          .map(([id, fs]) => {
            const routesHit = [...new Set(fs.map((f) => f.route))];
            return (
              `  ${id} (${fs[0].impact}) — ${fs[0].help}\n` +
              `    on ${routesHit.length} route(s): ${routesHit.slice(0, 6).join(", ")}${routesHit.length > 6 ? " …" : ""}\n` +
              `    e.g. ${fs[0].nodes[0]}`
            );
          })
          .join("\n");
        throw new Error(
          `${role.key}: ${byRule.size} blocking accessibility rule(s) across ${scanned} routes\n${report}`,
        );
      }

      // A sweep that scanned nothing is not a passing sweep.
      if (routes.length >= 5 && scanned === 0)
        throw new Error(`${role.key} scanned 0 of ${routes.length} routes — did login or the route map break?`);
    });
  });
}

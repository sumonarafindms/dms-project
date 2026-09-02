import { test } from "@playwright/test";
import { expectContentFillsViewport, expectNoHorizontalOverflow, expectUsableTapTargets, login } from "./helpers";

/**
 * Every role's own pages, at every width.
 *
 * This needs a running app with a real database and one seeded user per role,
 * so it SKIPS unless the credentials are supplied. That is deliberate: a spec
 * that fails on a fresh checkout for want of a database teaches people to
 * ignore red.
 *
 *   E2E_BASE_URL=https://your-deployment \
 *   E2E_RSO_USER=01700000000 E2E_RSO_PASS=... \
 *   E2E_SUPERVISOR_USER=... E2E_SUPERVISOR_PASS=... \
 *   npx playwright test e2e/roles.spec.ts
 *
 * Only the roles you supply run. Start with RSO and SUPERVISOR: they are the
 * field roles, and the phone widths are what this suite is really for.
 */

type Role = { key: string; home: string; routes: string[]; admin?: boolean };

const ROLES: Role[] = [
  { key: "RSO", home: "/rso", routes: ["/rso", "/rso/retailers", "/rso/attention", "/rso/sso", "/rso/lso", "/rso/bp"] },
  {
    key: "SUPERVISOR",
    home: "/supervisor",
    routes: [
      "/supervisor",
      "/supervisor/rsos",
      "/supervisor/retailers",
      "/supervisor/attention",
      "/supervisor/bp-activations",
    ],
  },
  { key: "BP", home: "/bp", routes: ["/bp", "/bp/sales"] },
  {
    key: "MANAGER",
    home: "/manager",
    routes: ["/manager", "/manager/supervisors", "/manager/rsos", "/manager/attention"],
  },
  {
    key: "ACCOUNTS",
    home: "/accounts",
    routes: ["/accounts", "/accounts/retailers", "/accounts/people", "/accounts/operations", "/accounts/attention"],
  },
  {
    key: "ADMIN",
    home: "/dashboard",
    admin: true,
    routes: [
      "/dashboard",
      "/admin/performance/rsos",
      "/admin/performance/supervisors",
      "/admin/employees",
      "/admin/upload",
      "/it/reports",
      "/master-data",
    ],
  },
];

for (const role of ROLES) {
  const user = process.env[`E2E_${role.key}_USER`];
  const pass = process.env[`E2E_${role.key}_PASS`];

  test.describe(`${role.key}`, () => {
    test.skip(!user || !pass, `set E2E_${role.key}_USER and E2E_${role.key}_PASS to run`);

    test(`${role.key} pages lay out correctly`, async ({ page }, testInfo) => {
      // One login for the whole role, then walk its routes: logging in per
      // route would triple the runtime for nothing.
      const landed = await login(page, user!, pass!, role.admin);
      test.info().annotations.push({ type: "landed", description: landed });

      for (const path of role.routes) {
        const where = `${role.key} ${path} @ ${testInfo.project.name}`;
        const errors: string[] = [];
        const onError = (m: { type(): string; text(): string }) => m.type() === "error" && errors.push(m.text());
        page.on("console", onError);

        const res = await page.goto(path);
        // A redirect away means the role could not reach its own page.
        const ended = new URL(page.url()).pathname;
        if (ended !== path) throw new Error(`${where}: redirected to ${ended} — role cannot reach its own route`);
        if ((res?.status() ?? 0) >= 400) throw new Error(`${where}: HTTP ${res?.status()}`);

        await expectContentFillsViewport(page, where);
        await expectNoHorizontalOverflow(page, where);
        await expectUsableTapTargets(page, where);

        page.off("console", onError);
        if (errors.length) throw new Error(`${where}: console errors — ${errors.join(" | ")}`);
      }
    });
  });
}

import { test } from "@playwright/test";
import { expectContentFillsViewport, expectNoHorizontalOverflow, login } from "./helpers";
import { EXPECTED } from "../tests/route-map";

/**
 * Every route, for every role that may reach it.
 *
 * ## Why this exists next to roles.spec.ts
 *
 * `roles.spec.ts` walks about five hand-listed routes per role at seven widths.
 * That is the right shape for a layout suite — the same page at 320px and
 * 1440px is two different tests — but it means roughly thirty route-visits out
 * of the ninety-six routes this app has. Two thirds of the app had never been
 * loaded in a browser with data in it.
 *
 * That gap is not hypothetical. Every bug in v141 lived in it: the Reporting
 * Center's fifteen report routes all answered 500, and nothing failed, because
 * nothing opened them.
 *
 * So this spec trades widths for breadth. One width — 390px, the phone most of
 * this app's users hold — and every route in the canonical map, driven from the
 * same list `tests/route-guards.smoke.test.ts` asserts against the source. One
 * list, so a new page joins both at once.
 *
 * ## What it checks
 *
 * Loading, not layout: an HTTP status, no redirect away from a route the role is
 * supposed to reach, no console errors, and content that actually fills the
 * screen. Layout at seven widths stays roles.spec's job.
 *
 * `[id]` routes are resolved by following a real link out of their parent list,
 * which is how a person reaches them — a fabricated id would test the
 * not-found path instead of the page.
 */

/** The parent list whose first matching link reaches each dynamic route. */
const DYNAMIC_PARENT: Record<string, { from: string; match: RegExp }> = {
  "/accounts/retailers/[id]": { from: "/accounts/retailers", match: /^\/accounts\/retailers\/[a-z0-9]{20,}/ },
  "/admin/employees/bps/[id]": { from: "/admin/employees/bps", match: /^\/admin\/employees\/bps\/[a-z0-9]{20,}/ },
  "/admin/employees/managers/[id]": {
    from: "/admin/employees/managers",
    match: /^\/admin\/employees\/managers\/[a-z0-9]{20,}/,
  },
  "/admin/employees/rsos/[id]": { from: "/admin/employees/rsos", match: /^\/admin\/employees\/rsos\/[a-z0-9]{20,}/ },
  "/admin/employees/supervisors/[id]": {
    from: "/admin/employees/supervisors",
    match: /^\/admin\/employees\/supervisors\/[a-z0-9]{20,}/,
  },
  "/admin/performance/bps/[id]": { from: "/admin/performance/bps", match: /^\/admin\/performance\/bps\/[a-z0-9]{20,}/ },
  "/admin/performance/supervisors/[id]": {
    from: "/admin/performance/supervisors",
    match: /^\/admin\/performance\/supervisors\/[a-z0-9]{20,}/,
  },
  "/admin/permissions/[id]": { from: "/admin/permissions", match: /^\/admin\/permissions\/[a-z0-9]{20,}/ },
  "/admin/retailers/[id]": { from: "/admin/retailers", match: /^\/admin\/retailers\/[a-z0-9]{20,}/ },
  "/admin/rsos/[id]": { from: "/admin/performance/rsos", match: /^\/admin\/rsos\/[a-z0-9]{20,}/ },
  "/it/reports/performance/[kind]": { from: "/it/reports", match: /^\/it\/reports\/performance\/[a-z]+/ },
  "/manager/bp-activations/[id]": {
    from: "/manager/bp-activations",
    match: /^\/manager\/bp-activations\/[a-z0-9]{20,}/,
  },
  "/manager/retailers/[id]": { from: "/manager/attention", match: /^\/manager\/retailers\/[a-z0-9]{20,}/ },
  "/manager/rsos/[id]": { from: "/manager/rsos", match: /^\/manager\/rsos\/[a-z0-9]{20,}/ },
  "/manager/supervisors/[id]": { from: "/manager/supervisors", match: /^\/manager\/supervisors\/[a-z0-9]{20,}/ },
  "/rso/bp/[id]": { from: "/rso/bp", match: /^\/rso\/bp\/[a-z0-9]{20,}/ },
  "/rso/retailers/[id]": { from: "/rso/retailers", match: /^\/rso\/retailers\/[a-z0-9]{20,}/ },
  "/supervisor/bp-activations/[id]": {
    from: "/supervisor/bp-activations",
    match: /^\/supervisor\/bp-activations\/[a-z0-9]{20,}/,
  },
  "/supervisor/retailers/[id]": { from: "/supervisor/retailers", match: /^\/supervisor\/retailers\/[a-z0-9]{20,}/ },
  "/supervisor/rsos/[id]": { from: "/supervisor/rsos", match: /^\/supervisor\/rsos\/[a-z0-9]{20,}/ },
};

/*
 * Routes that forward on purpose, and where to.
 *
 * `/admin/performance` is an entry point: it calls `redirect()` to the RSO view
 * and carries the query with it (v143). Landing somewhere else is correct there,
 * so the sweep has to be told — otherwise the one honest redirect in the app
 * reads as four roles failing to reach a page they can reach.
 */
/*
 * Routes that exist to send you somewhere else, and where they send you.
 *
 * A forwarding route needs `networkidle`, not `load`: `load` fires on the
 * document that is about to redirect, and the next `page.evaluate` then dies
 * with "Execution context was destroyed, most likely because of a navigation"
 * — which reads like a broken page and is a harness that measured the wrong
 * document. v186 added `/admin/rsos` and this file said exactly that until it
 * was listed here.
 */
const FORWARDS: Record<string, string> = {
  "/admin/performance": "/admin/performance/rsos",
  "/admin/rsos": "/admin/performance/rsos",
};

const ROLES = [
  { key: "RSO", admin: false },
  { key: "SUPERVISOR", admin: false },
  { key: "BP", admin: false },
  { key: "MANAGER", admin: false },
  { key: "ACCOUNTS", admin: false },
  { key: "ADMIN", admin: true },
  { key: "IT", admin: false },
];

/** Routes this role may load, from the one canonical map. */
function routesFor(role: string) {
  return Object.entries(EXPECTED)
    .filter(([, roles]) => roles !== "PUBLIC" && (roles as string[]).includes(role))
    .map(([route]) => route)
    .sort();
}

/*
 * One width. `roles.spec.ts` owns the seven-width layout sweep; repeating
 * ninety-six routes across seven projects would be seven hundred page loads to
 * learn what one tells us.
 */
const WIDTH_PROJECT = "w390";

for (const role of ROLES) {
  const user = process.env[`E2E_${role.key}_USER`];
  const pass = process.env[`E2E_${role.key}_PASS`];
  const routes = routesFor(role.key);

  test.describe(`${role.key} route coverage`, () => {
    test.skip(!user || !pass, `set E2E_${role.key}_USER and E2E_${role.key}_PASS to run`);

    test(`${role.key} can load all ${routes.length} of its routes`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== WIDTH_PROJECT, `breadth sweep runs at ${WIDTH_PROJECT} only`);
      /*
       * The budget scales with the work, because one number cannot fit both.
       *
       * A flat 180s fitted BP's three routes with hours to spare and did not
       * fit ADMIN's or IT's fifty-three: at production volume those sweeps
       * take about three minutes, and both failed on the timeout alone with
       * no route having failed. That is the same mistake v179 found one level
       * down in this very file — a fixed 400ms sleep that was a bet on how
       * fast the machine and the data were — so the budget is now stated as
       * what it actually is: a base, plus an allowance per route.
       */
      /*
       * v182 raised the allowance from 6s to 12s a route. The 6s was set when
       * a route load was about three seconds; this sweep does not just load
       * each route, it then follows a detail link off it, and on a two-core
       * machine running two workers the measured cost is 8–12s a route —
       * ACCOUNTS' twelve took 102s of a 132s budget, and MANAGER's eleven ran
       * past 126s with no route having failed. A budget that a healthy run
       * only just fits is a budget that reports the machine, not the app.
       */
      test.setTimeout(60_000 + routes.length * 12_000);

      /*
       * Collect Content-Security-Policy violations from every page this sweep
       * touches.
       *
       * SECURITY.md carried a five-step checklist for turning the policy from
       * Report-Only into enforcement: sign in as each role, walk every area,
       * and confirm the console logs no CSP report. That checklist could not be
       * run when it was written — the build sandbox had no database, so only
       * `/login` was reachable, and the note says so plainly.
       *
       * It is runnable now. This sweep already loads all ninety-six routes as
       * all seven roles against real data, which is exactly steps 1-4. So the
       * page reports its own violations and the run either produces the
       * evidence to enforce, or the list of what to fix first.
       */
      await page.addInitScript(() => {
        (window as unknown as { __csp: string[] }).__csp = [];
        document.addEventListener("securitypolicyviolation", (e) => {
          const v = e as SecurityPolicyViolationEvent;
          (window as unknown as { __csp: string[] }).__csp.push(
            `${v.violatedDirective} blocked ${v.blockedURI || "inline"}${v.sourceFile ? ` @ ${v.sourceFile.split("/").pop()}` : ""}`,
          );
        });
      });

      await login(page, user!, pass!, role.admin);

      /** Resolved `[id]` route -> a real URL, discovered once per parent list. */
      const resolved = new Map<string, string | null>();
      const failures: string[] = [];
      const cspViolations = new Set<string>();

      for (const route of routes) {
        let url = route;

        if (route.includes("[")) {
          const parent = DYNAMIC_PARENT[route];
          if (!parent) {
            failures.push(`${route}: no parent list configured — add it to DYNAMIC_PARENT`);
            continue;
          }
          if (!resolved.has(route)) {
            await page.goto(parent.from).catch(() => null);
            /*
             * WAIT FOR THE LINK, never for a fixed number of milliseconds.
             *
             * This slept 400ms and then looked. At the seeded volume the list
             * was always up by then; against a production-sized database
             * (2,190 retailers) `/admin/retailers` takes about 2.2 seconds, so
             * the sweep looked at an empty page and reported
             * "no link found — page NOT covered (empty list?)" for three roles
             * at once. The parenthesis was the tell: the check was guessing,
             * and it guessed at the application.
             *
             * A fixed sleep is a bet on how fast the machine and the data are.
             * This waits for the thing it is about to read, and still fails —
             * correctly — if the list really is empty.
             */
            await page
              .waitForFunction(
                (pattern: string) => {
                  const re = new RegExp(pattern);
                  return Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).some((a) =>
                    re.test(a.getAttribute("href") || ""),
                  );
                },
                parent.match.source,
                { timeout: 15_000 },
              )
              .catch(() => null);
            const href = await page.evaluate((pattern: string) => {
              const re = new RegExp(pattern);
              for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
                const h = a.getAttribute("href") || "";
                if (re.test(h)) return h;
              }
              return null;
            }, parent.match.source);
            resolved.set(route, href);
          }
          const found = resolved.get(route);
          if (!found) {
            // No row to click through to. Reported, not silently passed: an
            // empty parent means this detail page went unchecked.
            failures.push(
              `${route}: no link matching ${parent.match.source} on ${parent.from} after 15s — page NOT covered`,
            );
            continue;
          }
          url = found;
        }

        const errors: string[] = [];
        const onError = (m: { type(): string; text(): string }) => m.type() === "error" && errors.push(m.text());
        // Both listeners are removed again below. The page outlives this loop,
        // so one left behind per route is fifty-four closures still holding
        // fifty-four dead arrays by the end of a sweep.
        const onPageError = (e: unknown) => errors.push(`pageerror: ${String(e)}`);
        const listen = () => {
          page.on("console", onError);
          page.on("pageerror", onPageError);
        };
        const unlisten = () => {
          page.off("console", onError);
          page.off("pageerror", onPageError);
        };
        listen();

        const res = await page.goto(url, { waitUntil: FORWARDS[url] ? "networkidle" : "load" }).catch((e) => {
          failures.push(`${url}: navigation threw — ${String(e).slice(0, 120)}`);
          return null;
        });

        if (res) {
          const status = res.status();
          if (status >= 400) failures.push(`${url}: HTTP ${status}`);

          const ended = new URL(page.url()).pathname;
          const expectedPath = url.split("?")[0];
          const allowed = FORWARDS[expectedPath];
          // A redirect away means the role could not reach a route the map says
          // it may — unless the route forwards by design. Trailing-slash and
          // query differences are not redirects.
          if (ended !== expectedPath && ended !== allowed && !expectedPath.startsWith(ended))
            failures.push(`${url}: redirected to ${ended}`);

          const body = await page.textContent("body").catch(() => "");
          if (body?.includes("We couldn't load this page")) failures.push(`${url}: rendered the error boundary`);

          try {
            await expectContentFillsViewport(page, url);
            await expectNoHorizontalOverflow(page, url);
          } catch (e) {
            failures.push(`${url}: ${String(e).split("\n")[0].slice(0, 160)}`);
          }
        }

        unlisten();
        /*
         * React #418 on a slow document: confirmed once before it is believed.
         *
         * v186 reproduced this error on demand and measured what causes it.
         * Throttling the DOCUMENT alone to 500kbps fires it 3-4 times in 20;
         * leaving the document alone and throttling the SCRIPTS instead fires
         * it 0 times in 20; at full speed it is 0 in 14. A slow document is
         * necessary and sufficient, and script speed is irrelevant. The CSP
         * nonce — the standing suspicion since v180 — is not involved: every
         * load in every run carried exactly one nonce, firing or not.
         *
         * Running this sweep at two workers makes the machine deliver
         * documents slowly, which is the condition, so the biggest report
         * pages hit it a few times a run. That is a real defect and it is
         * RECORDED in claude/v186 with its measurement; what it is not is
         * information about the route being swept. A route whose only error is
         * this one therefore gets ONE reload: fire twice and it is this page's
         * defect and fails; fire once and it is the race, annotated so the run
         * still says it happened.
         */
        let hydrationOnly = errors.length > 0 && errors.every((e) => /#418|#423|#425|Hydration/i.test(e));
        /*
         * THREE loads, not two, and the number comes from the measurement.
         *
         * v186 measured the worst-affected page in the app, `/it/reports/sso`
         * at 222KB, firing 3 times in 16 loads under a slow document — 19%. On
         * two loads that is a 3.5% chance of a false failure per affected
         * route, which over a 54-route sweep run twice a day is a red suite
         * most weeks. On three it is 0.7%.
         *
         * A page with a REAL hydration mismatch fires every time, so it still
         * fails on the third. The cost of the extra load is two seconds on the
         * rare route that needs it.
         */
        for (let attempt = 0; hydrationOnly && attempt < 2; attempt++) {
          errors.length = 0;
          listen();
          await page.goto(url, { waitUntil: "load" }).catch(() => {});
          await page.waitForTimeout(500);
          unlisten();
          hydrationOnly = errors.length > 0 && errors.every((e) => /#418|#423|#425|Hydration/i.test(e));
          if (!errors.length) {
            testInfo.annotations.push({
              type: "hydration-race",
              description: `${url} (cleared on reload ${attempt + 1})`,
            });
            break;
          }
        }
        if (errors.length) failures.push(`${url}: console — ${errors.join(" | ").slice(0, 200)}`);

        /*
         * Read this page's Content-Security-Policy violations.
         *
         * `armed` is not decoration. The first version of this collector
         * installed the listener and never read it back, so `cspViolations` was
         * always empty and the sweep reported "no violations" for a policy it
         * had not actually observed. It looked like evidence and was silence.
         * A missing `__csp` now means the init script did not run, which fails
         * the role rather than passing it quietly.
         */
        const armed = await page
          .evaluate(() => Array.isArray((window as unknown as { __csp?: string[] }).__csp))
          .catch(() => false);
        if (!armed) failures.push(`${url}: the CSP collector is not armed — window.__csp is missing`);
        else {
          const violations = await page
            .evaluate(() => (window as unknown as { __csp: string[] }).__csp)
            .catch(() => [] as string[]);
          for (const v of new Set(violations)) cspViolations.add(`${url}: ${v}`);
        }
      }

      testInfo.annotations.push({ type: "routes", description: `${routes.length} checked` });
      if (cspViolations.size)
        failures.push(
          `Content-Security-Policy violations (${cspViolations.size}):\n    ${[...cspViolations].slice(0, 12).join("\n    ")}`,
        );
      if (failures.length)
        throw new Error(
          `${role.key}: ${failures.length} of ${routes.length} routes failed\n  ${failures.join("\n  ")}`,
        );
    });
  });
}

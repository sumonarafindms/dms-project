import { expect, test } from "@playwright/test";
import { login } from "./helpers";
import { EXPECTED } from "../tests/route-map";

/**
 * The controls on every list actually do something.
 *
 * ## The gap this closes
 *
 * Before this file, NOTHING in the E2E suite clicked or typed anything except
 * the login form. `roles.spec.ts` measures layout; `coverage.spec.ts` (v146)
 * proves all ninety-six routes load. A page that renders perfectly and whose
 * sort dropdown is inert passes both.
 *
 * That is the owner's own bug report:
 *
 *   "filter gula kaj kore na .. mane jodi ga high to low di .. kaj kore na"
 *
 * The v141 fix has a guard — `tests/filter-paging.smoke.test.ts` — but a STATIC
 * one: it reads the source for `search.delete("page")`. It would still pass if
 * the select lost its `onChange`, if the bar stopped rendering, or if the
 * server ignored `sort` outright. It proves the fix was typed, not that the app
 * does the thing.
 *
 * ## Two designs, deliberately different
 *
 * This app filters lists in two ways, and both are correct:
 *
 *   ServerSearchBar / ServerSelect  the URL changes, the server re-renders
 *   ListControls                    client state; the URL never changes
 *
 * The first version of this file assumed everything was the server kind and
 * reported five "inert" controls that were working exactly as designed. So the
 * assertion here is deliberately about the OUTCOME, not the mechanism: after
 * choosing a different order, the rendered list must change — whether that
 * happened via a soft navigation or in the browser is not this suite's
 * business.
 *
 * ## Ties are not failures, and not passes either
 *
 * "GA high to low" and "GA low to high" produce identical output when every GA
 * is zero, because both fall through to the same name tiebreak. Early in a
 * month — with data lagging a day — that is the normal state of the current
 * month, and calling it "the sort does nothing" sends someone hunting a bug
 * that is not there.
 *
 * So a tie is diagnosed rather than judged: if the displayed values really are
 * all equal the page is counted as NOT EXERCISED and named in the annotation.
 * Only differing values in an unchanged order is a failure. And the sweep runs
 * against a month that has data (`E2E_DATA_MONTH`, defaulting to last month)
 * so that the check has something to discriminate in the first place.
 *
 * ## Discovery, not a hand-list
 *
 * Pages are found by walking the canonical route map, as `coverage.spec.ts`
 * does. A hand-kept list of "pages with a sort dropdown" goes stale the first
 * time someone adds one. Because of that the suite asserts a FLOOR on how many
 * controls it drove: without it, a renamed class would leave every check with
 * nothing to do and the run would go green — the exact failure this file exists
 * to rule out.
 */

const BAR = ".kit-filter-bar";
const SEARCH = `${BAR} input[type=search]`;
const SORT = `${BAR} select`;
const NEXT = ".kit-pager-controls a[rel=next]";
const POSITION = ".kit-pager-position";

/**
 * The month to drive. Data lags a day, so on the 3rd of a month the current
 * month holds almost nothing and every ordering check would tie.
 */
const DATA_MONTH =
  process.env.E2E_DATA_MONTH ||
  (() => {
    const now = new Date();
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  })();

type Item = { href: string; label: string; metric: string };

/**
 * The visible list items: their link, something searchable, and the first
 * figure shown. Covers both list shapes — `Row` and the outlet card grid —
 * and deliberately excludes KPI cards, which are not list items. (Taking a
 * search term from a summary tile is how an earlier version came to search a
 * retailer list for "260", the total count.)
 */
async function listItems(page: import("@playwright/test").Page): Promise<Item[]> {
  /*
   * Retried, because reading the DOM can collide with a navigation that is
   * already under way — a debounced search commits while this is polling and
   * Playwright throws "Execution context was destroyed". That is not a finding
   * about the app; it is this function arriving mid-swap. Returning [] instead
   * would be worse than throwing: an empty list reads as "the search returned
   * nothing", which is a bug report.
   */
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await readItems(page);
    } catch {
      await page.waitForTimeout(300);
    }
  }
  return readItems(page);
}

function readItems(page: import("@playwright/test").Page): Promise<Item[]> {
  return page.evaluate(() => {
    const sel = "a.kit-row, a.kit-outlet, .kit-rows a[href]";
    const seen = new Set<string>();
    const out: { href: string; label: string; metric: string }[] = [];
    for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>(sel))) {
      const href = (a.getAttribute("href") || "").split("?")[0];
      if (!href || seen.has(href)) continue;
      seen.add(href);
      const code = a.querySelector(".kit-eyebrow")?.textContent?.trim() || "";
      const title = a.querySelector(".kit-row-main strong, .kit-entity-main strong, strong")?.textContent?.trim() || "";
      const metric =
        a.querySelector(".kit-outlet-metrics div strong, .kit-row-value strong")?.textContent?.trim() || "";
      out.push({ href, label: code || title, metric });
    }
    return out;
  });
}

/**
 * Poll until something is true, or give up.
 *
 * The first version of this file slept for a fixed 350ms after `networkidle`
 * and then read the rows. That is not long enough for a soft navigation: Next
 * fetches the new RSC payload and swaps the tree, so for a moment the OLD rows
 * are on screen under the NEW selection. Reading there produced "page 2 repeats
 * 60 rows from page 1" and "reordering stayed on page 2" — both of which turned
 * out to be the app working correctly and the test being early.
 *
 * A timeout here is deliberately NOT a failure. When two orders legitimately
 * tie, nothing will ever change and the wait must simply end so the assertion
 * that follows can tell a tie from a dead control.
 */
async function waitFor(page: import("@playwright/test").Page, done: () => Promise<boolean>, timeout = 10_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await done().catch(() => false)) return true;
    await page.waitForTimeout(150);
  }
  return false;
}

/** The first item's link — the cheapest signal that a list actually re-rendered. */
async function firstHref(page: import("@playwright/test").Page) {
  return (await listItems(page))[0]?.href ?? "";
}

/**
 * A term that appears in exactly ONE of the visible items.
 *
 * Searching for the first row's NAME was the earlier mistake: every retailer in
 * the seed is "Retailer <n>", and `matchesTokens` matches each token
 * separately, so "Retailer 1" matches "Retailer 12" and also "R1001" — the list
 * did not narrow, and the test called a working search broken. A term that is
 * unique by construction makes "the list must get shorter" a fair demand.
 */
async function uniqueTerm(page: import("@playwright/test").Page): Promise<string | null> {
  return page.evaluate(() => {
    const sel = "a.kit-row, a.kit-outlet, .kit-rows a[href]";
    /*
     * Text nodes joined with a space — NOT `textContent`, and not `innerText`
     * either.
     *
     * `textContent` glues adjacent elements together, so a card reading
     * "RE | R1165 | Retailer 165" became the single token "165r1165" — a string
     * that appears nowhere in the data, so the search correctly returned
     * nothing and the test called a working search broken. `innerText` was the
     * first fix and it glued them too, because these cards lay their children
     * out with flex and it inserts no break between inline boxes.
     */
    const textOf = (el: Element) => {
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const parts: string[] = [];
      let n: Node | null;
      while ((n = walk.nextNode())) {
        const t = (n.nodeValue || "").trim();
        if (t) parts.push(t);
      }
      return parts.join(" ").toLowerCase();
    };
    const texts = Array.from(document.querySelectorAll<HTMLAnchorElement>(sel)).map(textOf);
    if (texts.length < 2) return null;
    const counts = new Map<string, number>();
    for (const t of texts)
      for (const tok of new Set(t.match(/[a-z0-9]{4,}/g) || [])) counts.set(tok, (counts.get(tok) || 0) + 1);
    for (const tok of texts[0].match(/[a-z0-9]{4,}/g) || []) if (counts.get(tok) === 1) return tok;
    return null;
  });
}

/** Two orders of the same field that must disagree about what comes first. */
function oppositePair(values: string[]): [string, string] | null {
  for (const v of values) {
    if (!v.endsWith("-desc")) continue;
    const base = v.slice(0, -"-desc".length);
    if (values.includes(`${base}-asc`)) return [v, `${base}-asc`];
  }
  return null;
}

/**
 * Choose a sort option and wait for it to take effect, retrying ONCE.
 *
 * The retry is not superstition. Right after a soft navigation React swaps the
 * rendered tree, and a `<select>` resolved a moment earlier can be a detached
 * node by the time the change event is dispatched — the event fires into
 * nothing and the choice is silently lost. Observed directly: the identical
 * sequence cleared `page=2` in 299ms on one run and never cleared it in 60s on
 * the previous one.
 *
 * Re-resolving the locator and choosing again distinguishes the two cases that
 * matter. If the second attempt works, it was this race. If neither works, the
 * control really is dead — and the caller reports that.
 */
async function chooseSort(
  page: import("@playwright/test").Page,
  value: string,
  landed: () => Promise<boolean>,
  timeout = 12_000,
) {
  for (const attempt of [1, 2, 3]) {
    await reactReady(page, SORT);
    await page
      .locator(SORT)
      .first()
      .selectOption(value)
      .catch(() => null);
    if (await waitFor(page, landed, attempt === 1 ? timeout : timeout * 2)) return true;
  }
  return false;
}

/**
 * Follow the pager's Next link and wait to land, retrying ONCE.
 *
 * Same race as `chooseSort`: a link resolved before a re-render can be detached
 * by the time the click lands, and the navigation never happens. One honest
 * retry separates that from a pager that genuinely goes nowhere.
 */
async function clickNext(page: import("@playwright/test").Page, timeout = 20_000) {
  for (const attempt of [1, 2, 3]) {
    await reactReady(page, ".kit-pager-controls");
    await page
      .locator(NEXT)
      .first()
      .click()
      .catch(() => null);
    if (await waitFor(page, async () => new URL(page.url()).searchParams.get("page") === "2", timeout)) return true;
    void attempt;
  }
  return false;
}

/**
 * Wait until React owns THIS control, then let it settle.
 *
 * The root of every race in this file's history, demonstrated directly: with a
 * 600ms pause after `load`, the first `selectOption` on `/accounts/attention`
 * left the URL at `?month=2026-08` — no `sort` at all — while the identical
 * second selection a moment later worked. The event was dispatched at a
 * `<select>` that React then re-created during hydration, so the handler that
 * would have read it did not exist yet and nothing errored.
 *
 * Read back, a lost event is indistinguishable from a dead control, which is
 * how this suite came to accuse a working sort, a correct pager and a fine
 * search — each on whichever page hydrated a moment late that run. A probe
 * replaying the same steps by hand passed every time.
 *
 * React marks the nodes it owns with `__reactFiber$…` / `__reactProps$…` keys.
 * So the wait is per-element and specific: not a sleep, not "is it visible",
 * but "does React know about the element I am about to click".
 */
async function reactReady(page: import("@playwright/test").Page, selector: string, timeout = 15_000) {
  const ok = await page
    .waitForFunction(
      (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return true; // not on this page; nothing to wait for
        return Object.keys(el).some((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactProps$"));
      },
      selector,
      { timeout },
    )
    .then(() => true)
    .catch(() => false);
  // Hydration attaches the fiber before the effects that install some handlers.
  await page.waitForTimeout(250);
  return ok;
}

/**
 * Type a search term and wait for it to take, retrying.
 *
 * Landing means the server bar put `q` in the URL, or the client bar shortened
 * the list — both are legitimate designs here. Failing to land after three
 * attempts is reported as "never took effect", which is a different sentence
 * from "did not narrow" and sends the reader somewhere different.
 */
async function typeSearch(page: import("@playwright/test").Page, term: string, before: number, timeout = 12_000) {
  for (const attempt of [1, 2, 3]) {
    await reactReady(page, SEARCH);
    const box = page.locator(SEARCH).first();
    await box.fill(term).catch(() => null);
    await box.press("Enter").catch(() => null);
    if (
      await waitFor(
        page,
        async () => new URL(page.url()).searchParams.get("q") === term || (await listItems(page)).length < before,
        timeout,
      )
    )
      return true;
    void attempt;
  }
  return false;
}

/**
 * Roles whose every screen is about one record, so a list control would be
 * wrong rather than missing. See the floor at the end of the sweep.
 */
const NO_LIST_ROLES = new Set(["BP"]);

const ROLES = [
  { key: "RSO", admin: false },
  { key: "SUPERVISOR", admin: false },
  { key: "BP", admin: false },
  { key: "MANAGER", admin: false },
  { key: "ACCOUNTS", admin: false },
  { key: "ADMIN", admin: true },
  { key: "IT", admin: false },
];

function routesFor(role: string) {
  return Object.entries(EXPECTED)
    .filter(([route, roles]) => roles !== "PUBLIC" && (roles as string[]).includes(role) && !route.includes("["))
    .map(([route]) => route)
    .sort();
}

const WIDTH_PROJECT = "w390";

for (const role of ROLES) {
  const user = process.env[`E2E_${role.key}_USER`];
  const pass = process.env[`E2E_${role.key}_PASS`];
  const routes = routesFor(role.key);

  test.describe(`${role.key} list controls`, () => {
    test.skip(!user || !pass, `set E2E_${role.key}_USER and E2E_${role.key}_PASS to run`);

    test(`${role.key}: search, sort and paging do what they say`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== WIDTH_PROJECT, `interaction sweep runs at ${WIDTH_PROJECT} only`);
      test.setTimeout(600_000);

      await login(page, user!, pass!, role.admin);

      const failures: string[] = [];
      const tied: string[] = [];
      const exercised = { sort: 0, search: 0, paging: 0, reset: 0 };
      let pagesWithLists = 0;
      const open = async (route: string, extra = "") => {
        const res = await page.goto(`${route}?month=${DATA_MONTH}${extra}`, { waitUntil: "load" });
        // Never touch a control before React owns it — see `reactReady`.
        await reactReady(page, `${BAR}, .kit-pager-controls`);
        return res;
      };

      for (const route of routes) {
        await open(route).catch(() => null);
        if (new URL(page.url()).pathname !== route) continue; // redirects are coverage.spec's business

        const before = await listItems(page);
        if (before.length < 2) continue; // nothing to order, narrow or page
        pagesWithLists++;

        /* ---- choosing a different order changes the list -------------- */
        if ((await page.locator(SORT).count()) > 0) {
          const select = page.locator(SORT).first();
          const values = await select
            .locator("option")
            .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
          const pair = oppositePair(values);
          if (pair) {
            const [desc, asc] = pair;
            const start = await firstHref(page);
            // Server sorts announce themselves in the URL; client sorts only in
            // the DOM. Either is a legitimate design, so accept whichever comes.
            const tookDesc = await chooseSort(
              page,
              desc,
              async () => new URL(page.url()).searchParams.get("sort") === desc || (await firstHref(page)) !== start,
            );
            const d = await listItems(page);
            const mid = d[0]?.href ?? "";
            const tookAsc = await chooseSort(
              page,
              asc,
              async () => new URL(page.url()).searchParams.get("sort") === asc || (await firstHref(page)) !== mid,
            );
            const a = await listItems(page);

            /*
             * Whether the SELECTION landed is checked before what it produced.
             *
             * Skipping this is how the paging check once cried "page 2 repeats
             * page 1" over a page that was simply slow, and the same mistake
             * reappeared here: two attempts that both hit a detached <select>
             * leave the list untouched, which is indistinguishable from a dead
             * dropdown unless the selection itself is reported. "The control
             * never took effect" and "the control does nothing" send a reader
             * to two different places.
             */
            if (!tookDesc || !tookAsc) {
              failures.push(
                `${route}: choosing "${!tookDesc ? desc : asc}" never took effect after two attempts ` +
                  `(URL sort=${new URL(page.url()).searchParams.get("sort")})`,
              );
            } else if (!d.length || !a.length) {
              failures.push(`${route}: sorting emptied the list (${desc} -> ${d.length}, ${asc} -> ${a.length})`);
            } else if (d.map((x) => x.href).join() !== a.map((x) => x.href).join()) {
              exercised.sort++;
            } else if (new Set(d.map((x) => x.metric)).size <= 1) {
              // Every value identical: both directions legitimately tie on the
              // name tiebreak. Not a pass — this page's ordering went untested.
              tied.push(`${route} (${desc}/${asc}, all "${d[0]?.metric || "?"}")`);
            } else {
              failures.push(
                `${route}: "${desc}" and "${asc}" produced the SAME order although the values differ ` +
                  `(first three: ${d
                    .slice(0, 3)
                    .map((x) => x.metric)
                    .join(", ")}) — the sort does nothing`,
              );
            }

            /* ---- and reordering returns you to page 1 ---------------- */
            if ((await page.locator(NEXT).count()) > 0) {
              if (await clickNext(page)) {
                await chooseSort(page, desc, async () => new URL(page.url()).searchParams.get("page") !== "2");
                const after = new URL(page.url()).searchParams.get("page");
                if (after && after !== "1")
                  failures.push(`${route}: reordering from page 2 stayed on page ${after} — the reported bug`);
                else exercised.reset++;
              }
            }
          }
        }

        /* ---- searching narrows to matching rows ----------------------- */
        if ((await page.locator(SEARCH).count()) > 0) {
          await open(route);
          const rows = await listItems(page);
          // Unique to one visible row, so "the list must get shorter" is fair.
          const term = await uniqueTerm(page);
          if (term && rows.length > 1) {
            const took = await typeSearch(page, term, rows.length);
            const after = await listItems(page);
            if (!took)
              failures.push(
                `${route}: typing "${term}" never took effect after two attempts ` +
                  `(${rows.length} rows before, ${after.length} after, URL q=${new URL(page.url()).searchParams.get("q")})`,
              );
            else if (!after.length)
              failures.push(`${route}: searching "${term}" — taken from its own first row — returned nothing`);
            else if (after.length >= rows.length)
              failures.push(
                `${route}: searching "${term}" did not narrow the list (${rows.length} -> ${after.length})`,
              );
            else exercised.search++;
          }
        }

        /* ---- page 2 is a different page ------------------------------ */
        await open(route);
        if ((await page.locator(NEXT).count()) > 0) {
          const href = await page.locator(NEXT).first().getAttribute("href");
          const first = await listItems(page);
          /*
           * The RESULT of every wait is reported.
           *
           * Ignoring it produced the worst false alarm in this file's history:
           * the wait quietly timed out, the rows on screen were still page 1,
           * and the suite announced "page 2 repeats 60 rows from page 1" — a
           * data-integrity bug that did not exist. A slow page and a wrong page
           * are different findings and must read differently.
           */
          const reached = await clickNext(page);
          const shown =
            reached &&
            (await waitFor(
              page,
              async () => /Page\s+2\b/.test(((await page.locator(POSITION).first().textContent()) || "").trim()),
              20_000,
            ));
          const pos = ((await page.locator(POSITION).first().textContent()) || "").trim();
          const second = await listItems(page);
          const overlap = second.filter((x) => first.some((y) => y.href === x.href));
          if (!reached) failures.push(`${route}: clicking Next (${href}) never reached page=2 within 20s`);
          else if (!shown) failures.push(`${route}: URL reached page=2 but the pager still reads "${pos}" after 20s`);
          else if (!second.length) failures.push(`${route}: page 2 is empty though Next pointed at ${href}`);
          else if (overlap.length)
            failures.push(`${route}: page 2 repeats ${overlap.length} row(s) from page 1 — e.g. ${overlap[0].href}`);
          else exercised.paging++;
        }
      }

      testInfo.annotations.push({
        type: "exercised",
        description:
          `month ${DATA_MONTH} — sort ${exercised.sort}, search ${exercised.search}, ` +
          `paging ${exercised.paging}, page-reset ${exercised.reset}, list pages ${pagesWithLists}` +
          (tied.length ? ` | ordering untested (values all equal): ${tied.join("; ")}` : ""),
      });

      if (failures.length)
        throw new Error(`${role.key}: ${failures.length} control(s) misbehaved\n  ${failures.join("\n  ")}`);

      /*
       * Two floors, because the first one alone had a hole.
       *
       * The hole: "no list pages found" was treated as "this role has no
       * lists", so breaking the item selector made every page look empty, every
       * check skip, and the whole sweep pass. Mutating the selector to
       * `a.kit-row-XX` was caught by nothing — the precise failure this file
       * exists to rule out, reproduced inside the file itself.
       *
       * So: a role that can reach five or more routes MUST find a list.
       *
       * BP is exempt BY NAME, not by its route count. Every screen a BP has is
       * about its own single outlet — its sales, its campaign number, today's
       * support — so demanding a list control there would be demanding one
       * that should not exist. It used to fall under the floor by accident
       * because it reached only two routes; v189 gave it Campaigns and Sim
       * Support and the accident ended. A reason written down survives the next
       * route being added; a number does not.
       */
      if (routes.length >= 5 && !NO_LIST_ROLES.has(role.key))
        expect(
          pagesWithLists,
          `${role.key} found no list at all across ${routes.length} routes — did the item selector change?`,
        ).toBeGreaterThan(0);

      // And having found lists, it must actually have driven something on them.
      if (pagesWithLists > 0)
        expect(
          exercised.sort + exercised.search + exercised.paging,
          `${role.key} found ${pagesWithLists} list page(s) but drove no control — did a control selector change?`,
        ).toBeGreaterThan(0);
    });
  });
}

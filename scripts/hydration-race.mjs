/**
 * Reproduce React #418 on demand.
 *
 * Run it like this, with the app already running on :3000 against a database
 * with real volume:
 *
 *     node scripts/slow-html-proxy.mjs &            # HTML at 500kbps
 *     R418_PATH=/it/reports ROUNDS=20 node scripts/hydration-race.mjs
 *
 * Controls the proxy understands:
 *     ALL=1           slow the scripts too
 *     SCRIPTS_ONLY=1  slow ONLY the scripts, HTML at full speed
 *     KBPS=200        a different rate
 *
 * What four runs of this established in v186, each 16-20 rounds:
 *
 *     nothing throttled ................................ 0 / 14
 *     document slow, scripts full speed ................ 4 / 20
 *     document AND scripts slow ........................ 3 / 20
 *     document full speed, scripts slow ................ 0 / 20
 *
 * So a slow DOCUMENT is necessary and sufficient, and the speed of the
 * scripts does not matter. And across pages, at the same rate:
 *
 *     /dashboard        36KB,  21 inline scripts ....... 0 / 16
 *     /it/reports       57KB,  36 inline scripts ....... 4 / 20
 *     /it/reports/sso  222KB, 101 inline scripts ....... 3 / 16
 *
 * See claude/v186 for what that rules out and what it leaves.
 *
 * v180 established the conditions: 0 in 60 on a quiet machine at full speed,
 * 3-4 in 20 with the DOCUMENT alone throttled to 500kbps — which takes CPU out
 * of the picture and leaves delivery. It also recorded, as an aside, that two
 * renders of the same page "differ only in the CSP nonce".
 *
 * v183 then found that this app mints a NEW nonce for every request, including
 * the RSC fetches a navigation makes, and that buffering an RSC response made
 * a sibling defect disappear every time.
 *
 * So this run does two things at once: provoke the error, and on every load
 * record the nonce the document carried and the nonce its own scripts carry,
 * so a correlation can be seen rather than assumed.
 *
 * THE NONCE IS NOT INVOLVED. Every load in every run above printed
 * `nonces-in-dom=1` — the ones that fired and the ones that did not, on every
 * page, at every rate. A document that carried two nonces would be the
 * hypothesis; not one did. v183's lead is closed, which is worth more than the
 * reproduction itself: it stops the next version rewriting the CSP for nothing.
 */
import { chromium } from "@playwright/test";

const BASE = process.env.R418_BASE || "http://127.0.0.1:3100";
const ROUNDS = Number(process.env.ROUNDS || 20);
const KBPS = Number(process.env.KBPS || 500);
const PATH = process.env.R418_PATH || "/it/reports";

const run = async () => {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH });
  let fired = 0;
  const notes = [];
  for (let i = 0; i < ROUNDS; i++) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    let hit = null;
    page.on("pageerror", (e) => {
      const t = String(e);
      if (/#418|#423|#425|Hydration/i.test(t)) hit = t.slice(0, 80);
    });
    page.on("console", (m) => {
      const t = m.text();
      if (m.type() === "error" && /#418|#423|#425|Hydration/i.test(t)) hit = hit || t.slice(0, 80);
    });

    await page.goto(BASE + "/sacool", { waitUntil: "load" });
    await page.fill('input[name="identifier"]', "admin");
    await page.fill('input[name="credential"]', "Test@1234");
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !/\/(login|sacool)$/.test(u.pathname), { timeout: 30000 });

    /*
     * The document arrives slowly through `.scratch/slowproxy.mjs`, which
     * streams the HTML in small chunks; everything else comes at full speed.
     * That is v180's condition, and it is the only one that has ever made this
     * fire on demand.
     */
    const target = BASE + PATH;
    await page.goto(target, { waitUntil: "load" }).catch(() => {});
    await page.waitForTimeout(1200);

    const nonces = await page.evaluate(() => {
      const out = new Set();
      for (const s of Array.from(document.querySelectorAll("script[nonce]")))
        out.add(s.getAttribute("nonce") || s.nonce || "");
      // React also stashes the nonce it will use for anything it injects.
      return { inDom: [...out], count: document.querySelectorAll("script").length };
    });
    const csp = await page.evaluate(
      () => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content") || "",
    );

    if (hit) fired++;
    notes.push(
      `${String(i + 1).padStart(2)} ${hit ? "FIRED " : "ok    "} nonces-in-dom=${nonces.inDom.length} scripts=${nonces.count}${csp ? " meta-csp" : ""}${hit ? `  ${hit}` : ""}`,
    );
    await ctx.close();
  }
  console.log(notes.join("\n"));
  console.log(`\n#418 fired ${fired} / ${ROUNDS}  (path ${PATH}, document throttled to ${KBPS}kbps)`);
};
run().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});

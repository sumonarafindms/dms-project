import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import manifest from "../app/manifest";

/**
 * The service worker may cache build output and nothing else.
 *
 * ## Why this suite runs the worker instead of reading it
 *
 * A grep for "does not mention /api/" proves nothing: the danger is not a
 * forbidden string, it is a request reaching `respondWith` that should have
 * gone to the network. So the worker is loaded into a sandbox, its `fetch`
 * listener is captured, and real-shaped requests are put through it. The
 * assertion is behavioural — **was this request intercepted at all**.
 *
 * ## What is at stake
 *
 * Two failures, both silent:
 *
 *   - A cached HTML document outlives the session that produced it. Every page
 *     here is role-scoped from a session cookie, so on a shared handset the
 *     next person could be shown the previous user's team.
 *   - A cached API response shows figures that are a day stale as current. The
 *     feeds arrive late and are re-uploaded when a file is corrected.
 *
 * Neither raises an error or shows an empty screen. They just produce the wrong
 * answer, which is the failure mode this project has been audited for over and
 * over.
 */

const ROOT = path.join(__dirname, "..");
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const SW = read("public", "sw.js");

type FakeRequest = { url: string; method?: string; mode?: string; destination?: string };

/** Load sw.js in a sandbox and return a probe for its fetch handler. */
function loadWorker() {
  const listeners: Record<string, (event: unknown) => void> = {};
  const sandbox: Record<string, unknown> = {
    self: {
      addEventListener: (type: string, fn: (event: unknown) => void) => {
        listeners[type] = fn;
      },
      location: { origin: "https://dms.example.com" },
      skipWaiting: () => Promise.resolve(),
      clients: { claim: () => Promise.resolve() },
    },
    caches: {
      keys: () => Promise.resolve([]),
      delete: () => Promise.resolve(true),
      open: () => Promise.resolve({ match: () => Promise.resolve(undefined), put: () => Promise.resolve() }),
    },
    fetch: () => Promise.resolve({ ok: true, type: "basic", clone: () => ({}) }),
    console,
    URL,
    Promise,
  };
  vm.createContext(sandbox);
  vm.runInContext(SW, sandbox);
  expect(listeners.fetch, "sw.js registered no fetch listener").toBeTypeOf("function");

  /** True when the worker takes the request over instead of leaving it alone. */
  return function intercepts(request: FakeRequest) {
    let intercepted = false;
    listeners.fetch({
      request: { method: "GET", mode: "no-cors", destination: "script", ...request },
      respondWith: () => {
        intercepted = true;
      },
      waitUntil: () => {},
    });
    return intercepted;
  };
}

const ORIGIN = "https://dms.example.com";

describe("the service worker leaves everything dangerous alone", () => {
  const intercepts = loadWorker();

  it("never touches a navigation", () => {
    // The single most important assertion here. A page must always reach the
    // server, because the server is what decides which role may see it.
    expect(intercepts({ url: `${ORIGIN}/dashboard`, mode: "navigate", destination: "document" })).toBe(false);
    expect(intercepts({ url: `${ORIGIN}/rso/retailers`, mode: "navigate", destination: "document" })).toBe(false);
    expect(intercepts({ url: `${ORIGIN}/`, mode: "navigate", destination: "document" })).toBe(false);
  });

  it("never touches an API response", () => {
    for (const p of ["/api/dashboard/summary", "/api/dashboard/comparison?kind=week", "/api/auth/logout"])
      expect(intercepts({ url: `${ORIGIN}${p}` }), p).toBe(false);
  });

  it("refuses a navigation even to a path that IS on the allowlist", () => {
    /*
     * This is what proves the navigation guard does something.
     *
     * The three assertions above pass on the allowlist alone — `/dashboard` is
     * not under `/_next/static/`, so it is never a candidate. Deleting the
     * navigation check entirely left them all green, which meant the guard was
     * untested. Opening an icon URL directly IS a navigation to an allowlisted
     * path, so it exercises the belt rather than the braces.
     *
     * It matters because the allowlist is the thing most likely to grow. The
     * day someone adds a prefix that can serve a document, this check is what
     * stands between that and a cached page.
     */
    expect(intercepts({ url: `${ORIGIN}/icons/icon-192.png`, mode: "navigate", destination: "document" })).toBe(false);
  });

  it("never touches a document that does not announce itself as one", () => {
    // A page fetched by the router arrives as an RSC payload, not a navigation.
    // It is still role-scoped output and still must not be cached.
    expect(intercepts({ url: `${ORIGIN}/supervisor`, destination: "" })).toBe(false);
    expect(intercepts({ url: `${ORIGIN}/it/reports`, destination: "" })).toBe(false);
  });

  it("never touches a non-GET request", () => {
    // Replaying a POST from cache would be a duplicate upload or save.
    for (const method of ["POST", "PUT", "PATCH", "DELETE"])
      expect(intercepts({ url: `${ORIGIN}/_next/static/chunks/a.js`, method }), method).toBe(false);
  });

  it("never touches another origin", () => {
    // A cross-origin response can be opaque, so its status cannot be read and
    // an error could be stored forever.
    expect(intercepts({ url: "https://cdn.example.net/_next/static/chunks/a.js" })).toBe(false);
  });

  it("never touches the image optimiser, which proxies arbitrary URLs", () => {
    expect(intercepts({ url: `${ORIGIN}/_next/image?url=%2Fx.png&w=64&q=75` })).toBe(false);
  });

  it("ignores a static path carrying a query string", () => {
    // A query means it is not the immutable thing the path implies.
    expect(intercepts({ url: `${ORIGIN}/_next/static/chunks/a.js?v=2` })).toBe(false);
  });
});

describe("the service worker does cache build output", () => {
  const intercepts = loadWorker();

  it("handles hashed JavaScript, CSS and fonts", () => {
    for (const p of [
      "/_next/static/chunks/abc123.js",
      "/_next/static/css/abc123.css",
      "/_next/static/media/font.woff2",
    ])
      expect(intercepts({ url: `${ORIGIN}${p}` }), p).toBe(true);
  });

  it("handles the home-screen icons", () => {
    expect(intercepts({ url: `${ORIGIN}/icons/icon-192.png` })).toBe(true);
  });
});

describe("the worker is written as an allowlist", () => {
  it("decides by prefix rather than by exclusion", () => {
    // A denylist would make every new kind of request cacheable by default,
    // which is the wrong way round for something this hard to withdraw.
    expect(SW).toMatch(/const CACHEABLE = \[/);
    expect(SW).toMatch(/CACHEABLE\.some\(/);
  });

  it("stores only clean same-origin 200s", () => {
    // Caching a 404 or a redirect would serve it for the life of the cache.
    expect(SW).toMatch(/response\.ok && response\.type === "basic"/);
  });

  it("drops older caches when a new version activates", () => {
    // Without this every deploy leaves its predecessor's chunks on the device.
    expect(SW).toMatch(/caches\.keys\(\)/);
    expect(SW).toMatch(/caches\.delete/);
  });

  it("precaches nothing", () => {
    // A precache list would have to guess the build's hashed filenames, and one
    // wrong entry fails the whole install.
    expect(SW).not.toMatch(/cache\.addAll/);
  });
});

describe("the manifest", () => {
  const m = manifest();

  it("is installable: name, icons, start_url and display", () => {
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.start_url).toBeTruthy();
    expect(m.display).toBe("standalone");
  });

  it("starts at a page every role can open", () => {
    // Most roles cannot open /dashboard; an installed app whose first screen is
    // a permission error is a bad opening.
    expect(m.start_url).toBe("/login");
  });

  it("offers both a plain and a maskable icon at 192 and 512", () => {
    const icons = m.icons ?? [];
    for (const purpose of ["any", "maskable"])
      for (const size of ["192x192", "512x512"])
        expect(
          icons.some((i) => i.sizes === size && i.purpose === purpose),
          `${purpose} ${size}`,
        ).toBe(true);
  });

  it("points at icons that exist on disk", () => {
    // A manifest naming a missing icon fails installation with no visible
    // error beyond a console warning nobody reads.
    for (const icon of manifest().icons ?? [])
      expect(fs.existsSync(path.join(ROOT, "public", String(icon.src))), String(icon.src)).toBe(true);
  });

  it("uses the kit's own teal rather than a new colour", () => {
    expect(m.theme_color).toBe("#0d9488");
  });
});

describe("the pieces the browser needs are wired up", () => {
  const layout = read("app", "layout.tsx");

  it("registers the worker from the layout", () => {
    expect(layout).toMatch(/<ServiceWorker \/>/);
  });

  it("still declares the tab icon after adding the apple one", () => {
    /*
     * Declaring `icons` in metadata at all overrides Next's app/icon.svg file
     * convention. Adding only `apple` silently removed <link rel="icon">, the
     * tab icon vanished, and every page load fell back to probing
     * /favicon.ico and logging a 404 — the exact state app/icon.svg was
     * created to fix.
     *
     * The E2E console-error check caught it. This is the cheaper guard.
     */
    expect(layout).toMatch(/icon:\s*"\/icon\.svg"/);
    expect(fs.existsSync(path.join(ROOT, "app", "icon.svg"))).toBe(true);
  });

  it("gives iOS the apple-touch-icon it reads instead of the manifest", () => {
    expect(layout).toMatch(/apple-touch-icon\.png/);
    expect(fs.existsSync(path.join(ROOT, "public", "icons", "apple-touch-icon.png"))).toBe(true);
  });

  it("does not disable pinch zoom", () => {
    // `maximum-scale=1` is the usual way an app "fixes" its layout, and it
    // stops a low-vision operator zooming in to read a figure.
    expect(layout).not.toMatch(/maximumScale/);
    expect(layout).not.toMatch(/userScalable/);
  });

  it("serves sw.js so a bad worker can be withdrawn", () => {
    // A browser holding an old copy keeps serving an old caching policy. This
    // is the one header that makes a mistake here recoverable.
    const config = read("next.config.mjs");
    expect(config).toMatch(/source: "\/sw\.js"/);
    expect(config).toMatch(/no-cache/);
  });

  it("allows a worker and a manifest under the CSP", () => {
    const csp = read("lib", "csp.ts");
    expect(csp).toMatch(/worker-src/);
    expect(csp).toMatch(/manifest-src/);
  });
});

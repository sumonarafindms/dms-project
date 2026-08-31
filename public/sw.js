/**
 * Service worker — static assets ONLY.
 *
 * ## The rule, and why it is absolute
 *
 * This worker may cache build output: hashed JavaScript, CSS, fonts and the app
 * icons. It must never cache an HTML document or an API response. Both would
 * break the app in ways that produce no error and no empty screen:
 *
 *   - **HTML.** Every page is rendered per-request and scoped to the signed-in
 *     user's role. A cached page outlives the session that produced it, so on a
 *     shared handset the next person to open the app could be shown the
 *     previous user's team.
 *   - **API responses.** The GA, C2C, C2S and OB feeds arrive a day late and
 *     are re-uploaded when a file is corrected. A cached response shows
 *     yesterday's figures as today's, confidently.
 *
 * That second failure is the one this project keeps being audited for: output
 * that looks correct and is not. A faster page is not worth reintroducing it.
 *
 * ## How the rule is enforced
 *
 * By an allowlist, not a denylist. `fetch` returns early — without calling
 * `respondWith` at all — for everything that is not a known-immutable static
 * path, which hands the request straight back to the browser as though this
 * worker did not exist. Adding a new kind of request cannot accidentally make
 * it cacheable; someone would have to add its prefix to CACHEABLE on purpose.
 *
 * Cache-first is safe here only because these URLs are content-hashed by the
 * build: `/_next/static/chunks/abc123.js` never changes meaning. A new deploy
 * produces new filenames, and the old cache is dropped on activate.
 *
 * ## Updating
 *
 * Bump CACHE. `next.config.mjs` serves this file with `Cache-Control:
 * no-cache`, so the browser revalidates it on every load and a changed worker
 * is picked up on the next navigation rather than whenever an old copy happens
 * to expire.
 */

const CACHE = "dms-static-v1";

/**
 * The only prefixes this worker will serve from cache.
 *
 * `/_next/static/` is Next's build output, content-hashed.
 * `/icons/` is the generated home-screen icon set, which changes only when the
 * mark is redrawn.
 *
 * Nothing else belongs here. In particular NOT `/_next/image` (it proxies
 * arbitrary URLs), NOT `/api/`, and NOT `/`.
 */
const CACHEABLE = ["/_next/static/", "/icons/"];

self.addEventListener("install", (event) => {
  // No precache list: the build's filenames are unknown to this file, and a
  // wrong guess would 404 the whole install. Assets land in the cache as they
  // are first requested, which costs one uncached load and cannot break.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop every older version. Without this, each deploy leaves its
      // predecessor's chunks on the device for good.
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  // Lets the page ask a waiting worker to take over immediately after a deploy.
  if (event.data === "skip-waiting") self.skipWaiting();
});

function isCacheable(request) {
  // Only plain GETs. A POST is an action; replaying one from cache would be a
  // duplicate upload or a duplicate save.
  if (request.method !== "GET") return false;

  // Only this origin. A cross-origin response can be opaque, which means its
  // status cannot be read — caching one risks storing an error forever.
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;

  // Never a navigation, whatever its path. This is the belt to the allowlist's
  // braces: a page request must always reach the server, because the server is
  // what decides which role may see it.
  if (request.mode === "navigate" || request.destination === "document") return false;

  // A query string on a static asset means it is not the immutable thing the
  // path implies.
  if (url.search) return false;

  return CACHEABLE.some((prefix) => url.pathname.startsWith(prefix));
}

self.addEventListener("fetch", (event) => {
  // No respondWith: the browser handles it exactly as it would with no worker
  // installed. Every document and every API call takes this path.
  if (!isCacheable(event.request)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(event.request);
      if (hit) return hit;

      const response = await fetch(event.request);
      // Only a clean, non-opaque 200 is worth keeping. Storing a 404 or a
      // redirect would serve it for the life of the cache.
      if (response.ok && response.type === "basic") cache.put(event.request, response.clone());
      return response;
    })(),
  );
});

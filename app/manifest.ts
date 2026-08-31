import type { MetadataRoute } from "next";

/**
 * Web app manifest — what makes DMS installable to a phone's home screen.
 *
 * The point is the field staff. An RSO opening this from the home screen gets
 * the app without the browser's address bar and tabs eating a fifth of a small
 * screen, and it looks like the tool it is rather than a bookmark.
 *
 * ## What this deliberately does NOT enable
 *
 * Offline use. A manifest alone never provided it, and `public/sw.js` caches
 * static assets only — no HTML, no API responses. That is a decision, not an
 * omission:
 *
 *   - Every page here is role-scoped from a session cookie. A cached page
 *     survives a logout, so the next person to open the app on a shared handset
 *     could be shown the previous user's team.
 *   - The feeds arrive a day late. A cached figure presented as current is a
 *     wrong number with no error and no empty screen — the exact failure this
 *     project has been audited for repeatedly.
 *
 * Offline is worth revisiting only with a design that answers both, and "the
 * page did not load" is a better outcome than a confident stale figure.
 *
 * ## `display: standalone`, not `fullscreen`
 *
 * `fullscreen` hides the status bar, so the operator loses the clock, the
 * battery and the signal strength — on a field device those matter more than
 * the strip of screen they occupy.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DMS — Distribution Management",
    short_name: "DMS",
    description: "Daily GA, recharge and target performance for the distribution team.",
    // The login page, not /dashboard: most roles cannot open /dashboard, and an
    // installed app whose first screen is a permission error is a bad opening.
    // Anyone with a live session is redirected onward from here anyway.
    start_url: "/login",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Matches --color-teal-600, so the system chrome continues the app rather
    // than framing it in browser grey.
    theme_color: "#0d9488",
    // The splash background. Slate-50 from the kit, which is the page ground —
    // a white splash flashes brighter than the app that follows it.
    background_color: "#f8fafc",
    lang: "en",
    dir: "ltr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Maskable icons are inset to Android's 80% safe zone, so a launcher may
      // crop them to a circle or squircle without shaving the artwork.
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

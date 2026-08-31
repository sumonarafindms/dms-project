/** @type {import('next').NextConfig} */

const isProduction = process.env.NODE_ENV === "production";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Superseded by the CSP's frame-ancestors in modern browsers; kept as the
  // fallback for ones that do not implement it.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// HSTS is production-only on purpose. Sent on plain http it is ignored, but
// sent from a local dev server on localhost it can pin the whole origin to
// https in the developer's browser and make every other localhost project
// unreachable until they clear it by hand.
//
// The policy deliberately omits `preload`: submitting to the preload list is
// effectively irreversible, and that is a decision to make once the production
// domain and all its subdomains are settled, not a default to inherit.
if (isProduction)
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  });

const nextConfig = {
  poweredByHeader: false,
  compress: true,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // The service worker must be revalidated on every load, or a browser
        // holding an old copy keeps serving an old caching policy — the classic
        // way a bad worker becomes hard to withdraw. `no-cache` means "ask
        // first", not "do not store", so the check is a cheap 304.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, must-revalidate" },
          // Lets the worker control the whole origin from /sw.js. It already
          // registers with scope "/", and this is what permits that.
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Content-hashed by the icon build, but referenced by a stable name, so
        // a day is the compromise: long enough that a phone is not refetching
        // them, short enough that a new mark appears without a reinstall.
        source: "/icons/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
      },
    ];
  },
};

export default nextConfig;

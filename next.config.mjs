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
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

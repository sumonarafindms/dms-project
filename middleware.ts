import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRequestOrigin } from "./lib/csrf";
import { contentSecurityPolicy, cspHeaderName, generateNonce } from "./lib/csp";

/**
 * Three jobs, in order of how badly each fails:
 *
 * 1. Reject cross-site state-changing requests before they reach a handler.
 * 2. Redirect the bare root to the login page (the original job).
 * 3. Attach a per-request CSP nonce and policy to HTML responses.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. CSRF defence in depth. Every mutation in this app is an /api route —
  // there are no server actions — so this covers all of them.
  if (pathname.startsWith("/api/")) {
    const check = checkRequestOrigin(req.method, req.headers.get("sec-fetch-site"), req.headers.get("origin"), [
      req.nextUrl.host,
      req.headers.get("host"),
      req.headers.get("x-forwarded-host"),
    ]);
    if (!check.allowed) {
      console.warn(`blocked cross-site ${req.method} ${pathname} (${check.reason})`);
      return NextResponse.json(
        { error: "Cross-site request blocked." },
        { status: 403, headers: { "cache-control": "no-store" } },
      );
    }
    return NextResponse.next();
  }

  // 3a. The nonce has to be on the *request* headers: Next.js reads the CSP
  // header off the incoming request and stamps its nonce onto the scripts it
  // renders. Setting it only on the response would leave those scripts
  // unnonced, and the policy would block the app's own hydration.
  const nonce = generateNonce();
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV === "production");
  const headerName = cspHeaderName();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(headerName, csp);
  requestHeaders.set("x-nonce", nonce);

  // 2. The original redirect.
  if (pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // 3b. And on the response, which is what the browser actually enforces.
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set(headerName, csp);
  return res;
}

export const config = {
  matcher: [
    /*
     * Everything except the build output and static files. `_next/static` and
     * `_next/image` are immutable and carry no scripts of their own, and a
     * request for a file with an extension is an asset, not a document.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)",
  ],
};

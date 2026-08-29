import { describe, expect, it } from "vitest";
import { checkRequestOrigin, SAFE_METHODS } from "../lib/csrf";
import { contentSecurityPolicy, cspHeaderName } from "../lib/csp";

/**
 * The security hardening added after the 2026-08-29 audit. Each test names the
 * attack or the outage it exists to prevent.
 */

const HOSTS = ["dms.example.com", "dms.example.com", null];

describe("cross-site request rejection", () => {
  it("never blocks a read", () => {
    for (const method of SAFE_METHODS)
      expect(checkRequestOrigin(method, "cross-site", "https://evil.example", HOSTS).allowed).toBe(true);
  });

  it("blocks a state-changing request from another site", () => {
    // The attack: a form on evil.example auto-POSTing to /api/... in a browser
    // that still carries the session cookie.
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(checkRequestOrigin(method, "cross-site", "https://evil.example", HOSTS).allowed).toBe(false);
      // Same request from an older browser that sends no Sec-Fetch-Site.
      expect(checkRequestOrigin(method, null, "https://evil.example", HOSTS).allowed).toBe(false);
    }
  });

  it("allows the app's own writes", () => {
    expect(checkRequestOrigin("POST", "same-origin", "https://dms.example.com", HOSTS).allowed).toBe(true);
    expect(checkRequestOrigin("POST", "same-site", "https://app.example.com", HOSTS).allowed).toBe(true);
    expect(checkRequestOrigin("POST", null, "https://dms.example.com", HOSTS).allowed).toBe(true);
    // Case and port variations of the same host must not read as an attack.
    expect(checkRequestOrigin("POST", null, "https://DMS.EXAMPLE.COM", HOSTS).allowed).toBe(true);
    expect(checkRequestOrigin("POST", null, "http://localhost:3000", ["localhost:3000"]).allowed).toBe(true);
  });

  it("allows a request with no initiating page at all", () => {
    // curl, a health probe, a typed URL. CSRF requires an attacker's page,
    // which always produces `cross-site`; blocking these would break tooling
    // without protecting anything.
    expect(checkRequestOrigin("POST", "none", null, HOSTS).allowed).toBe(true);
    expect(checkRequestOrigin("POST", null, null, HOSTS).allowed).toBe(true);
    expect(checkRequestOrigin("POST", null, "null", HOSTS).allowed).toBe(true);
  });

  it("trusts Sec-Fetch-Site over Origin when both are present", () => {
    // Sec-Fetch-Site is set by the browser and unreachable from page script,
    // so a forged Origin must not be able to talk its way past it.
    expect(checkRequestOrigin("POST", "cross-site", "https://dms.example.com", HOSTS).allowed).toBe(false);
  });

  it("survives a proxy that rewrites the host", () => {
    // On Vercel the URL host and the forwarded host can differ; rejecting on
    // that would be an outage, not a defence.
    expect(
      checkRequestOrigin("POST", null, "https://dms.example.com", ["dms-abc123.vercel.app", null, "dms.example.com"])
        .allowed,
    ).toBe(true);
  });

  it("rejects an origin it cannot parse", () => {
    expect(checkRequestOrigin("POST", null, "not a url", HOSTS).allowed).toBe(false);
  });
});

describe("content security policy", () => {
  const nonce = "dGVzdC1ub25jZS12YWx1ZQ==";
  const policy = contentSecurityPolicy(nonce, true);
  const dev = contentSecurityPolicy(nonce, false);
  const directive = (name: string) => policy.split("; ").find((d) => d === name || d.startsWith(`${name} `)) ?? "";

  it("carries the request's nonce so Next.js can stamp its own scripts", () => {
    // Without this, the policy blocks the app's own hydration bootstrap and
    // every page renders as dead HTML.
    expect(directive("script-src")).toContain(`'nonce-${nonce}'`);
  });

  it("does not allow inline script", () => {
    // The whole point. 'strict-dynamic' is how Next's chunk loading survives
    // without it.
    expect(directive("script-src")).not.toContain("'unsafe-inline'");
    expect(directive("script-src")).not.toContain("'unsafe-eval'");
    expect(directive("script-src")).toContain("'strict-dynamic'");
  });

  it("locks down the directives that matter for injection", () => {
    expect(directive("object-src")).toBe("object-src 'none'");
    expect(directive("base-uri")).toBe("base-uri 'self'");
    expect(directive("form-action")).toBe("form-action 'self'");
    expect(directive("frame-ancestors")).toBe("frame-ancestors 'self'");
    expect(directive("default-src")).toBe("default-src 'self'");
    // No third-party origin has any business being in this policy: the app
    // talks only to itself.
    expect(policy).not.toMatch(/https?:\/\//);
  });

  it("still permits what the app genuinely does", () => {
    // Inlined icons and client-generated spreadsheet downloads.
    expect(directive("img-src")).toContain("data:");
    expect(directive("img-src")).toContain("blob:");
    // ~136 style={{...}} props become style attributes during SSR, and a
    // nonce cannot apply to an attribute. Phase 4 converts them to classes.
    expect(directive("style-src-attr")).toContain("'unsafe-inline'");
  });

  it("only upgrades to https in production", () => {
    // On a plain-http dev server this directive breaks every asset request.
    expect(policy).toContain("upgrade-insecure-requests");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });

  it("is still Report-Only", () => {
    // A deliberate tripwire. Flipping this to enforcement is a real decision
    // that needs the checklist in SECURITY.md run against a live deployment
    // first, so it should not happen by accident in a refactor.
    expect(cspHeaderName()).toBe("Content-Security-Policy-Report-Only");
  });
});

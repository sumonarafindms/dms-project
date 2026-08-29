/**
 * Content-Security-Policy for the app's HTML responses.
 *
 * Built here as a pure string function so the policy can be asserted in tests
 * rather than eyeballed in a header dump.
 *
 * ## Why this ships as Report-Only first
 *
 * A CSP that blocks something the app needs takes the app down, and it does it
 * in the browser, where no server test would have caught it. The correct
 * rollout is therefore: report first, read the reports from real page loads,
 * then enforce. `cspHeaderName()` is the single switch, and flipping it is the
 * whole change — see SECURITY.md for the checklist that must pass first.
 *
 * ## Why a nonce
 *
 * Next.js emits inline bootstrap scripts (the `self.__next_f.push(...)` payload
 * that carries the RSC stream). Allowing those with `'unsafe-inline'` would
 * allow every injected script too, which is most of what a CSP is for. Instead
 * middleware mints a per-request nonce; Next.js reads it back out of the CSP
 * header it receives on the request and stamps it onto its own script tags.
 * `'strict-dynamic'` then lets those trusted scripts load the chunk files they
 * need without the policy having to enumerate them.
 *
 * ## Why styles are still `'unsafe-inline'`
 *
 * The app uses ~136 `style={{...}}` props, which React serialises into `style`
 * attributes during SSR, and CSP treats a style attribute as inline style.
 * Nonces do not apply to attributes at all, so the only ways to remove this are
 * to convert every one of those props to a class, or to hash nothing and break
 * the layout. Converting them is Phase 4 of the audit plan; until then the
 * honest policy says `'unsafe-inline'` for style and nothing else.
 */

const SELF = "'self'";

/** Build the policy string for one request. */
export function contentSecurityPolicy(nonce: string, isProduction: boolean) {
  const directives: string[] = [
    `default-src ${SELF}`,
    // 'strict-dynamic' makes browsers that understand it ignore the host list
    // below; 'self' is kept for older browsers that do not.
    `script-src ${SELF} 'nonce-${nonce}' 'strict-dynamic'`,
    // See the note above: style attributes cannot carry a nonce.
    `style-src ${SELF} 'unsafe-inline'`,
    `style-src-attr 'unsafe-inline'`,
    // data: for inlined icons, blob: for client-generated file downloads.
    `img-src ${SELF} data: blob:`,
    `font-src ${SELF} data:`,
    // The app talks only to itself. No analytics, no CDN, no third-party API.
    `connect-src ${SELF}`,
    // Spreadsheet exports are handed to the browser as blob: URLs.
    `worker-src ${SELF} blob:`,
    `manifest-src ${SELF}`,
    `media-src ${SELF}`,
    // No plugins, no <base> rewriting, no posting this app's forms elsewhere.
    `object-src 'none'`,
    `base-uri ${SELF}`,
    `form-action ${SELF}`,
    // Matches the existing X-Frame-Options: SAMEORIGIN, which this supersedes
    // in every browser that supports frame-ancestors.
    `frame-ancestors ${SELF}`,
    `frame-src 'none'`,
  ];
  // Only meaningful over HTTPS, and locally it would break plain-http dev.
  if (isProduction) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

/**
 * Which header the policy is sent under.
 *
 * Report-Only until the checklist in SECURITY.md has been run against a real
 * deployment. Next.js honours the nonce under either name, so switching to
 * enforcement changes nothing else.
 */
export function cspHeaderName(): "Content-Security-Policy" | "Content-Security-Policy-Report-Only" {
  return "Content-Security-Policy-Report-Only";
}

/** 128 bits, base64. Edge runtime has WebCrypto and `btoa`. */
export function generateNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

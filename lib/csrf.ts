/**
 * Origin / Sec-Fetch-Site validation for state-changing requests.
 *
 * This is defence in depth, not the primary control: the session cookie is
 * already `SameSite=Lax`, which stops a cross-site form POST from carrying it.
 * The gap Lax leaves is real but narrow — a same-site subdomain, a browser that
 * mishandles Lax, or a future cookie change — and the cost of closing it is one
 * header comparison, so it is worth closing.
 *
 * The logic lives here as a pure function over primitives so it can be tested
 * exhaustively without booting the app or forging a NextRequest.
 */

/** Methods that cannot change state, so are never checked. */
export const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export type OriginCheck = {
  allowed: boolean;
  /** Why, for the log line and the test name. Never sent to the client. */
  reason: string;
};

/** The host part of an Origin header, lowercased. `null` if unparseable. */
function originHost(origin: string): string | null {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Decide whether a request may change state.
 *
 * @param method       HTTP method.
 * @param secFetchSite The `Sec-Fetch-Site` header, if the browser sent one.
 * @param origin       The `Origin` header, if present.
 * @param hosts        Every host this request could legitimately name — the
 *                     URL's own host plus `Host` / `X-Forwarded-Host`, because
 *                     behind a proxy those can differ and rejecting on that
 *                     would break the app rather than protect it.
 */
export function checkRequestOrigin(
  method: string,
  secFetchSite: string | null,
  origin: string | null,
  hosts: (string | null | undefined)[],
): OriginCheck {
  if (SAFE_METHODS.has(method.toUpperCase())) return { allowed: true, reason: "safe method" };

  // Sec-Fetch-Site is set by the browser itself and cannot be forged by page
  // script, so when it is present it is the better signal and is used alone.
  if (secFetchSite) {
    const site = secFetchSite.toLowerCase();
    // `none` means no initiating page at all — a typed URL, a curl, a health
    // probe. CSRF needs an attacker's page, which always yields `cross-site`.
    if (site === "same-origin" || site === "same-site" || site === "none")
      return { allowed: true, reason: `sec-fetch-site: ${site}` };
    return { allowed: false, reason: `sec-fetch-site: ${site}` };
  }

  // No Sec-Fetch-Site: an older browser or a non-browser client. Browsers
  // always send Origin on a state-changing request, so a missing Origin here
  // means a non-browser client, which is not what CSRF exploits.
  if (!origin || origin === "null") return { allowed: true, reason: "no origin header" };

  const from = originHost(origin);
  if (!from) return { allowed: false, reason: "unparseable origin" };

  const known = hosts.filter((h): h is string => Boolean(h)).map((h) => h.toLowerCase());
  if (known.includes(from)) return { allowed: true, reason: "origin matches host" };
  return { allowed: false, reason: "origin does not match host" };
}

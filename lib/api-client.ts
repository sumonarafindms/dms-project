/**
 * One way for the browser to call this app's API, and one way for it to fail.
 *
 * ## The bug this exists for
 *
 * Thirty of the thirty-five `fetch` calls in client components had no `try`
 * around them and no timeout. On a desk with office wi-fi that is invisible.
 * On a phone in the field — which is where about nine in ten of this app's
 * users are — it is the normal case, and it looked like this:
 *
 *     await fetch("/api/targets")   // rejects when the signal drops
 *     setLoading(false)             // never runs
 *
 * The rejection was unhandled, so nothing was logged and nothing was shown. The
 * page simply said **"Loading targets…"** for as long as the operator was
 * willing to look at it. A failed Save did the same thing: the button stayed
 * disabled, said "Saving…", and the typed numbers sat there unsaved with no
 * indication that anything had gone wrong. The only way out was to reload — and
 * an operator with no reason to suspect a failure has no reason to reload.
 *
 * `await res.json()` was the second half of it. Any response that is not JSON —
 * a gateway's HTML error page, a 502 from the platform, an empty body — threw
 * in exactly the same way, with exactly the same result.
 *
 * ## What this does about it
 *
 * `apiFetch` never throws and never hangs. It returns a result the caller must
 * look at, so the "forgot to handle it" case is a type error rather than a
 * frozen screen:
 *
 *     const r = await apiFetch<{ rows: Row[] }>("/api/targets?month=" + month);
 *     setLoading(false);
 *     if (!r.ok) return setMessage(r.message);
 *     setRows(r.data.rows);
 *
 * Every failure arrives as a sentence an operator can act on. Not "TypeError:
 * Failed to fetch", and not "Unauthorized" — which is what a expired session
 * used to put on screen, and which tells a field operator nothing about what
 * they should do next.
 */

/** How long to wait before deciding the network is not coming back. */
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Uploads get much longer. A 20 MB workbook over 3G is slow but not broken, and
 * cutting it off at thirty seconds would turn a working upload into a mystery.
 */
export const UPLOAD_TIMEOUT_MS = 180_000;

export const OFFLINE_MESSAGE = "No connection. Check your internet and try again.";
export const TIMEOUT_MESSAGE = "The server did not respond in time. Check your connection and try again.";
export const EXPIRED_MESSAGE = "Your session has expired. Please reload the page and sign in again.";
export const UNREADABLE_MESSAGE = "The server sent an unexpected response. Please try again.";

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; message: string; expired: boolean; offline: boolean };

type Options = RequestInit & { timeoutMs?: number };

function failure(status: number, message: string, extra?: { expired?: boolean; offline?: boolean }) {
  return { ok: false as const, status, message, expired: !!extra?.expired, offline: !!extra?.offline };
}

/**
 * Reads a JSON body without trusting that there is one.
 *
 * A 204, an empty 200, and an HTML error page all reach here, and `res.json()`
 * throws on every one of them.
 */
async function readJson(res: Response): Promise<{ parsed: boolean; value: unknown }> {
  let text: string;
  try {
    text = await res.text();
  } catch {
    return { parsed: false, value: null };
  }
  if (!text.trim()) return { parsed: true, value: null };
  try {
    return { parsed: true, value: JSON.parse(text) };
  } catch {
    return { parsed: false, value: null };
  }
}

/** The server's own message, when it sent one worth showing. */
function serverMessage(value: unknown): string | null {
  if (value && typeof value === "object") {
    const e = (value as { error?: unknown }).error;
    if (typeof e === "string" && e.trim()) return e.trim();
  }
  return null;
}

/**
 * Words that are a status code spelled out, not an explanation.
 *
 * Every route in this app answers a missing or expired session with the literal
 * string "Unauthorized", which is the message that used to reach the operator.
 * Replacing it with something actionable is most of the point of this module —
 * but a 401 is ALSO what a wrong PIN returns, and there the server's own
 * "Invalid login credentials." is exactly right. Telling someone who mistyped
 * their PIN that their session expired would be a worse bug than the one this
 * file fixes, so the rule is narrow: the server's sentence always wins, unless
 * the server sent one of these.
 */
const PLACEHOLDER_MESSAGES = new Set(["unauthorized", "forbidden", "not authorized", "access denied"]);

function isPlaceholder(message: string | null) {
  return !message || PLACEHOLDER_MESSAGES.has(message.toLowerCase().replace(/[.!]+$/, ""));
}

export async function apiFetch<T = unknown>(input: string, options: Options = {}): Promise<ApiResult<T>> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = options;

  /*
   * The timeout is not decoration. `fetch` on a phone that has drifted out of
   * coverage does not reject promptly — it can sit for minutes, which to the
   * operator is indistinguishable from the frozen screen this replaces.
   */
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  /*
   * The caller's own signal has to be forwarded, not replaced.
   *
   * The dashboard aborts its in-flight request when the month changes, and it
   * does that through a signal it passes in. Overwriting `signal` with the
   * timeout's would have silently disabled that — the request would run to
   * completion and a stale month's rows could land on top of the new ones. So
   * the caller's abort is chained onto ours instead.
   */
  const caller = init.signal;
  const relay = () => controller.abort();
  if (caller) {
    if (caller.aborted) controller.abort();
    else caller.addEventListener("abort", relay, { once: true });
  }

  let res: Response;
  try {
    res = await fetch(input, { ...init, signal: controller.signal });
  } catch {
    // A caller's own abort is a deliberate cancel, not a failure worth showing.
    if (caller?.aborted) return failure(0, "", {});
    const timedOut = controller.signal.aborted;
    return failure(0, timedOut ? TIMEOUT_MESSAGE : OFFLINE_MESSAGE, { offline: !timedOut });
  } finally {
    clearTimeout(timer);
    caller?.removeEventListener("abort", relay);
  }

  const body = await readJson(res);

  const message = serverMessage(body.value);

  if (!res.ok) {
    if ((res.status === 401 || res.status === 403) && isPlaceholder(message))
      return failure(res.status, EXPIRED_MESSAGE, { expired: true });
    if (message) return failure(res.status, message);
    if (!body.parsed) return failure(res.status, UNREADABLE_MESSAGE);
    return failure(res.status, `Request failed (${res.status}). Please try again.`);
  }

  if (!body.parsed) return failure(res.status, UNREADABLE_MESSAGE);
  return { ok: true, status: res.status, data: body.value as T };
}

/** `apiFetch` for the common case of sending JSON. */
export function apiSend<T = unknown>(input: string, method: string, body: unknown, options: Options = {}) {
  return apiFetch<T>(input, {
    ...options,
    method,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    body: JSON.stringify(body),
  });
}

/** `apiFetch` for a file upload, with the long timeout an upload needs. */
export function apiUpload<T = unknown>(input: string, form: FormData, options: Options = {}) {
  return apiFetch<T>(input, { timeoutMs: UPLOAD_TIMEOUT_MS, ...options, method: "POST", body: form });
}

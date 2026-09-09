import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { rel as relativeTo } from "./paths";
import {
  EXPIRED_MESSAGE,
  OFFLINE_MESSAGE,
  TIMEOUT_MESSAGE,
  UNREADABLE_MESSAGE,
  apiFetch,
  apiSend,
  apiUpload,
} from "../lib/api-client";

/**
 * The browser can always tell the operator what happened.
 *
 * ## The bug
 *
 * Thirty of the thirty-five `fetch` calls in client components had no `try`
 * around them. Reproduced in a real browser, on a 390px viewport, by aborting
 * the request the way a phone losing signal does:
 *
 *     /targets  →  "Loading targets…"   forever, no error, no retry
 *
 * `setLoading(false)` came after the `await`, so a rejected fetch skipped it.
 * Nothing was logged, because an unhandled rejection in an event handler is
 * silent. A failed Save behaved the same way: the button stayed disabled saying
 * "Saving…", and the typed numbers were never sent.
 *
 * ## What is guarded here
 *
 * Two halves, and the second is the one that keeps the fix alive: the helper
 * behaves, AND no client component is allowed to call `fetch` directly again.
 * A rule enforced only by whoever writes the next component is not a rule.
 */

const ROOT = path.join(__dirname, "..");
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.unstubAllGlobals();
});

/** A server that answers with exactly this. */
function serve(status: number, body: string, contentType = "application/json") {
  // A 204 may not carry a body at all — `new Response("", { status: 204 })`
  // throws, and a throwing stub would look exactly like a dead network.
  const payload = body === "" ? null : body;
  globalThis.fetch = vi.fn(
    async () => new Response(payload, { status, headers: { "content-type": contentType } }),
  ) as never;
}

/** A network that is not there. */
function unreachable() {
  globalThis.fetch = vi.fn(async () => {
    throw new TypeError("Failed to fetch");
  }) as never;
}

describe("apiFetch never throws", () => {
  it("turns a dead network into a sentence", async () => {
    unreachable();
    const r = await apiFetch("/api/targets");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toBe(OFFLINE_MESSAGE);
    expect(r.offline).toBe(true);
    // Not "TypeError: Failed to fetch", which is what a `catch (e) { e.message }`
    // would have put on screen.
    expect(r.message).not.toMatch(/fetch|TypeError/i);
  });

  it("does not reject, so the caller's loading flag always resets", async () => {
    /*
     * The actual defect, expressed as a property. Everything else in this file
     * is detail; this is the line that was false.
     */
    unreachable();
    let loading = true;
    await apiFetch("/api/targets");
    loading = false;
    expect(loading).toBe(false);
    await expect(apiFetch("/api/targets")).resolves.toBeTruthy();
  });

  it("survives a response that is not JSON", async () => {
    // A platform 502 is an HTML page. `res.json()` threw on it exactly the way
    // a dead network did, and the screen froze the same way.
    serve(502, "<html><body>Bad Gateway</body></html>", "text/html");
    const r = await apiFetch("/api/targets");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(UNREADABLE_MESSAGE);
  });

  it("survives an empty body on a success", async () => {
    serve(204, "");
    const r = await apiFetch("/api/thing", { method: "DELETE" });
    expect(r.ok).toBe(true);
  });

  it("gives up rather than hanging", async () => {
    /*
     * A phone that has drifted out of coverage does not fail fast — `fetch` can
     * sit for minutes, which to the operator is the same frozen screen. So the
     * helper aborts itself.
     */
    globalThis.fetch = vi.fn(
      (_i: unknown, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    ) as never;
    const r = await apiFetch("/api/slow", { timeoutMs: 40 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toBe(TIMEOUT_MESSAGE);
      expect(r.offline, "a timeout is not the same as being offline").toBe(false);
    }
  });

  it("still lets the caller cancel, and says nothing about it", async () => {
    /*
     * The dashboard aborts its request when the month changes. An early version
     * of this helper passed its own signal to `fetch` and dropped the caller's,
     * which silently disabled that — a stale month's rows could land on top of
     * the new ones. Cancelling must also produce no message, or "No connection"
     * would flash on screen every time somebody changed the month.
     */
    const outer = new AbortController();
    globalThis.fetch = vi.fn(
      (_i: unknown, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    ) as never;
    const pending = apiFetch("/api/dashboard/summary", { signal: outer.signal });
    outer.abort();
    const r = await pending;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe("");
  });
});

describe("what the operator is told", () => {
  it("prefers the server's own sentence", async () => {
    serve(400, JSON.stringify({ error: "Required heading missing: RETAILER_CODE." }));
    const r = await apiFetch("/api/import/GA", { method: "POST" });
    if (!r.ok) expect(r.message).toBe("Required heading missing: RETAILER_CODE.");
  });

  it("replaces a bare 'Unauthorized' with something actionable", async () => {
    /*
     * What every route in this app answers with when the session has gone. The
     * word tells a field operator nothing; the replacement tells them what to
     * do.
     */
    serve(401, JSON.stringify({ error: "Unauthorized" }));
    const r = await apiFetch("/api/targets");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toBe(EXPIRED_MESSAGE);
      expect(r.expired).toBe(true);
    }
  });

  it("does NOT reword a real 401 from the sign-in form", async () => {
    /*
     * The hazard this rule exists for, and the reason it is narrow.
     *
     * A wrong PIN is also a 401. Telling someone who mistyped their PIN that
     * their session expired would be a worse bug than the one being fixed —
     * they would reload, sign in fine, and never learn what happened. A locked
     * account is a 403 for the same reason.
     */
    serve(401, JSON.stringify({ error: "Invalid login credentials." }));
    const bad = await apiFetch("/api/auth/login", { method: "POST" });
    if (!bad.ok) {
      expect(bad.message).toBe("Invalid login credentials.");
      expect(bad.expired).toBe(false);
    }

    serve(403, JSON.stringify({ error: "This login is locked after too many failed attempts." }));
    const locked = await apiFetch("/api/auth/login", { method: "POST" });
    if (!locked.ok) expect(locked.message).toMatch(/locked/);
  });

  it("falls back on a 401 with no message at all", async () => {
    serve(401, "");
    const r = await apiFetch("/api/targets");
    if (!r.ok) expect(r.message).toBe(EXPIRED_MESSAGE);
  });

  it("never hands back an empty message for a real failure", async () => {
    // A blank message renders as a blank box, which reads as "nothing wrong".
    for (const [status, body, type] of [
      [500, "", "application/json"],
      [500, "{}", "application/json"],
      [503, "Service Unavailable", "text/plain"],
      [404, JSON.stringify({ error: "   " }), "application/json"],
    ] as const) {
      serve(status, body, type);
      const r = await apiFetch("/api/x");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message.trim(), `status ${status} produced no message`).not.toBe("");
    }
  });
});

describe("the JSON and upload wrappers", () => {
  it("apiSend sends JSON with the right header and method", async () => {
    const spy = vi.fn(async () => new Response("{}", { status: 200 }));
    globalThis.fetch = spy as never;
    await apiSend("/api/targets", "POST", { month: "2026-08" });
    const [, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ month: "2026-08" }));
  });

  it("apiUpload gives a workbook far longer than a JSON call", async () => {
    /*
     * A 20 MB file over 3G is slow, not broken. Cutting it off at the default
     * would turn a working upload into a mystery — the opposite of the point.
     */
    let uploadTimeout = 0;
    globalThis.fetch = vi.fn((_i: unknown, init?: { signal?: AbortSignal }) => {
      const started = Date.now();
      return new Promise((resolve) => {
        init?.signal?.addEventListener("abort", () => {
          uploadTimeout = Date.now() - started;
        });
        setTimeout(() => resolve(new Response("{}", { status: 200 })), 5);
      });
    }) as never;
    await apiUpload("/api/import/GA", new FormData());
    expect(uploadTimeout).toBe(0); // it did not abort a 5ms upload
    const { UPLOAD_TIMEOUT_MS, DEFAULT_TIMEOUT_MS } = await import("../lib/api-client");
    expect(UPLOAD_TIMEOUT_MS).toBeGreaterThan(DEFAULT_TIMEOUT_MS * 3);
  });
});

describe("no client component calls fetch directly", () => {
  /**
   * The half that keeps this fixed.
   *
   * Every one of the thirty broken call sites was written by someone doing the
   * obvious thing. Fixing them without closing the door means the thirty-first
   * arrives with the same defect and nothing notices.
   */
  const clientFiles = () => {
    const out: { file: string; src: string }[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(e.name)) {
          const src = fs.readFileSync(full, "utf8");
          if (/^["']use client["']/m.test(src.slice(0, 400))) out.push({ file: relativeTo(ROOT)(full), src });
        }
      }
    };
    walk(path.join(ROOT, "app"));
    return out;
  };

  it("finds the client components at all", () => {
    // A guard that scans an empty list passes forever. This is what makes the
    // assertion below mean something.
    expect(clientFiles().length).toBeGreaterThan(15);
  });

  it("routes every browser request through the helper", () => {
    const offenders = clientFiles()
      .filter((f) => /(?<![.\w])fetch\s*\(/.test(f.src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")))
      .map((f) => f.file);
    expect(
      offenders,
      `these call fetch directly instead of apiFetch/apiSend/apiUpload:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  /**
   * The one caller that deliberately ignores the result.
   *
   * Sign-out navigates to /login whether or not the request landed. Making the
   * navigation conditional would leave an operator with no connection stuck on
   * a page with a button that appears to do nothing, and the session cookie is
   * httpOnly — the server clears it on the next request either way. Named here
   * so the exception is a decision on the record rather than a gap.
   */
  const IGNORES_RESULT_ON_PURPOSE = ["app/components/AppShell.tsx"];

  it("checks the result before using it", () => {
    /*
     * `apiFetch` cannot force a caller to look, but a caller that reads `.data`
     * without testing `.ok` is a type error, and one that never mentions `.ok`
     * at all is a caller that swallowed the failure. Both are cheap to spot.
     */
    const offenders = clientFiles()
      .filter((f) => /\bapi(Fetch|Send|Upload)\s*[<(]/.test(f.src))
      .filter((f) => !/\.ok\b/.test(f.src))
      .map((f) => f.file)
      .filter((f) => !IGNORES_RESULT_ON_PURPOSE.includes(f));
    expect(offenders, `these ignore whether the request succeeded:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });
});

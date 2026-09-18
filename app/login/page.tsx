"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiSend } from "@/lib/api-client";

export default function Login() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    router = useRouter();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    /*
     * The hand-rolled try/catch this replaces had no timeout, so a request that
     * never came back left the button saying "Signing in…" indefinitely. The
     * server's own wording still reaches the operator here — "Invalid login
     * credentials." is a 401 too, and must not be reworded into anything about
     * sessions.
     */
    const res = await apiSend<{ redirect: string }>(
      "/api/auth/login",
      "POST",
      { identifier: f.get("identifier"), credential: f.get("credential"), admin: false },
      { timeoutMs: 20_000 },
    );
    setBusy(false);
    if (!res.ok) return setError(res.message);
    router.replace(res.data.redirect);
    router.refresh();
  }
  return (
    <main className="auth-v54">
      <section className="auth-v54-brand">
        <div className="auth-v54-brand-top">
          <div className="auth-v54-logo">D</div>
          <div>
            <strong>DMS</strong>
            <span>Distribution Management System</span>
          </div>
        </div>
        <div className="auth-v54-copy">
          <span className="auth-v54-kicker">FIELD SALES · DISTRIBUTION · EXECUTION</span>
          <h1>One workspace for your entire distribution team.</h1>
          <p>
            Monitor performance, manage retailers, maintain operational data and keep field execution connected across
            every role.
          </p>
          <div className="auth-v54-role-grid">
            <div>
              <b>Manager</b>
              <small>Team oversight</small>
            </div>
            <div>
              <b>Supervisor</b>
              <small>Field execution</small>
            </div>
            <div>
              <b>Accounts</b>
              <small>Data operations</small>
            </div>
            <div>
              <b>RSO</b>
              <small>Retailer management</small>
            </div>
            <div>
              <b>BP</b>
              <small>SIM sales</small>
            </div>
            <div>
              <b>IT</b>
              <small>System operations</small>
            </div>
          </div>
        </div>
        <div className="auth-v54-foot">
          <span>Secure role-based access</span>
          <span>Live operational reporting</span>
        </div>
      </section>
      <section className="auth-v54-panel">
        {/*
          `method="post"` is not decoration, and it is not about this handler.

          A <form> with no method is a GET, and that default applies for as
          long as the page is HTML the browser has not yet handed to React.
          Submitting in that window put the typed values in the query string:

            /login?identifier=01700000001&credential=<the PIN>

          which is the browser's address bar, its history, the server's access
          log and the Referer of the next request. Measured against a real
          build: the window is up to ~0.5s on fast 3G and ~3.5s on slow 3G —
          seconds, on the networks this app is used on, with the button
          visible and enabled the whole time. A POST puts the fields in a body
          that nothing keeps, and Next renders this page again with a clean
          URL. `onSubmit` still prevents it once React is here; this is what
          happens before that.
        */}
        <form method="post" className="auth-v54-card" onSubmit={submit}>
          <div className="auth-v54-mobile-brand">
            <div className="auth-v54-logo">D</div>
            <div>
              <strong>DMS</strong>
              <span>Distribution Management System</span>
            </div>
          </div>
          <div className="auth-v58-team-badge">TEAM LOGIN</div>
          <div className="auth-v54-overline">AUTHORIZED TEAM ACCESS</div>
          <h2>Welcome back</h2>
          <p className="auth-v54-intro">Use your authorized mobile number and PIN to continue.</p>
          <label className="auth-v54-field">
            <span>Mobile Number</span>
            <input name="identifier" required autoComplete="username" placeholder="01XXXXXXXXX" inputMode="tel" />
          </label>
          <label className="auth-v54-field">
            <span>PIN</span>
            <input
              name="credential"
              required
              type="password"
              autoComplete="current-password"
              placeholder="Enter PIN"
              inputMode="numeric"
            />
          </label>
          {error && <div className="auth-v54-error">{error}</div>}
          <button type="submit" className="auth-v54-submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <div className="auth-v54-help">
            <strong>Authorized team access only</strong>
            <span>Contact your administrator if your account or role mapping needs to be updated.</span>
          </div>
        </form>
      </section>
    </main>
  );
}

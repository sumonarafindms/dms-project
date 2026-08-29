"use client";

/**
 * Administrator sign-in.
 *
 * Same split-panel shape as the team login (`/login`) so the two doors read as
 * one system, with `is-admin` switching the accent from blue to teal and the
 * copy to the restricted framing — an administrator can tell at a glance which
 * entrance they are at.
 *
 * The request is unchanged: POST /api/auth/login with `admin: true` and the
 * same `identifier` / `credential` fields, and the server's redirect decides
 * where the session lands.
 */

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "../components/icons";

const CAPABILITIES = [
  { title: "People & access", note: "Roles, logins, permissions" },
  { title: "Data operations", note: "Imports, targets, master data" },
  { title: "Full reporting", note: "Every role, every period" },
];

export default function AdminAccess() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier: f.get("identifier"), credential: f.get("credential"), admin: true }),
      });
      const d = await res.json();
      setBusy(false);
      if (!res.ok) return setError(d.error || "Sign in failed");
      router.replace(d.redirect);
      router.refresh();
    } catch {
      setBusy(false);
      setError("Unable to reach the sign-in service. Please try again.");
    }
  }

  return (
    <main className="auth-v54 is-admin">
      <section className="auth-v54-brand">
        <div className="auth-v54-brand-top">
          <div className="auth-v54-logo">D</div>
          <div>
            <strong>DMS</strong>
            <span>Administrator Console</span>
          </div>
        </div>

        <div className="auth-v54-copy">
          <span className="auth-v54-kicker">Restricted · System administration</span>
          <h1>The control room for the whole distribution system.</h1>
          <p>
            This entrance is separate from the team sign-in. It opens system configuration, people and access, data
            operations and every role&rsquo;s reporting.
          </p>
          <ul className="auth-admin-points">
            {CAPABILITIES.map((c) => (
              <li key={c.title}>
                <b>{c.title}</b>
                <small>{c.note}</small>
              </li>
            ))}
          </ul>
        </div>

        <div className="auth-v54-foot">
          <span>Sign-ins are recorded in the audit log</span>
          <span>Authorized administrators only</span>
        </div>
      </section>

      <section className="auth-v54-panel">
        <form className="auth-v54-card" onSubmit={submit}>
          <div className="auth-v54-mobile-brand">
            <div className="auth-v54-logo">D</div>
            <div>
              <strong>DMS</strong>
              <span>Administrator Console</span>
            </div>
          </div>

          <div className="auth-admin-badge">
            <Icon name="shield" />
            Restricted access
          </div>
          <div className="auth-v54-overline">System administration</div>
          <h2>Administrator sign-in</h2>
          <p className="auth-v54-intro">
            Use your administrator ID and password. This form does not accept team logins.
          </p>

          <label className="auth-v54-field">
            <span>Username / Mobile Number</span>
            <input name="identifier" required autoComplete="username" placeholder="Administrator ID" autoFocus />
          </label>
          <label className="auth-v54-field">
            <span>Password</span>
            <input
              name="credential"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Enter password"
            />
          </label>

          {error && (
            <div className="auth-v54-error" role="alert">
              {error}
            </div>
          )}

          <button type="submit" className="auth-v54-submit" disabled={busy} aria-busy={busy}>
            {busy ? "Authenticating…" : "Continue securely"}
          </button>

          <div className="auth-v54-help">
            <strong>Not an administrator?</strong>
            <span>
              Managers, supervisors, accounts, RSOs and BPs sign in at the <Link href="/login">team login</Link>.
            </span>
          </div>
        </form>
      </section>
    </main>
  );
}

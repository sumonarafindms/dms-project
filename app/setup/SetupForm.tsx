"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupForm() {
  const r = useRouter(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(f)),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) return setError(d.error || "Setup failed");
    r.replace(d.redirect);
    r.refresh();
  }
  return (
    <form className="auth-v54-card" onSubmit={submit}>
      <div className="auth-v54-mobile-brand always">
        <div className="auth-v54-logo">D</div>
        <div>
          <strong>DMS</strong>
          <span>First-time setup</span>
        </div>
      </div>
      <div className="auth-v54-overline">SYSTEM INITIALIZATION</div>
      <h2>Create administrator</h2>
      <p className="auth-v54-intro">This one-time page is available only before the first DMS user exists.</p>
      <label className="auth-v54-field">
        <span>Name</span>
        <input name="displayName" required placeholder="Administrator name" />
      </label>
      <label className="auth-v54-field">
        <span>Username</span>
        <input name="username" required placeholder="admin" />
      </label>
      <label className="auth-v54-field">
        <span>Password</span>
        <input name="password" type="password" minLength={6} required placeholder="Minimum 6 characters" />
      </label>
      {error && <div className="auth-v54-error">{error}</div>}
      <button className="auth-v54-submit" disabled={busy}>
        {busy ? "Creating…" : "Create administrator"}
      </button>
    </form>
  );
}

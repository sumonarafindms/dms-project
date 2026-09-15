"use client";

/**
 * Who you are, and the two things you can do about it.
 *
 * ## What was missing
 *
 * On a phone the only thing in the top bar was an avatar that linked to the
 * role's home page — which is where the person already was. There was no way
 * to change your own PIN and, below 900px, no way to sign out either: the
 * sidebar carrying that button is `display: none`.
 *
 * So an RSO who thought someone had watched them type their PIN had exactly
 * one option, which was to find an administrator. The owner asked for the
 * change-PIN option behind the profile icon, on every role, and the sign-out
 * comes with it because a sheet that can change a credential and cannot end a
 * session is a strange half of a thing.
 *
 * ## Same sheet, both layouts
 *
 * Desktop opens it from the sidebar profile block, phones from the avatar.
 * One component, so the two cannot drift — and so "every role" is a property of
 * the shell rather than six copies that have to be kept in step.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Btn, Field, Modal } from "./Kit";
import { Icon } from "./icons";
import { apiFetch, apiSend } from "@/lib/api-client";
import { credentialRules } from "../../lib/credential-change";

async function signOut() {
  /*
   * The navigation is not conditional on the request — same reasoning as the
   * sidebar's button. A logout that cannot reach the server used to leave the
   * operator on the page with nothing apparently happening; the cookie is
   * httpOnly, so the server clears it on the next request either way.
   */
  await apiFetch("/api/auth/logout", { method: "POST", timeoutMs: 8_000 });
  location.href = "/login";
}

function ChangeCredential({ role, onDone }: { role: string; onDone: () => void }) {
  const rules = credentialRules(role);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await apiSend<{ message?: string }>("/api/auth/change-credential", "POST", { current, next, confirm });
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    setDone(r.data.message || `Your ${rules.noun} has been changed.`);
  }

  if (done)
    return (
      <div className="kit-note is-ok" role="status">
        <strong>{done}</strong>
        <span>Any other device signed in as you has been signed out. This one stays signed in.</span>
        <div className="kit-form-actions">
          <Btn type="button" onClick={onDone}>
            Done
          </Btn>
        </div>
      </div>
    );

  /*
   * A numeric keypad for a PIN and a normal password field for an admin. Both
   * are `type="password"`: these are typed in shops and in daylight, over
   * somebody's shoulder, which is the whole reason this screen exists.
   */
  /**
   * `constrain: false` for the CURRENT credential, and that is not a detail.
   *
   * v155's rule is that existing credentials keep working — the format is
   * enforced when one is SET, not when it is used, so that the whole field team
   * is not locked out on the morning of a deploy. Putting `maxLength={6}` and
   * `pattern="\d{6}"` on the current-PIN box silently truncates a four-digit
   * PIN's cousin and every legacy credential, so the one thing the person
   * definitely knows can never be typed correctly. Found exactly that way: the
   * browser test could not change a PIN for an account whose credential is nine
   * characters long, and the message said the current PIN was wrong.
   *
   * Only the two NEW boxes carry the rules.
   */
  const field = (label: string, value: string, set: (v: string) => void, autoComplete: string, constrain = true) => (
    <Field label={label}>
      <input
        className="kit-input"
        // `password`, never `number`: a number input would expose the wheel
        // hazard NumberInput exists to guard, show spinners on a secret, and
        // print the PIN in clear on the screen of somebody standing in a shop.
        type="password"
        value={value}
        onChange={(e) => set(e.target.value)}
        required
        {...(!constrain
          ? {
              inputMode: rules.digitsOnly ? ("numeric" as const) : undefined,
              placeholder: `Your current ${rules.noun}`,
            }
          : rules.digitsOnly
            ? {
                inputMode: "numeric" as const,
                pattern: `\\d{${rules.length}}`,
                minLength: rules.length ?? undefined,
                maxLength: rules.length ?? undefined,
                placeholder: `${rules.length} digits`,
              }
            : { minLength: rules.minLength, placeholder: `At least ${rules.minLength} characters` })}
        autoComplete={autoComplete}
      />
    </Field>
  );

  return (
    <form onSubmit={submit}>
      <div className="kit-form-grid">
        {field(`Current ${rules.noun}`, current, setCurrent, "current-password", false)}
        {field(`New ${rules.noun}`, next, setNext, "new-password")}
        {field(`Repeat new ${rules.noun}`, confirm, setConfirm, "new-password")}
      </div>
      {error && (
        <p className="kit-note is-bad" role="alert">
          {error}
        </p>
      )}
      <div className="kit-form-actions">
        <Btn disabled={busy}>{busy ? "Saving…" : `Change ${rules.noun}`}</Btn>
      </div>
    </form>
  );
}

export function AccountMenu({
  name,
  roleTitle,
  role,
  initials,
  variant,
}: {
  name: string;
  roleTitle: string;
  role: string;
  initials: string;
  /** "avatar" is the phone's top bar; "profile" is the desktop sidebar block. */
  variant: "avatar" | "profile";
}) {
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [mounted, setMounted] = useState(false);
  const noun = credentialRules(role).noun;

  /*
   * The dialog is portalled to <body>, and that is not tidiness.
   *
   * On a phone this component lives inside `header.mobile-topbar`, which is
   * `position: sticky; z-index: 30` — a stacking context. A `position: fixed`
   * backdrop rendered inside it has its own `z-index: 60` scoped to that
   * context, so the whole dialog painted at the header's level 30, the same as
   * `.bottom-nav`, which comes later in the document and therefore won. The
   * sheet was visible and its buttons were behind the navigation bar: the
   * browser test could see "Change PIN" and could not click it.
   *
   * `mounted` because `document` does not exist while this renders on the
   * server, and rendering the portal on the first client pass instead would be
   * a hydration mismatch.
   */
  useEffect(() => setMounted(true), []);

  function close() {
    setOpen(false);
    setChanging(false);
  }

  return (
    <>
      {variant === "avatar" ? (
        <button
          type="button"
          className="avatar avatar-link"
          aria-label={`Account — ${name}`}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          {initials}
        </button>
      ) : (
        <button
          type="button"
          className="sidebar-profile sidebar-profile-btn"
          aria-label={`Account — ${name}`}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          <span className="avatar">{initials}</span>
          <span>
            <span className="profile-name">{name}</span>
            <span className="profile-role">{roleTitle}</span>
          </span>
          <Icon name="arrow" />
        </button>
      )}

      {open &&
        mounted &&
        createPortal(
          <Modal
            title={changing ? `Change ${noun}` : "Account"}
            sub={changing ? undefined : `${name} · ${roleTitle}`}
            labelledBy="kit-account-title"
            onClose={close}
          >
            {changing ? (
              <ChangeCredential role={role} onDone={close} />
            ) : (
              <div className="kit-rows">
                <button type="button" className="kit-row is-link kit-row-btn" onClick={() => setChanging(true)}>
                  <span className="kit-row-icon" aria-hidden="true">
                    <Icon name="shield" />
                  </span>
                  <span className="kit-row-main">
                    <strong>Change {noun}</strong>
                    <span>Signs out every other device</span>
                  </span>
                  <span className="kit-row-chevron" aria-hidden="true">
                    ›
                  </span>
                </button>
                <button type="button" className="kit-row is-link kit-row-btn" onClick={signOut}>
                  <span className="kit-row-icon" aria-hidden="true">
                    <Icon name="logout" />
                  </span>
                  <span className="kit-row-main">
                    <strong>Sign out</strong>
                    <span>On this device</span>
                  </span>
                  <span className="kit-row-chevron" aria-hidden="true">
                    ›
                  </span>
                </button>
              </div>
            )}
          </Modal>,
          document.body,
        )}
    </>
  );
}

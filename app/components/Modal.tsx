"use client";

/**
 * The dialog behind every sheet in this app — the account sheet, the More
 * sheet, the target editors, the user manager.
 *
 * ## Why it is its own file
 *
 * It needs `useEffect` and `useRef`, and `Kit.tsx` has no `"use client"`: it is
 * a pure markup kit that server pages import freely. Marking that whole file as
 * client code to give one component a keyboard handler would pull the entire
 * kit into the client bundle of every page that renders a card. `Kit.tsx`
 * re-exports this, so nothing that already imports `{ Modal } from "./Kit"`
 * has to change.
 *
 * ## What it was missing
 *
 * It declared `role="dialog" aria-modal="true"` and then behaved like an
 * ordinary div. Escape did nothing. Focus stayed on whatever opened it, so a
 * keyboard or screen-reader user landed in a dialog with the cursor still
 * outside it, and Tab walked straight out of the back of the sheet into the
 * page underneath — which `aria-modal` had just told them was hidden.
 *
 * Three promises, now kept: Escape closes, focus moves in on open and back to
 * the opener on close, and Tab cycles inside.
 */

import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Centre dialog on desktop, bottom sheet on phones — as in every demo. */
export function Modal({
  title,
  sub,
  onClose,
  footer,
  labelledBy = "kit-modal-title",
  children,
}: {
  title: string;
  sub?: string;
  onClose: () => void;
  footer?: ReactNode;
  labelledBy?: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLElement | null>(null);
  /*
   * `onClose` in a ref, not in the effect's dependency list.
   *
   * Callers pass an inline arrow (`onClose={() => setOpen(false)}`), so a new
   * function arrives on every render. In the dependency list that tears down
   * and rebuilds the listener continuously and — worse — re-runs the focus
   * move, so the cursor jumped back to the top of the sheet whenever anything
   * inside it changed, including every keystroke in the change-PIN form.
   */
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const node = panel.current;
    // The dialog itself takes focus rather than its first control: reading
    // starts at the title, which is what `aria-labelledby` points at, instead
    // of at the close button.
    node?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const on = document.activeElement;
      if (e.shiftKey && (on === first || on === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && on === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      // Back where they came from — but only if that element is still on the
      // page, because a sheet that deletes a row leaves its opener gone.
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  return (
    <div
      className="kit-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.currentTarget === e.target) onClose();
      }}
    >
      <section
        ref={panel}
        tabIndex={-1}
        className="kit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        <header className="kit-modal-head">
          <div>
            <h2 id={labelledBy}>{title}</h2>
            {sub && <p>{sub}</p>}
          </div>
          <button type="button" className="kit-icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="kit-modal-body">{children}</div>
        {footer && <footer className="kit-modal-foot">{footer}</footer>}
      </section>
    </div>
  );
}

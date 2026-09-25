"use client";

/**
 * v205 — one way to say "done" and one way to ask "are you sure?".
 *
 * The owner asked for the app to feel more professional. Before this, a save
 * said "Saved." in a line of text somewhere under the form — sometimes below
 * the fold on a phone, so the operator pressed Save again — and a delete
 * either asked through the browser's own grey `window.confirm` box or did not
 * ask at all (an expense, a lifting and a product price were removed on one
 * tap).
 *
 *   useToast()    →  toast("Saved", "ok")    a short note at the bottom that
 *                                              goes by itself
 *   useConfirm()  →  await confirm({...})     a proper dialog, the kit's own,
 *                                              resolving true or false
 *
 * Errors still sit next to the form that caused them: a toast that vanishes is
 * the wrong place for "that price is not a number".
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Btn } from "./Kit";
import { Modal } from "./Modal";
import { Icon } from "./icons";

type Tone = "ok" | "info" | "bad";
type Toast = { id: number; text: string; tone: Tone };
type ConfirmAsk = {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

const ToastCtx = createContext<(text: string, tone?: Tone) => void>(() => {});
const ConfirmCtx = createContext<(ask: ConfirmAsk) => Promise<boolean>>(async () => false);

export const useToast = () => useContext(ToastCtx);
export const useConfirm = () => useContext(ConfirmCtx);

const TOAST_MS = 3500;

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [ask, setAsk] = useState<ConfirmAsk | null>(null);
  const answer = useRef<((v: boolean) => void) | null>(null);
  const seq = useRef(0);

  const toast = useCallback((text: string, tone: Tone = "ok") => {
    const id = ++seq.current;
    // At most three at once: a burst of saves should not paper the screen.
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), TOAST_MS);
  }, []);

  const confirm = useCallback(
    (a: ConfirmAsk) =>
      new Promise<boolean>((resolve) => {
        answer.current?.(false);
        answer.current = resolve;
        setAsk(a);
      }),
    [],
  );

  function settle(v: boolean) {
    answer.current?.(v);
    answer.current = null;
    setAsk(null);
  }

  // A dialog left open by a navigation still answers — "no".
  useEffect(() => () => answer.current?.(false), []);

  return (
    <ToastCtx.Provider value={toast}>
      <ConfirmCtx.Provider value={confirm}>
        {children}
        <div className="kit-toasts no-print" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`kit-toast is-${t.tone}`}>
              <Icon name={t.tone === "bad" ? "alert" : t.tone === "info" ? "info" : "check"} />
              <span>{t.text}</span>
            </div>
          ))}
        </div>
        {ask ? (
          <Modal
            title={ask.title}
            onClose={() => settle(false)}
            labelledBy="kit-confirm-title"
            footer={
              <div className="kit-confirm-acts">
                <Btn type="button" variant="secondary" onClick={() => settle(false)}>
                  {ask.cancelLabel || "Cancel"}
                </Btn>
                <Btn type="button" variant={ask.danger ? "danger" : "primary"} onClick={() => settle(true)} autoFocus>
                  {ask.confirmLabel || "Yes"}
                </Btn>
              </div>
            }
          >
            {ask.body ? <div className="kit-confirm-body">{ask.body}</div> : null}
          </Modal>
        ) : null}
      </ConfirmCtx.Provider>
    </ToastCtx.Provider>
  );
}

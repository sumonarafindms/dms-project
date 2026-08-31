"use client";

import { useEffect } from "react";

/**
 * Registers `public/sw.js`, which caches build output and nothing else.
 *
 * Renders no markup — it exists only so the registration runs in the browser.
 *
 * ## Why the failure is swallowed
 *
 * Registration fails in ordinary, harmless situations: a private window, a
 * browser with service workers disabled, an origin that is not secure. None of
 * those is a problem the operator can act on, and none stops the app working —
 * the worker only ever made repeat loads faster. So a failure is logged for a
 * developer and never surfaced.
 *
 * ## Why it waits for `load`
 *
 * Registering during hydration competes with the very assets the page is still
 * fetching. After `load` the first paint is done and the worker installs with
 * the connection to itself.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
        console.warn("Service worker registration failed", error);
      });
    };

    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}

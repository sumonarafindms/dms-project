"use client";

/**
 * Route error boundary — migrated to the role-UI kit.
 *
 * The old markup used `system-state-*` classes that no stylesheet ever
 * defined; they were painted entirely by coverage.css's attribute-suffix
 * fallback, and `system-state-v13` matched nothing at all, so the page was
 * not even a `.page`. This is the same empty state the rest of the app uses.
 */

import { useEffect } from "react";
import { Btn, Card, EmptyState } from "./components/Kit";
import { Icon } from "./components/icons";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="page">
      <Card padded="lg">
        <EmptyState
          title="We couldn't load this page."
          hint="The data service may be temporarily unavailable, or this request could not be completed."
          icon={<Icon name="alert" />}
        />
        <div className="kit-form-actions is-center">
          <Btn type="button" onClick={reset}>
            Try again
          </Btn>
          {/* A plain <a>, not <Link>, on purpose: this is the error boundary,
              so the client router is exactly the thing that may be broken. A
              full document load is the reliable way out. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="kit-btn is-ghost size-md" href="/">
            Go to home
          </a>
        </div>
        {error.digest && (
          <p className="kit-details is-center">
            Reference: {error.digest}
          </p>
        )}
      </Card>
    </main>
  );
}

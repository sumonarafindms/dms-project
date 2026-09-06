"use client";

/**
 * A button that asks before it acts.
 *
 * It renders `Btn` rather than a bare `<button>`, and takes `variant`/`size`
 * rather than a `className` string. The old signature let the one caller hand
 * it `kit-btn size-sm is-danger` — a button that looked like every other button
 * and shared none of the component that defines them, so anything added to
 * `Btn` (a tap-target floor, a busy state) would have skipped this one
 * silently.
 */

import type { ReactNode } from "react";
import { Btn } from "./Kit";

export default function ConfirmActionButton({
  children,
  onConfirm,
  message,
  variant = "secondary",
  size = "md",
  disabled,
}: {
  children: ReactNode;
  onConfirm: () => void | Promise<void>;
  message: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
}) {
  return (
    <Btn
      type="button"
      variant={variant}
      size={size}
      disabled={disabled}
      onClick={async () => {
        if (window.confirm(message)) await onConfirm();
      }}
    >
      {children}
    </Btn>
  );
}

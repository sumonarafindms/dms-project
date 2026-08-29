"use client";
import type { ReactNode } from "react";
export default function ConfirmActionButton({
  children,
  onConfirm,
  message,
  className,
  disabled,
}: {
  children: ReactNode;
  onConfirm: () => void | Promise<void>;
  message: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={className}
      onClick={async () => {
        if (window.confirm(message)) await onConfirm();
      }}
    >
      {children}
    </button>
  );
}

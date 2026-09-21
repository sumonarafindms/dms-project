"use client";

/**
 * The rest of the navigation, on a phone.
 *
 * `lib/bottom-nav.ts` explains why the bar stops at five cells. This is the
 * fifth: it opens a sheet holding EVERY destination the role has, not only the
 * ones the bar could not fit. Two partial lists would make the reader work out
 * which one to look in; one complete list does not.
 *
 * It borrows `Modal` and the `kit-row` pattern from the account sheet on
 * purpose — the phone already has one sheet, and a second one built its own way
 * would be a second thing to keep in step.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Modal } from "./Kit";
import { Icon } from "./icons";
import { AppLink as Link } from "./AppLink";
import type { BottomItem } from "@/lib/bottom-nav";

export function NavMore({
  items,
  path,
  isActive,
  onNavigate,
  highlight,
}: {
  /** Every destination for this role, in nav order. */
  items: BottomItem[];
  path: string;
  isActive: (path: string, href: string) => boolean;
  onNavigate: (href: string) => void;
  /** True when the page you are on is one the bar could not show. */
  highlight: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  /*
   * Portalled to <body> for the same reason the account sheet is: the bar is
   * `position: sticky; z-index: 30`, which is a stacking context, so a fixed
   * backdrop rendered inside it paints at the bar's level instead of above it.
   */
  useEffect(() => setMounted(true), []);

  // Warm what the sheet offers, once it is open — not before, because the
  // whole point of the overflow is that these are the less-travelled routes.
  useEffect(() => {
    if (!open) return;
    for (const i of items) router.prefetch(i.href);
  }, [open, items, router]);

  return (
    <>
      <button
        type="button"
        className={`bottom-link bottom-more ${highlight ? "active" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="More destinations"
        onClick={() => setOpen(true)}
      >
        <Icon name="more" />
        <span>More</span>
      </button>

      {open &&
        mounted &&
        createPortal(
          <Modal
            title="Go to"
            sub="Everywhere you can go from here"
            labelledBy="kit-nav-more-title"
            onClose={() => setOpen(false)}
          >
            <div className="kit-rows">
              {items.map((i) => {
                const current = isActive(path, i.href);
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    className={`kit-row is-link ${current ? "is-current" : ""}`}
                    aria-current={current ? "page" : undefined}
                    onClick={() => {
                      if (!current) onNavigate(i.href);
                      setOpen(false);
                    }}
                  >
                    <span className="kit-row-icon" aria-hidden="true">
                      <Icon name={i.icon} />
                    </span>
                    <span className="kit-row-main">
                      <strong>{i.label}</strong>
                      {current ? <span>You are here</span> : null}
                    </span>
                    {/* The live dot travels with the entry, so Live GA is
                        marked in the sheet exactly as it is in the bar. */}
                    {i.live ? <span className="nav-live-dot" aria-hidden="true" /> : null}
                    <span className="kit-row-chevron" aria-hidden="true">
                      ›
                    </span>
                  </Link>
                );
              })}
            </div>
          </Modal>,
          document.body,
        )}
    </>
  );
}

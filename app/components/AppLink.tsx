"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, type ComponentProps, type MouseEvent } from "react";

/**
 * A `next/link` that checks the navigation actually happened.
 *
 * ## The defect this exists for
 *
 * On a cold load, roughly two of every five taps on a list row did nothing at
 * all. Measured on the production-volume database, eight fresh browser sessions
 * per screen, clicking exactly once after the page had finished streaming:
 *
 * ```
 * /admin/performance/supervisors   dead 3/8
 * /rso/retailers                   dead 3/8
 * /supervisor/bp-activations       dead 3/8
 * ```
 *
 * What happens is precise and entirely silent. The Link's handler runs — the
 * click's `defaultPrevented` is true, so the browser's own navigation has been
 * cancelled. The router issues the RSC request for the right URL and the server
 * answers 200 with the right payload. Then `history.pushState` is never called,
 * no error reaches the console, no error boundary renders, and the row simply
 * sits there. A second tap works. That was confirmed by patching
 * `history.pushState`/`replaceState` before any app code ran and watching: on a
 * failed click there is no history call of any kind, and nothing navigates back
 * — the navigation is dropped, not undone.
 *
 * Things measured and ruled out, so the next person does not repeat them: the
 * service worker (blocking it changes nothing), `useDeferredValue` in the list
 * controls (removing it changes nothing), response compression (`compress:
 * false` changes nothing), and the nav bar's eager prefetching (changing it
 * moves the rate around inside the noise of eight rounds). Buffering the RSC
 * response through a proxy DOES make it navigate every time, which points at a
 * race in the router's handling of the streamed payload rather than at
 * anything this application does. That is a framework-level fault this project
 * cannot fix from here.
 *
 * ## What this does instead
 *
 * It does not replace the router; it watches it. On click it notes where we
 * were, and if the address bar has not moved:
 *
 *   - after 900ms it asks the router once more (the second attempt is the one
 *     that works, every time it has been observed), and
 *   - after 2500ms it gives up on the router and navigates the browser, which
 *     cannot fail.
 *
 * Both timers are cancelled the moment the URL changes, so a navigation that
 * works — 45-300ms on these screens — never sees either of them. The cost of
 * the fallback firing on a genuinely slow page is one extra request; the cost
 * of not having it is a row that does nothing when a field agent taps it.
 *
 * This is a workaround and is labelled as one. When the router stops dropping
 * navigations, deleting this file and importing `next/link` again is the whole
 * revert.
 */

/** Long enough that a healthy navigation is finished; short enough to feel like the tap worked. */
const RETRY_AFTER_MS = 900;
/** The router has had two chances by now. */
const HARD_AFTER_MS = 2500;

type Props = ComponentProps<typeof Link>;

export function AppLink({ href, onClick, ...rest }: Props) {
  const router = useRouter();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    // A modified click is the browser's business — a new tab, a download, a
    // saved link. Watching it would drag the current tab somewhere the person
    // did not ask to go.
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

    const target = typeof href === "string" ? href : null;
    if (!target || !target.startsWith("/")) return;

    const from = window.location.pathname + window.location.search;
    const stillHere = () => window.location.pathname + window.location.search === from;
    const clear = () => {
      for (const t of timers.current) clearTimeout(t);
      timers.current = [];
    };
    clear();
    timers.current = [
      setTimeout(() => {
        if (stillHere()) router.push(target);
      }, RETRY_AFTER_MS),
      setTimeout(() => {
        if (stillHere()) window.location.assign(target);
        else clear();
      }, HARD_AFTER_MS),
    ];
  }

  return <Link href={href} onClick={handleClick} {...rest} />;
}

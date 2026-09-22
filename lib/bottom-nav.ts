/**
 * How many destinations fit across the bottom of a phone, and what happens to
 * the rest.
 *
 * ## The measurement
 *
 * Below 900px the sidebar is `display: none`, so the bottom bar IS the
 * navigation. Earlier versions concluded from that — correctly — that nothing
 * may simply be dropped from it, and then drew every entry the role has: seven
 * for RSO, Manager and Accounts. Measured on the real screens:
 *
 *     role        width  cells   what happened
 *     RSO          320    45px   "Attention" and "Retailers" both wrapped
 *     MANAGER      390    55px   "BP Activations" CLIPPED (53px into 51px)
 *     ACCOUNTS     390    55px   five of seven labels on two lines
 *     ACCOUNTS     430    60px   four of seven still on two lines
 *
 * 45px is under the 44px floor once the 1px borders are counted, seven targets
 * wide with no gap between them; and the bar's own height swung between 54px
 * and 65px depending on whether anything wrapped, so the page's bottom padding
 * changed from screen to screen.
 *
 * ## The rule
 *
 * At most `MAX_SLOTS` cells. If the role has more destinations than that, the
 * last cell becomes "More", which opens a sheet listing **every** destination
 * — including the ones already in the bar, so there is one complete list
 * rather than two partial ones. Nothing becomes unreachable, which is the
 * objection that kept the bar at seven.
 *
 * ## The swap
 *
 * If the page you are on lives in the overflow, it is pulled into the last
 * primary slot. Without that, opening "Retailers" from the sheet leaves the
 * bar showing four items, none of them current, and nothing on screen says
 * where you are. The swap costs a little stability — one cell changes as you
 * move — and buys "you are here", which is the bar's first job.
 */

export type BottomItem = { href: string; label: string; short?: string; icon: string; live?: boolean };

/** Five cells at 320px is 64px each; seven was 45px. */
export const MAX_SLOTS = 5;

/** The label the BAR uses: `short` when the name is too long for a 64px cell. */
export function barLabel(item: BottomItem) {
  return item.short || item.label;
}

export function bottomSlots<T extends BottomItem>(
  items: T[],
  path: string,
  isActive: (path: string, href: string) => boolean,
  max: number = MAX_SLOTS,
): { shown: T[]; overflow: T[]; hasMore: boolean } {
  if (items.length <= max) return { shown: items, overflow: [], hasMore: false };

  const primaryCount = max - 1; // the last cell is "More"
  let shown = items.slice(0, primaryCount);
  const overflow = items.slice(primaryCount);

  const current = overflow.find((i) => isActive(path, i.href));
  if (current) {
    // Drop the LAST primary rather than the first: slot 1 is the role's home
    // and slot 2 is Live GA, the two that are always wanted.
    shown = [...items.slice(0, primaryCount - 1), current];
  }

  const inBar = new Set(shown.map((i) => i.href));
  return { shown, overflow: items.filter((i) => !inBar.has(i.href)), hasMore: true };
}

export function active(path: string, href: string) {
  const homes = new Set(["/dashboard", "/manager", "/supervisor", "/accounts", "/rso", "/bp"]);
  if (homes.has(href)) return path === href;
  return path === href || (href !== "/" && path.startsWith(href + "/"));
}
/**
 * "Is this the item for the page I am on", asked of a whole menu at once.
 *
 * `active` alone matches by prefix, so on /stock/daily BOTH "Stock & Cash"
 * (/stock) and "Daily Entry" (/stock/daily) matched and both lit up — the
 * owner's report, *"akta click korle 2ta menu select hoye thake"*. The same
 * had been true of Operations and SC & Targets since v144, and of Sim Support
 * and Support Codes since v190; the stock module just made it impossible to
 * miss, with eight entries under one prefix.
 *
 * The rule: an item is active only if no OTHER item in the same menu matches
 * the page more specifically. A prefix still counts when nothing more specific
 * exists — a ledger at /stock/RSO/… has no entry of its own, so Stock & Cash
 * stays lit, which is the parent a person expects.
 *
 * Every consumer — sidebar, bottom bar, More sheet, admin groups — takes this
 * one function, so they cannot disagree about which item is current.
 */
export function activeAmong(hrefs: readonly string[]) {
  return (path: string, href: string) =>
    active(path, href) && !hrefs.some((h) => h.length > href.length && active(path, h));
}

"use client";

/**
 * "Swipe horizontally" hint for a wide table.
 *
 * It measures rather than assumes: the hint used to render unconditionally, so
 * a desktop operator whose table fit comfortably was still told to swipe. It
 * watches its previous sibling — the scroll container the table sits in — and
 * shows only while that container actually has more width than it can display.
 */

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

export function TableScrollHint() {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const scroller = ref.current?.previousElementSibling as HTMLElement | null;
    if (!scroller) return;
    const measure = () => setOverflowing(scroller.scrollWidth > scroller.clientWidth + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className="kit-scroll-hint" hidden={!overflowing} aria-hidden={!overflowing}>
      <Icon name="arrow" />
      <span>Swipe horizontally to view more columns</span>
    </div>
  );
}

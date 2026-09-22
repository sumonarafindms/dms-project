"use client";

/**
 * Which day's support to show.
 *
 * A single date, not a range: support is paid per day and a range would have to
 * invent an answer to "what is today's slab" across several schemes. Today and
 * Yesterday are buttons because they are what the operator asks for, and
 * yesterday especially — the day's GA feed usually lands the following morning.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export function SupportDayPicker({
  date,
  todayYmd,
  yesterdayYmd,
}: {
  date: string;
  todayYmd: string;
  yesterdayYmd: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function go(next: string) {
    if (!next) return;
    const q = new URLSearchParams(params.toString());
    q.set("date", next);
    startTransition(() => router.replace(`?${q.toString()}`, { scroll: false }));
  }

  return (
    <div className="kit-report-datebar no-print" aria-busy={pending}>
      <div className="kit-report-dates">
        <label className="kit-field">
          <span>Day</span>
          {/* No min/max: a native date input reports "" for a rejected value,
              which reads as a dead picker — the v102 bug. */}
          <input className="kit-input" type="date" value={date} onChange={(e) => go(e.target.value)} />
        </label>
      </div>
      {/* `.kit-preset`, the same control the report date bar uses, so the two
          date bars in this app are one control rather than two that look
          nearly alike. */}
      <div className="kit-report-presets">
        <button
          type="button"
          className={`kit-preset${date === todayYmd ? " is-active" : ""}`}
          onClick={() => go(todayYmd)}
        >
          Today
        </button>
        <button
          type="button"
          className={`kit-preset${date === yesterdayYmd ? " is-active" : ""}`}
          onClick={() => go(yesterdayYmd)}
        >
          Yesterday
        </button>
      </div>
    </div>
  );
}

"use client";

/**
 * Which of an RSO's outlets earn the Sim Support SLAB.
 *
 * One RSO at a time, and the whole list is saved in one request, so the screen
 * and the database agree after every save.
 *
 * **No cap.** v189 enforced two; the owner's ruling is that the number must not
 * live in the code — "bar bar update korte hobe na" — so any number may be
 * picked and the card simply says how many. Two is what the office picks today
 * and the page says so, as a hint rather than a rule.
 *
 * This is the SLAB only. The SSO offer counts every outlet under the RSO,
 * picked or not, which the page states — otherwise "no code picked" would read
 * as "cannot earn anything", and that is not true.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Btn, Card, EmptyState } from "./Kit";
import { Icon } from "./icons";
import { apiSend } from "@/lib/api-client";
import { matchesTokens } from "@/lib/text-search";
import { useToast } from "./Feedback";

/** An outlet matches by its code or name, or by its iTopUp number however it is typed. */
function outletMatches(x: CodePickerRso["retailers"][number], q: string) {
  return matchesTokens(`${x.retailerCode} ${x.retailerName || ""}`.toLowerCase(), q, x.wallet || "");
}

/** What the office usually picks. A hint on the card, never a limit. */
export const SUPPORT_CODES_USUAL = 2;

export type CodePickerRso = {
  employeeId: string;
  name: string;
  code: string | null;
  /** v201: the RSO's wallet number, so the search finds them by phone. */
  wallet?: string | null;
  supervisor: string;
  retailers: {
    id: string;
    retailerCode: string;
    retailerName: string | null;
    /** v203: the outlet's iTopUp number, so the outlet search finds it by phone too. */
    wallet?: string | null;
    selected: boolean;
  }[];
};

export function SupportCodePicker({ rsos }: { rsos: CodePickerRso[] }) {
  const router = useRouter();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  /*
   * v203 — the owner: "code scroll kore khuje nite hoi ... search option add
   * kore dou jate code search kore mark kore dite pari". An RSO can hold 130
   * outlets; finding two of them meant scrolling a box of 130 checkboxes.
   * Each open RSO now has its own outlet search, and Enter ticks the one match.
   */
  const [outletQuery, setOutletQuery] = useState("");
  const [picked, setPicked] = useState<Record<string, string[]>>(
    Object.fromEntries(rsos.map((r) => [r.employeeId, r.retailers.filter((x) => x.selected).map((x) => x.id)])),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);

  /*
   * The top search finds an RSO by their own name, code or wallet — and, v203,
   * by any of their OUTLETS' codes or names: typing "R109469" finds the RSO who
   * holds it and opens straight onto that outlet.
   */
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rsos.map((r) => ({ rso: r, viaOutlet: false }));
    const out: { rso: CodePickerRso; viaOutlet: boolean }[] = [];
    for (const r of rsos) {
      if (matchesTokens(`${r.name} ${r.code || ""} ${r.supervisor}`.toLowerCase(), q, r.wallet || ""))
        out.push({ rso: r, viaOutlet: false });
      else if (r.retailers.some((x) => outletMatches(x, q))) out.push({ rso: r, viaOutlet: true });
    }
    return out;
  }, [rsos, search]);

  // One RSO found through an outlet: open it, so the outlet is right there.
  const onlyViaOutlet = shown.length === 1 && shown[0].viaOutlet ? shown[0].rso.employeeId : null;
  // …and it STAYS open once the search is cleared, so the next tap on its
  // header closes it rather than a vanished search closing it underneath you.
  useEffect(() => {
    if (onlyViaOutlet) setOpenId(onlyViaOutlet);
  }, [onlyViaOutlet]);
  const openNow = onlyViaOutlet ?? openId;

  function openRso(id: string | null) {
    setOpenId(id);
    setOutletQuery("");
  }

  function toggle(employeeId: string, retailerId: string) {
    setPicked((p) => {
      const current = p[employeeId] || [];
      return {
        ...p,
        [employeeId]: current.includes(retailerId) ? current.filter((x) => x !== retailerId) : [...current, retailerId],
      };
    });
  }

  async function save(employeeId: string) {
    setBusy(employeeId);
    setMessage("");
    const r = await apiSend("/api/support/codes", "POST", {
      employeeId,
      retailerIds: picked[employeeId] || [],
    });
    setBusy(null);
    setOk(r.ok);
    setMessage(r.ok ? "" : r.message);
    if (r.ok) {
      const who = rsos.find((x) => x.employeeId === employeeId)?.name;
      toast(`Codes saved${who ? ` for ${who}` : ""}`);
      router.refresh();
    }
  }

  return (
    <>
      <Card padded>
        <input
          className="kit-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search RSO, code, wallet or supervisor"
          aria-label="Search the RSOs"
        />
        <p className="kit-hint is-xs">
          {rsos.filter((r) => (picked[r.employeeId] || []).length === 0).length.toLocaleString("en-US")} of{" "}
          {rsos.length.toLocaleString("en-US")} RSOs have no code picked. Pick as many as the offer needs — the usual is{" "}
          {SUPPORT_CODES_USUAL}, and there is no limit. The SSO offer counts every outlet under an RSO whether or not it
          is picked here.
        </p>
      </Card>

      {message ? (
        <div className={`kit-note ${ok ? "is-ok" : "is-bad"}`} role="status">
          <Icon name={ok ? "check" : "alert"} />
          <span>{message}</span>
        </div>
      ) : null}

      {!shown.length ? (
        <Card padded>
          <EmptyState title="Nobody matches that" hint="Try a different name or code." />
        </Card>
      ) : null}

      <div className="sup-codes">
        {shown.map(({ rso: r, viaOutlet }) => {
          const chosen = picked[r.employeeId] || [];
          const open = openNow === r.employeeId;
          // The outlet filter: what was typed in this RSO's own box, else the
          // top search when that is how this RSO was found.
          const filter = (outletQuery || (viaOutlet ? search : "")).trim().toLowerCase();
          const outlets = filter ? r.retailers.filter((x) => outletMatches(x, filter)) : r.retailers;
          const pickedOutlets = r.retailers.filter((x) => chosen.includes(x.id));
          const unusual = chosen.length > SUPPORT_CODES_USUAL;
          return (
            <Card padded key={r.employeeId} className="sup-code-rso">
              <button
                type="button"
                className="sup-code-head"
                aria-expanded={open}
                onClick={() => openRso(open ? null : r.employeeId)}
              >
                <span>
                  <strong>{r.name}</strong>
                  <em>
                    {r.code ? `${r.code} · ` : ""}
                    {r.supervisor} · {r.retailers.length.toLocaleString("en-US")} outlets
                  </em>
                </span>
                <span className="sup-code-state">
                  {/*
                    Three states, and none of them is an error, because nothing
                    here is refused: none picked is a setup problem, more than
                    the usual two is allowed and merely worth noticing.
                  */}
                  {chosen.length === 0 ? (
                    <Badge tone="pending">No code picked</Badge>
                  ) : unusual ? (
                    <Badge tone="processing">{chosen.length} codes</Badge>
                  ) : (
                    <Badge tone="success">
                      {chosen.length} code{chosen.length === 1 ? "" : "s"}
                    </Badge>
                  )}
                  <Icon name="chevron" />
                </span>
              </button>

              {open ? (
                <>
                  {r.retailers.length > 0 ? (
                    <div className="sup-code-find">
                      <input
                        className="kit-input"
                        type="search"
                        value={outletQuery || (viaOutlet ? search : "")}
                        onChange={(e) => setOutletQuery(e.target.value)}
                        onKeyDown={(e) => {
                          // Enter ticks the one outlet the search has narrowed to, then clears for the next.
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (outlets.length === 1) {
                              if (!chosen.includes(outlets[0].id)) toggle(r.employeeId, outlets[0].id);
                              setOutletQuery("");
                            }
                          }
                        }}
                        placeholder="Find an outlet: code, name or number"
                        aria-label={`Find an outlet of ${r.name}`}
                      />
                      <span className="kit-hint is-xs" aria-live="polite">
                        {filter
                          ? outlets.length === 1
                            ? "1 match — press Enter or tap it to pick"
                            : `${outlets.length.toLocaleString("en-US")} of ${r.retailers.length.toLocaleString("en-US")} outlets`
                          : `${r.retailers.length.toLocaleString("en-US")} outlets`}
                      </span>
                    </div>
                  ) : null}
                  {pickedOutlets.length > 0 ? (
                    <div className="sup-code-picked" aria-label="Picked codes">
                      {pickedOutlets.map((x) => (
                        <button
                          key={x.id}
                          type="button"
                          className="sup-code-chip"
                          onClick={() => toggle(r.employeeId, x.id)}
                          aria-label={`Remove ${x.retailerCode}`}
                        >
                          <strong>{x.retailerCode}</strong>
                          <span>{x.retailerName || ""}</span>
                          <Icon name="close" />
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="sup-code-list">
                    {filter && !outlets.length ? (
                      <p className="kit-hint is-xs">
                        No outlet of {r.name} matches “{filter}”.
                      </p>
                    ) : null}
                    {outlets.map((x) => (
                      <label key={x.id} className={`sup-code-opt${chosen.includes(x.id) ? " is-on" : ""}`}>
                        <input
                          type="checkbox"
                          checked={chosen.includes(x.id)}
                          onChange={() => toggle(r.employeeId, x.id)}
                        />
                        <span>
                          <strong>{x.retailerName || x.retailerCode}</strong>
                          <em>{x.retailerCode}</em>
                        </span>
                      </label>
                    ))}
                    {!r.retailers.length ? (
                      <p className="kit-hint is-xs">This RSO has no outlets on the master list yet.</p>
                    ) : null}
                  </div>
                  <div className="cmp-form-actions">
                    <Btn type="button" size="sm" onClick={() => save(r.employeeId)} disabled={busy === r.employeeId}>
                      {busy === r.employeeId
                        ? "Saving…"
                        : `Save ${chosen.length} code${chosen.length === 1 ? "" : "s"}`}
                    </Btn>
                    {unusual ? (
                      <span className="kit-hint is-xs">
                        More than the usual {SUPPORT_CODES_USUAL}. That is allowed — the slab will count all{" "}
                        {chosen.length}.
                      </span>
                    ) : null}
                  </div>
                </>
              ) : null}
            </Card>
          );
        })}
      </div>
    </>
  );
}

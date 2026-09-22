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

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Btn, Card, EmptyState } from "./Kit";
import { Icon } from "./icons";
import { apiSend } from "@/lib/api-client";

/** What the office usually picks. A hint on the card, never a limit. */
export const SUPPORT_CODES_USUAL = 2;

export type CodePickerRso = {
  employeeId: string;
  name: string;
  code: string | null;
  supervisor: string;
  retailers: { id: string; retailerCode: string; retailerName: string | null; selected: boolean }[];
};

export function SupportCodePicker({ rsos }: { rsos: CodePickerRso[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string[]>>(
    Object.fromEntries(rsos.map((r) => [r.employeeId, r.retailers.filter((x) => x.selected).map((x) => x.id)])),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rsos;
    return rsos.filter((r) => [r.name, r.code || "", r.supervisor].some((v) => v.toLowerCase().includes(q)));
  }, [rsos, search]);

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
    setMessage(r.ok ? "Codes saved." : r.message);
    if (r.ok) router.refresh();
  }

  return (
    <>
      <Card padded>
        <input
          className="kit-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search RSO, code or supervisor"
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
        {shown.map((r) => {
          const chosen = picked[r.employeeId] || [];
          const open = openId === r.employeeId;
          const unusual = chosen.length > SUPPORT_CODES_USUAL;
          return (
            <Card padded key={r.employeeId} className="sup-code-rso">
              <button
                type="button"
                className="sup-code-head"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : r.employeeId)}
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
                  <div className="sup-code-list">
                    {r.retailers.map((x) => (
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

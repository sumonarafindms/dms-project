"use client";

/**
 * Create or edit a campaign.
 *
 * The one decision worth explaining is the scope switch. Picking "whole
 * distribution" or "per RSO / BP" changes which target field is asked for, and
 * the form swaps the field rather than showing both: a campaign carries one
 * kind of number, and a form offering two invites somebody to fill in both and
 * wonder which won. The API stores only the field the scope uses, for the same
 * reason.
 *
 * On EDIT the per-person overrides appear as well. They are a table of
 * exceptions, not a table of everybody — the campaign's own number already
 * covers everyone, so a blank row means "the campaign's number" and a typed
 * row, INCLUDING a zero, means this person is different.
 */

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Card, Field, NumberInput, SectionHead } from "./Kit";
import { Icon } from "./icons";
import { apiSend } from "@/lib/api-client";
import { matchesTokens } from "@/lib/text-search";
import { CAMPAIGN_SCOPES, CAMPAIGN_SCOPE_HINT, CAMPAIGN_SCOPE_LABEL, type CampaignScope } from "../../lib/campaign";

export type CampaignFormEmployee = {
  id: string;
  name: string;
  code: string | null;
  /** v201: the RSO's wallet number, so the search finds them by phone. */
  wallet?: string | null;
  supervisor: string;
  /** The stored override, or "" for none. */
  override: string;
};

export function CampaignForm({
  initial,
  employees,
}: {
  initial?: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    scope: CampaignScope;
    totalTarget: number | null;
    perEmployeeTarget: number | null;
    note: string | null;
    active: boolean;
  };
  /** Empty on create: overrides are set once the campaign exists. */
  employees: CampaignFormEmployee[];
}) {
  const edit = Boolean(initial);
  const router = useRouter();
  const [name, setName] = useState(initial?.name || "");
  const [startDate, setStartDate] = useState(initial?.startDate || "");
  const [endDate, setEndDate] = useState(initial?.endDate || "");
  const [scope, setScope] = useState<CampaignScope>(initial?.scope || "DISTRIBUTION");
  const [totalTarget, setTotalTarget] = useState(initial?.totalTarget ? String(initial.totalTarget) : "");
  const [perEmployeeTarget, setPerEmployeeTarget] = useState(
    initial?.perEmployeeTarget ? String(initial.perEmployeeTarget) : "",
  );
  const [note, setNote] = useState(initial?.note || "");
  const [overrides, setOverrides] = useState<Record<string, string>>(
    Object.fromEntries(employees.map((e) => [e.id, e.override])),
  );
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) =>
      matchesTokens(`${e.name} ${e.code || ""} ${e.supervisor}`.toLowerCase(), q, e.wallet || ""),
    );
  }, [employees, search]);

  const exceptions = Object.entries(overrides).filter(([, v]) => v.trim() !== "").length;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setOk(false);
    const body = {
      ...(edit ? { id: initial!.id } : {}),
      name,
      startDate,
      endDate,
      scope,
      totalTarget: scope === "DISTRIBUTION" ? totalTarget : "",
      perEmployeeTarget: scope === "PER_EMPLOYEE" ? perEmployeeTarget : "",
      note,
      ...(edit ? { targets: overrides } : {}),
    };
    const r = await apiSend<{ id?: string }>("/api/campaigns", edit ? "PATCH" : "POST", body);
    setBusy(false);
    if (!r.ok) {
      setMessage(r.message);
      return;
    }
    setOk(true);
    setMessage(edit ? "Changes saved." : "Campaign created.");
    if (!edit && r.data.id) router.push(`/campaigns/${r.data.id}`);
    router.refresh();
  }

  async function archive() {
    setBusy(true);
    const r = await apiSend("/api/campaigns", "PATCH", { id: initial!.id, active: !initial!.active });
    setBusy(false);
    setOk(r.ok);
    setMessage(r.ok ? (initial!.active ? "Campaign archived." : "Campaign restored.") : r.message);
    router.refresh();
  }

  return (
    <form method="post" onSubmit={submit} className="cmp-form">
      <Card padded>
        <div className="kit-form-grid">
          <Field label="Campaign name" wide>
            <input
              className="kit-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. First-ten-days push"
              maxLength={120}
              required
            />
          </Field>
          <Field label="Starts">
            <input
              className="kit-input"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </Field>
          <Field label="Ends" hint="included">
            <input
              className="kit-input"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </Field>
        </div>
      </Card>

      <SectionHead title="What kind of target" sub="This decides what every screen can show." />
      <div className="cmp-scope">
        {CAMPAIGN_SCOPES.map((s) => (
          <label key={s} className={`cmp-scope-opt${scope === s ? " is-active" : ""}`}>
            <input type="radio" name="scope" value={s} checked={scope === s} onChange={() => setScope(s)} />
            <span>
              <strong>{CAMPAIGN_SCOPE_LABEL[s]}</strong>
              <em>{CAMPAIGN_SCOPE_HINT[s]}</em>
            </span>
          </label>
        ))}
      </div>

      <Card padded>
        {scope === "DISTRIBUTION" ? (
          <Field label="Total SIMs for the whole distribution" hint="everyone together">
            <NumberInput
              min={1}
              value={totalTarget}
              onChange={(e) => setTotalTarget(e.target.value)}
              placeholder="e.g. 500"
            />
          </Field>
        ) : (
          <Field label="SIMs for each RSO and BP" hint="the same number for everyone">
            <NumberInput
              min={1}
              value={perEmployeeTarget}
              onChange={(e) => setPerEmployeeTarget(e.target.value)}
              placeholder="e.g. 25"
            />
          </Field>
        )}
        <Field label="Note" hint="optional — shown on the campaign" wide>
          <input
            className="kit-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="Anything the field should know"
          />
        </Field>
      </Card>

      {edit && scope === "PER_EMPLOYEE" ? (
        <>
          <SectionHead
            title="Exceptions"
            sub={`Leave a row blank and that person gets the campaign's own number. ${exceptions} exception${exceptions === 1 ? "" : "s"} set.`}
          />
          <Card padded>
            <input
              className="kit-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search RSO, code, wallet or supervisor"
              aria-label="Search the list"
            />
            <div className="cmp-override-list">
              {shown.map((e) => (
                <div className="cmp-override" key={e.id}>
                  <span>
                    <strong>{e.name}</strong>
                    <em>
                      {e.code ? `${e.code} · ` : ""}
                      {e.supervisor}
                    </em>
                  </span>
                  <NumberInput
                    min={0}
                    value={overrides[e.id] ?? ""}
                    onChange={(ev) => setOverrides((o) => ({ ...o, [e.id]: ev.target.value }))}
                    placeholder={perEmployeeTarget || "—"}
                    aria-label={`Target for ${e.name}`}
                  />
                </div>
              ))}
              {!shown.length ? <p className="kit-hint is-xs">Nobody matches that.</p> : null}
            </div>
            <p className="kit-hint is-xs">
              A zero means this person is out of the campaign. Their SIMs still count toward the distribution.
            </p>
          </Card>
        </>
      ) : null}

      {message ? (
        <div className={`kit-note ${ok ? "is-ok" : "is-bad"}`} role="status">
          <Icon name={ok ? "check" : "alert"} />
          <span>{message}</span>
        </div>
      ) : null}

      <div className="cmp-form-actions">
        <Btn type="submit" disabled={busy}>
          {busy ? "Saving…" : edit ? "Save changes" : "Create campaign"}
        </Btn>
        {edit ? (
          <Btn type="button" variant="ghost" onClick={archive} disabled={busy}>
            {initial!.active ? "Archive" : "Restore"}
          </Btn>
        ) : null}
      </div>
    </form>
  );
}

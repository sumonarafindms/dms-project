"use client";

/**
 * Set a day's Sim Support offer.
 *
 * The form is a list of slabs plus the SSO offer, and it previews the money as
 * you type. The preview is not decoration: a slab reprices the whole day, so
 * the amounts it produces are not the ones a reader guesses from the rates
 * alone, and seeing "14 SIMs → ৳700, 15 → ৳1,500" while typing is what makes
 * the rule obvious before it is saved and paid.
 */

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Card, Field, NumberInput, SectionHead } from "./Kit";
import { Icon } from "./icons";
import { apiSend } from "@/lib/api-client";
import { slabAmount, sortedSlabs, type SupportSchemeRule } from "../../lib/sim-support";

type SlabRow = { minSims: string; ratePerSim: string };

const money = (n: number) => `৳${Math.round(n).toLocaleString("en-US")}`;

export function SupportSchemeForm({
  initial,
}: {
  initial?: {
    id: string;
    date: string;
    name: string | null;
    note: string | null;
    ssoRatePerSim: string;
    ssoMinSimsSameDay: number | null;
    active: boolean;
    slabs: { minSims: number; ratePerSim: string }[];
  };
}) {
  const edit = Boolean(initial);
  const router = useRouter();
  const [date, setDate] = useState(initial?.date || "");
  const [name, setName] = useState(initial?.name || "");
  const [note, setNote] = useState(initial?.note || "");
  const [ssoRate, setSsoRate] = useState(initial?.ssoRatePerSim || "");
  const [ssoMin, setSsoMin] = useState(initial?.ssoMinSimsSameDay ? String(initial.ssoMinSimsSameDay) : "");
  const [slabs, setSlabs] = useState<SlabRow[]>(
    initial?.slabs.length
      ? initial.slabs.map((s) => ({ minSims: String(s.minSims), ratePerSim: s.ratePerSim }))
      : [{ minSims: "", ratePerSim: "" }],
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);

  /** What the typed slabs would actually pay, at the counts that matter. */
  const preview = useMemo(() => {
    const scheme: SupportSchemeRule = {
      slabs: slabs
        .map((s) => ({ minSims: Number(s.minSims), ratePerSim: Number(s.ratePerSim) }))
        .filter(
          (s) => Number.isFinite(s.minSims) && s.minSims > 0 && Number.isFinite(s.ratePerSim) && s.ratePerSim > 0,
        ),
    };
    const sorted = sortedSlabs(scheme);
    if (!sorted.length) return [];
    /*
     * One row per threshold, and one for the SIM just below it. The pair is
     * the whole point: it shows the jump a slab creates, which is the number
     * the RSO's screen will be chasing.
     */
    const counts = new Set<number>();
    for (const s of sorted) {
      if (s.minSims > 1) counts.add(s.minSims - 1);
      counts.add(s.minSims);
    }
    return [...counts].sort((a, b) => a - b).map((sims) => ({ sims, amount: slabAmount(scheme, sims) }));
  }, [slabs]);

  function setSlab(i: number, patch: Partial<SlabRow>) {
    setSlabs((rows) => rows.map((r, j) => (i === j ? { ...r, ...patch } : r)));
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setOk(false);
    const r = await apiSend<{ id?: string }>("/api/support/schemes", "POST", {
      date,
      name,
      note,
      ssoRatePerSim: ssoRate,
      ssoMinSimsSameDay: ssoMin,
      slabs: slabs.filter((s) => s.minSims.trim() !== "" || s.ratePerSim.trim() !== ""),
    });
    setBusy(false);
    if (!r.ok) {
      setMessage(r.message);
      return;
    }
    setOk(true);
    setMessage("Offer saved.");
    router.push("/support/schemes");
    router.refresh();
  }

  async function archive() {
    setBusy(true);
    const r = await apiSend("/api/support/schemes", "PATCH", { id: initial!.id, active: !initial!.active });
    setBusy(false);
    setOk(r.ok);
    setMessage(r.ok ? (initial!.active ? "Offer switched off." : "Offer switched on.") : r.message);
    router.refresh();
  }

  return (
    <form method="post" onSubmit={submit} className="cmp-form">
      <Card padded>
        <div className="kit-form-grid">
          <Field
            label="Day"
            hint={edit ? "one offer per day" : "one offer per day — saving replaces any offer already set"}
          >
            <input className="kit-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Name" hint="optional">
            <input
              className="kit-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Friday boost"
              maxLength={80}
            />
          </Field>
          <Field label="Note for the field" hint="optional — shown on their screen" wide>
            <input className="kit-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
          </Field>
        </div>
      </Card>

      <SectionHead
        title="Slabs"
        sub="A slab pays its rate on every SIM of the day, not only the ones above its count."
      />
      <Card padded>
        <div className="sup-slab-rows">
          {slabs.map((s, i) => (
            <div className="sup-slab-row" key={i}>
              <Field label="From this many SIMs">
                <NumberInput
                  min={1}
                  value={s.minSims}
                  onChange={(e) => setSlab(i, { minSims: e.target.value })}
                  placeholder="e.g. 6"
                />
              </Field>
              <Field label="Taka per SIM">
                <NumberInput
                  min={0}
                  step="0.01"
                  value={s.ratePerSim}
                  onChange={(e) => setSlab(i, { ratePerSim: e.target.value })}
                  placeholder="e.g. 50"
                />
              </Field>
              <Btn
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setSlabs((rows) =>
                    rows.length === 1 ? [{ minSims: "", ratePerSim: "" }] : rows.filter((_, j) => j !== i),
                  )
                }
                aria-label={`Remove slab ${i + 1}`}
              >
                Remove
              </Btn>
            </div>
          ))}
        </div>
        <Btn
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setSlabs((r) => [...r, { minSims: "", ratePerSim: "" }])}
        >
          <Icon name="target" /> Add a slab
        </Btn>
      </Card>

      {preview.length ? (
        <>
          <SectionHead title="What that pays" sub="Each threshold, and the SIM just below it." />
          <Card padded>
            <ul className="sup-preview">
              {preview.map((p) => (
                <li key={p.sims}>
                  <span>
                    {p.sims.toLocaleString("en-US")} SIM{p.sims === 1 ? "" : "s"}
                  </span>
                  <b>{money(p.amount)}</b>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}

      <SectionHead title="SSO offer" sub="Leave the rate blank on the days it does not run, which is most of them." />
      <Card padded>
        <div className="kit-form-grid">
          <Field label="Taka per SIM for an outlet that completes SSO today">
            <NumberInput
              min={0}
              step="0.01"
              value={ssoRate}
              onChange={(e) => setSsoRate(e.target.value)}
              placeholder="blank = no SSO offer"
            />
          </Field>
          <Field label="Minimum SIMs on the day itself" hint="blank or 1 = completing SSO is the only condition">
            <NumberInput min={1} value={ssoMin} onChange={(e) => setSsoMin(e.target.value)} placeholder="1" />
          </Field>
        </div>
        <p className="kit-hint is-xs">
          Paid on top of the slab, on every SIM that outlet did today. An outlet already past the SSO threshold before
          today does not qualify — the offer is for completing it.
        </p>
      </Card>

      {message ? (
        <div className={`kit-note ${ok ? "is-ok" : "is-bad"}`} role="status">
          <Icon name={ok ? "check" : "alert"} />
          <span>{message}</span>
        </div>
      ) : null}

      <div className="cmp-form-actions">
        <Btn type="submit" disabled={busy}>
          {busy ? "Saving…" : edit ? "Save offer" : "Create offer"}
        </Btn>
        {edit ? (
          <Btn type="button" variant="ghost" onClick={archive} disabled={busy}>
            {initial!.active ? "Switch off" : "Switch on"}
          </Btn>
        ) : null}
      </div>
    </form>
  );
}

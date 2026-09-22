"use client";

/**
 * Set a day's Sim Support offer.
 *
 * Most days the owner runs TWO ladders, one per SIM type — "300৳ SIM Bonus"
 * and "170৳ SIM Bonus" — each with its own rate at each GA step, under one
 * target for the day. That is the default shape here. The original single
 * ladder (every SIM at one rate) is still one tap away, and every offer saved
 * before v198 opens in it unchanged.
 *
 * The form previews the money and the message as you type. The preview is not
 * decoration: a slab reprices the whole day, so the amounts it produces are
 * not the ones a reader guesses from the rates alone — and the message is what
 * the office pastes into the field's group, built from the same numbers the
 * app will pay.
 */

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Card, Field, NumberInput, SectionHead } from "./Kit";
import { Icon } from "./icons";
import { SupportOfferMessage } from "./SupportOfferMessage";
import { apiSend } from "@/lib/api-client";
import {
  SLAB_BASIS_LABEL,
  SPLIT_TIERS,
  SUPPORT_TIER_LABEL,
  ladderSlabs,
  offerMessage,
  rateDrops,
  slabAmount,
  slabFor,
  type SlabBasis,
  type SupportSchemeRule,
  type SupportTier,
} from "../../lib/sim-support";

type SlabRow = { minSims: string; ratePerSim: string };
type Mode = "SPLIT" | "SINGLE";
type Ladders = Record<SupportTier, SlabRow[]>;

export type SchemeFormValues = {
  id?: string;
  date: string;
  name: string | null;
  note: string | null;
  ssoRatePerSim: string;
  ssoMinSimsSameDay: number | null;
  slabBasis: SlabBasis;
  dailyTarget: number | null;
  active?: boolean;
  slabs: { tier: SupportTier; minSims: number; ratePerSim: string }[];
};

const money = (n: number) => `৳${Math.round(n).toLocaleString("en-US")}`;
const blank = (): SlabRow => ({ minSims: "", ratePerSim: "" });

function laddersFrom(values?: SchemeFormValues): { mode: Mode; ladders: Ladders } {
  const ladders: Ladders = { ALL: [], GA_170: [], GA_300: [] };
  for (const s of values?.slabs || []) ladders[s.tier].push({ minSims: String(s.minSims), ratePerSim: s.ratePerSim });
  const mode: Mode = ladders.ALL.length && !ladders.GA_170.length && !ladders.GA_300.length ? "SINGLE" : "SPLIT";
  for (const t of ["ALL", "GA_170", "GA_300"] as SupportTier[]) if (!ladders[t].length) ladders[t] = [blank()];
  return { mode, ladders };
}

/** A typed row that is a real slab: a count of 1+ and a rate above zero. */
function realSlabs(rows: SlabRow[], tier: SupportTier) {
  return rows
    .map((s) => ({ minSims: Number(s.minSims), ratePerSim: Number(s.ratePerSim), tier }))
    .filter((s) => s.minSims > 0 && Number.isFinite(s.minSims) && Number.isFinite(s.ratePerSim) && s.ratePerSim > 0);
}

export function SupportSchemeForm({
  initial,
  template,
}: {
  /** The offer being edited. */
  initial?: SchemeFormValues;
  /** A new offer: the last one saved, so tomorrow's offer starts from today's. */
  template?: SchemeFormValues | null;
}) {
  const edit = Boolean(initial);
  const start = initial || template || undefined;
  const router = useRouter();
  const [date, setDate] = useState(initial?.date || "");
  const [name, setName] = useState(start?.name || "");
  const [note, setNote] = useState(start?.note || "");
  const [target, setTarget] = useState(start?.dailyTarget ? String(start.dailyTarget) : "");
  const [ssoRate, setSsoRate] = useState(start?.ssoRatePerSim || "");
  const [ssoMin, setSsoMin] = useState(start?.ssoMinSimsSameDay ? String(start.ssoMinSimsSameDay) : "");
  const [basis, setBasis] = useState<SlabBasis>(start?.slabBasis || "TOTAL");
  const first = useMemo(() => laddersFrom(start), [start]);
  /*
   * A NEW offer opens on the two ladders — the owner's usual shape — even when
   * the last offer saved was a single ladder from before v198. Its steps are
   * still there under "One rate for every SIM", one tap away.
   */
  const [mode, setMode] = useState<Mode>(edit ? first.mode : "SPLIT");
  const [ladders, setLadders] = useState<Ladders>(first.ladders);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);

  const tiers = useMemo<SupportTier[]>(() => (mode === "SPLIT" ? [...SPLIT_TIERS] : ["ALL"]), [mode]);

  /** What is typed, as the rules read it — the same object the preview, warnings and message use. */
  const scheme: SupportSchemeRule = useMemo(
    () => ({
      slabs: tiers.flatMap((t) => realSlabs(ladders[t], t)),
      ssoRatePerSim: Number(ssoRate) || null,
      ssoMinSimsSameDay: Number(ssoMin) || null,
      basis,
      dailyTarget: Number(target) || null,
    }),
    [ladders, tiers, ssoRate, ssoMin, basis, target],
  );

  const drops = useMemo(() => rateDrops(scheme), [scheme]);

  /**
   * The steps side by side. On a split day one row per GA count that appears
   * on either ladder, with each ladder's rate at that count — the same table
   * the owner's message is.
   */
  const steps = useMemo(() => {
    const at = [...new Set(scheme.slabs.map((s) => s.minSims))].sort((a, b) => a - b);
    return at.map((sims) => ({
      sims,
      rates: tiers.map((t) => {
        const rule = { slabs: scheme.slabs.filter((s) => s.tier === t) };
        return slabFor(rule, sims)?.ratePerSim ?? null;
      }),
    }));
  }, [scheme, tiers]);

  /** Single ladder: each threshold and the SIM just below it — the jump a slab creates. */
  const singlePreview = useMemo(() => {
    if (mode !== "SINGLE") return [];
    const sorted = ladderSlabs(scheme, "ALL");
    const at = new Set<number>();
    for (const s of sorted) {
      if (s.minSims > 1) at.add(s.minSims - 1);
      at.add(s.minSims);
    }
    return [...at].sort((a, b) => a - b).map((sims) => ({ sims, amount: slabAmount(scheme, sims) }));
  }, [scheme, mode]);

  const messageText = useMemo(
    () =>
      scheme.slabs.length || Number(scheme.ssoRatePerSim) > 0
        ? offerMessage(scheme, { dateYmd: date, name, note })
        : "",
    [scheme, date, name, note],
  );

  function setRow(tier: SupportTier, i: number, patch: Partial<SlabRow>) {
    setLadders((l) => ({ ...l, [tier]: l[tier].map((r, j) => (i === j ? { ...r, ...patch } : r)) }));
  }
  function addRow(tier: SupportTier) {
    setLadders((l) => ({ ...l, [tier]: [...l[tier], blank()] }));
  }
  function removeRow(tier: SupportTier, i: number) {
    setLadders((l) => ({ ...l, [tier]: l[tier].length === 1 ? [blank()] : l[tier].filter((_, j) => j !== i) }));
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setOk(false);
    const slabs = tiers.flatMap((t) =>
      ladders[t].filter((s) => s.minSims.trim() !== "" || s.ratePerSim.trim() !== "").map((s) => ({ ...s, tier: t })),
    );
    const r = await apiSend<{ id?: string }>("/api/support/schemes", "POST", {
      date,
      name,
      note,
      dailyTarget: target,
      slabBasis: basis,
      ssoRatePerSim: ssoRate,
      ssoMinSimsSameDay: ssoMin,
      slabs,
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
      {!edit && template ? (
        <div className="kit-note is-info" role="status">
          <Icon name="info" />
          <span>Started from the last offer you saved. Pick the day, change what is different, and save.</span>
        </div>
      ) : null}
      <Card padded>
        <div className="kit-form-grid">
          <Field
            label="Day"
            hint={edit ? "one offer per day" : "one offer per day — saving replaces any offer already set"}
          >
            <input className="kit-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Today's target" hint="GA — shown to the field, pays nothing on its own">
            <NumberInput min={1} value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. 25" />
          </Field>
          <Field label="Heading" hint="optional — the first line of the message">
            <input
              className="kit-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="BP & RSO WARRIORS"
              maxLength={80}
            />
          </Field>
          <Field label="Note for the field" hint="optional — shown on their screen">
            <input className="kit-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
          </Field>
        </div>
      </Card>

      <SectionHead title="SIM bonus" sub="A step pays its rate on every SIM of the day, not only the ones above it." />
      <Card padded className="sup-ladders-card">
        <div className="ops-level-tabs" role="tablist" aria-label="How the SIM bonus is set">
          {(
            [
              ["SPLIT", "170৳ and 300৳ apart"],
              ["SINGLE", "One rate for every SIM"],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className={`ops-level-tab${mode === m ? " is-active" : ""}`}
              onClick={() => setMode(m)}
            >
              <span>{label}</span>
            </button>
          ))}
        </div>

        {mode === "SPLIT" ? (
          <fieldset className="sup-basis">
            <legend className="kit-label">Which GA count picks the step?</legend>
            {(["TOTAL", "OWN"] as SlabBasis[]).map((b) => (
              <label key={b} className={`sup-basis-opt${basis === b ? " is-on" : ""}`}>
                <input type="radio" name="slabBasis" checked={basis === b} onChange={() => setBasis(b)} />
                <span>
                  <strong>{SLAB_BASIS_LABEL[b]}</strong>
                  <em>
                    {b === "TOTAL"
                      ? "8 GA on the day (say 5 of 300 and 3 of 170) puts BOTH ladders on their 7 GA step."
                      : "5 of 300 and 3 of 170 puts the 300 ladder on its 5 step; the 170 ladder is below its first."}
                  </em>
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}

        <div className={`sup-ladders${mode === "SPLIT" ? " is-split" : ""}`}>
          {tiers.map((tier) => (
            <section key={tier} className={`sup-ladder is-${tier.toLowerCase()}`} aria-label={SUPPORT_TIER_LABEL[tier]}>
              <header className="sup-ladder-head">
                <strong>{tier === "ALL" ? "Every SIM" : `${SUPPORT_TIER_LABEL[tier]} bonus`}</strong>
                <em>From this many GA → taka per SIM</em>
              </header>
              <div className="sup-slab-rows">
                {ladders[tier].map((s, i) => (
                  <div className="sup-slab-row" key={i}>
                    <Field label="From GA">
                      <NumberInput
                        min={1}
                        value={s.minSims}
                        onChange={(e) => setRow(tier, i, { minSims: e.target.value })}
                        placeholder="e.g. 5"
                        aria-label={`${SUPPORT_TIER_LABEL[tier]} step ${i + 1}: from GA`}
                      />
                    </Field>
                    <Field label="৳ per SIM">
                      <NumberInput
                        min={0}
                        step="0.01"
                        value={s.ratePerSim}
                        onChange={(e) => setRow(tier, i, { ratePerSim: e.target.value })}
                        placeholder="e.g. 50"
                        aria-label={`${SUPPORT_TIER_LABEL[tier]} step ${i + 1}: taka per SIM`}
                      />
                    </Field>
                    <Btn
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRow(tier, i)}
                      aria-label={`Remove ${SUPPORT_TIER_LABEL[tier]} step ${i + 1}`}
                    >
                      Remove
                    </Btn>
                  </div>
                ))}
              </div>
              <Btn type="button" variant="secondary" size="sm" onClick={() => addRow(tier)}>
                <Icon name="target" /> Add a step
              </Btn>
            </section>
          ))}
        </div>

        {drops.length ? (
          <div className="kit-note is-warn" role="status">
            <Icon name="alert" />
            <span>
              {drops
                .map(
                  (d) =>
                    `${d.tier === "ALL" ? "" : `${SUPPORT_TIER_LABEL[d.tier]}: `}at ${d.minSims} GA the rate DROPS from ৳${d.previousRate} to ৳${d.rate}`,
                )
                .join("; ")}
              . A step reprices the whole day, so selling more would pay less. Check it is not a typo before saving.
            </span>
          </div>
        ) : null}
      </Card>

      {mode === "SPLIT" && steps.length ? (
        <>
          <SectionHead title="The steps side by side" sub="Taka per SIM at each GA step, on each ladder." />
          <Card padded>
            <table className="sup-steps">
              <thead>
                <tr>
                  <th scope="col">GA</th>
                  {tiers.map((t) => (
                    <th scope="col" key={t} className="is-right">
                      {SUPPORT_TIER_LABEL[t]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {steps.map((s) => (
                  <tr key={s.sims}>
                    <th scope="row">{s.sims.toLocaleString("en-US")}+</th>
                    {s.rates.map((r, i) => (
                      <td key={tiers[i]} className="is-right">
                        {r === null ? "—" : money(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      ) : null}

      {singlePreview.length ? (
        <>
          <SectionHead title="What that pays" sub="Each threshold, and the SIM just below it." />
          <Card padded>
            <ul className="sup-preview">
              {singlePreview.map((p) => (
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
          Paid on top of the SIM bonus, on every SIM that outlet did today. An outlet already past the SSO threshold
          before today does not qualify — the offer is for completing it.
        </p>
      </Card>

      {messageText ? (
        <>
          <SectionHead title="The message" sub="Built from the numbers above — paste it in the field's group." />
          <Card padded>
            <SupportOfferMessage text={messageText} />
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

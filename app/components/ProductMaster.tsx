"use client";

/**
 * The product master and its price list.
 *
 * ## What changed in v193, and why the screen now feels permissive
 *
 * v192 refused to edit a price once anything referred to it, and made a
 * duplicate product instead. That rule was the only thing protecting every
 * recorded figure, so it had to be strict, and the cost was a product list
 * that grew a new "Swap SIM" four times a year.
 *
 * The protection has moved into the data: every movement carries the price it
 * was recorded at. So a product is an identity, its prices are a dated list,
 * and both can be corrected freely — **because nothing already recorded reads
 * either of them any more**. The freedom here is not the old rule relaxed; it
 * is what became safe once the rule stopped being load-bearing.
 *
 * One thing the screen says out loud, because it is the one thing people
 * expect and do not get: adding a price starting last Tuesday does NOT
 * reprice what was handed out last Tuesday. Those rows keep what the person
 * was actually given at. The count of entries on or after the date is shown
 * after saving so nobody has to guess.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Btn, Card, EmptyState, Field, NumberInput, SectionHead } from "./Kit";
import { Icon } from "./icons";
import { apiSend } from "@/lib/api-client";
import { fmtMoney } from "@/lib/format";
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABEL, kindLabel, type ProductCategory } from "@/lib/stock";
import { useConfirm, useToast } from "./Feedback";

export type ActivationType = "GA_170" | "GA_300" | "SIM_SWAP";

/** The built-in kinds in the Kind menu. OTHER is not one of them — it is "+ A new kind…". */
const KIND_OPTIONS = PRODUCT_CATEGORIES.filter((c) => c !== "OTHER");

/** What a SIM product shows up as in the company's activation feed (v198). */
export const ACTIVATION_LABEL: Record<ActivationType, string> = {
  GA_170: "GA 170 (normal 150/170 SIM)",
  GA_300: "GA 300 (normal 300 SIM)",
  SIM_SWAP: "SIM swap",
};
const ACTIVATION_OPTIONS: [ActivationType | "", string][] = [
  ["GA_170", ACTIVATION_LABEL.GA_170],
  ["GA_300", ACTIVATION_LABEL.GA_300],
  ["SIM_SWAP", ACTIVATION_LABEL.SIM_SWAP],
  ["", "Not linked"],
];

export type MasterProduct = {
  id: string;
  category: ProductCategory;
  subType: string;
  unitLabel: string | null;
  status: "ACTIVE" | "INACTIVE";
  kindName: string | null;
  activationType: ActivationType | null;
  movements: number;
  /** Newest first. */
  prices: { price: number; effectiveFrom: string }[];
  current: number | null;
};

export function ProductMaster({ products, today }: { products: MasterProduct[]; today: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showRetired, setShowRetired] = useState(false);

  const [add, setAdd] = useState({
    category: "SIM" as ProductCategory,
    /** v201: the kind's own name when category is OTHER — an existing one or a new one. */
    kindName: "",
    subType: "",
    unitLabel: "",
    price: "",
    effectiveFrom: today,
    activationType: "" as ActivationType | "",
  });
  const [newPrice, setNewPrice] = useState({ price: "", effectiveFrom: today });
  const [rename, setRename] = useState("");

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(
      (p) => (showRetired || p.status === "ACTIVE") && (!q || `${p.subType} ${kindLabel(p)}`.toLowerCase().includes(q)),
    );
  }, [products, search, showRetired]);

  /*
   * v201: the owner's own kinds — "Smart watch" — already in use, so the Kind
   * menu offers them again instead of asking for the name to be retyped (and
   * spelt differently) every time.
   */
  const customKinds = useMemo(
    () =>
      [...new Set(products.filter((p) => p.category === "OTHER" && p.kindName).map((p) => p.kindName!.trim()))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [products],
  );
  /** The Kind menu's value: a built-in kind, `OTHER:<name>`, or `NEW` while a new name is typed. */
  /*
   * Typing a new kind is its own state, not inferred from the text: with a
   * "Watch" kind already saved, typing "Watch band" passed through "Watch", the
   * menu decided that was the existing kind and the box being typed into
   * vanished under the finger. Once saved, the menu shows the kind as the
   * server spelled it ("smart watch" joins "Smart watch").
   */
  const [typingKind, setTypingKind] = useState(false);
  const savedKind =
    add.category === "OTHER" && !typingKind
      ? customKinds.find((k) => k.toLowerCase() === add.kindName.trim().toLowerCase())
      : undefined;
  const kindValue = add.category !== "OTHER" ? add.category : savedKind ? `OTHER:${savedKind}` : "NEW";

  /* Grouped by kind, because a catalogue of SIMs, cards, routers and handsets
     read as one flat list is a list nobody scans. The owner's own kinds each
     get their own group, after the built-in ones. */
  const groups = useMemo(() => {
    const by = new Map<string, MasterProduct[]>();
    for (const p of shown) {
      const k = kindLabel(p);
      by.set(k, [...(by.get(k) || []), p]);
    }
    const builtIn = PRODUCT_CATEGORIES.filter((c) => c !== "OTHER").map((c) => PRODUCT_CATEGORY_LABEL[c]);
    const order = [
      ...builtIn,
      ...[...by.keys()].filter((k) => !builtIn.includes(k)).sort((a, b) => a.localeCompare(b)),
    ];
    return order.filter((k) => by.has(k)).map((k) => [k, by.get(k)!] as const);
  }, [shown]);

  async function send(body: unknown, method: string, okText: string) {
    setBusy(true);
    setMessage("");
    const r = await apiSend<{ entriesOnOrAfter?: number }>("/api/stock/products", method, body);
    setBusy(false);
    setOk(r.ok);
    if (!r.ok) return setMessage(r.message);
    const n = r.data?.entriesOnOrAfter;
    // v205: the "done" is a toast; the note stays only when there is more to say.
    toast(okText);
    setMessage(
      n
        ? `${n} ${n === 1 ? "entry" : "entries"} already recorded on or after that date keep the price they were entered at.`
        : "",
    );
    router.refresh();
    return true;
  }

  return (
    <>
      <Card className="kit-card-p kit-mb-20">
        <SectionHead
          title="Add a product"
          sub="iTopup is a product whose unit is the Taka — price it at 1 and enter the amount as the quantity."
        />
        <div className="kit-form-grid">
          <Field label="Kind">
            <select
              className="kit-input"
              value={kindValue}
              onChange={(e) => {
                const v = e.target.value;
                setTypingKind(v === "NEW");
                if (v === "NEW") setAdd({ ...add, category: "OTHER", kindName: "" });
                else if (v.startsWith("OTHER:")) setAdd({ ...add, category: "OTHER", kindName: v.slice(6) });
                else setAdd({ ...add, category: v as ProductCategory, kindName: "" });
              }}
            >
              {KIND_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {PRODUCT_CATEGORY_LABEL[c]}
                </option>
              ))}
              {customKinds.map((k) => (
                <option key={`OTHER:${k}`} value={`OTHER:${k}`}>
                  {k}
                </option>
              ))}
              <option value="NEW">+ A new kind…</option>
            </select>
          </Field>
          {kindValue === "NEW" && (
            <Field label="New kind" hint="e.g. Smart watch, Power bank, Earphone">
              <input
                className="kit-input"
                value={add.kindName}
                onChange={(e) => {
                  setTypingKind(true);
                  setAdd({ ...add, kindName: e.target.value });
                }}
                maxLength={40}
                placeholder="Name the kind"
                autoFocus
              />
            </Field>
          )}
          <Field label="Name" hint="e.g. Normal 150, Swap SIM, E-SIM">
            <input
              className="kit-input"
              value={add.subType}
              onChange={(e) => setAdd({ ...add, subType: e.target.value })}
            />
          </Field>
          <Field label="Price">
            <NumberInput
              min="0"
              step="0.01"
              value={add.price}
              onChange={(e) => setAdd({ ...add, price: e.target.value })}
            />
          </Field>
          <Field label="Price starts">
            <input
              className="kit-input"
              type="date"
              value={add.effectiveFrom}
              onChange={(e) => setAdd({ ...add, effectiveFrom: e.target.value })}
            />
          </Field>
          {add.category === "SIM" && (
            <Field label="Activates as" hint="so the Accounts home can show sold beside activated">
              <select
                className="kit-input"
                value={add.activationType}
                onChange={(e) => setAdd({ ...add, activationType: e.target.value as ActivationType | "" })}
              >
                {ACTIVATION_OPTIONS.map(([v, label]) => (
                  <option key={v || "none"} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <Btn
          onClick={async () => {
            if (await send(add, "POST", `${add.subType.trim()} added`)) {
              setAdd({
                ...add,
                kindName: add.kindName.trim(),
                subType: "",
                unitLabel: "",
                price: "",
                activationType: "",
              });
              setTypingKind(false);
            }
            // A new kind, once saved, is one of the kinds in the menu — the menu keeps it selected.
          }}
          disabled={busy || !add.subType || add.price === "" || (add.category === "OTHER" && !add.kindName.trim())}
        >
          {busy ? "Saving…" : "Add product"}
        </Btn>
      </Card>

      {message && <p className={ok ? "kit-note is-ok" : "kit-note is-bad"}>{message}</p>}

      <div className="kit-form-grid kit-mb-16">
        <Field label="Find a product">
          <input
            className="kit-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or kind"
          />
        </Field>
        <Field label="Retired products">
          <select
            className="kit-input"
            value={showRetired ? "y" : "n"}
            onChange={(e) => setShowRetired(e.target.value === "y")}
          >
            <option value="n">Hide</option>
            <option value="y">Show</option>
          </select>
        </Field>
      </div>

      {!groups.length ? (
        <EmptyState
          title={products.length ? "No product matches" : "No products yet"}
          hint={products.length ? "Try a different name." : "Add what you hand out and the entry screen will list it."}
          icon={<Icon name="shop" />}
        />
      ) : (
        groups.map(([kind, rows]) => (
          <section key={kind} className="kit-mb-20">
            <SectionHead title={kind} sub={`${rows.length} ${rows.length === 1 ? "product" : "products"}`} />
            <div className="kit-table-wrap">
              <table className="kit-report-table" role="table">
                <thead>
                  <tr role="row">
                    <th role="columnheader" scope="col">
                      Product
                    </th>
                    <th role="columnheader" scope="col" className="is-right">
                      Price now
                    </th>
                    <th role="columnheader" scope="col" className="is-right">
                      Prices
                    </th>
                    <th role="columnheader" scope="col">
                      State
                    </th>
                    <th role="columnheader" scope="col" className="is-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr role="row" key={p.id}>
                      <td role="cell" data-label="Product">
                        <strong>{p.subType}</strong>
                        {p.movements > 0 && (
                          <span className="kit-cell-sub">{p.movements.toLocaleString("en-US")} entries</span>
                        )}
                        {p.category === "SIM" && (
                          <span className="kit-cell-sub">
                            {p.activationType
                              ? `Activates as ${ACTIVATION_LABEL[p.activationType]}`
                              : "Activations not linked"}
                          </span>
                        )}
                      </td>
                      <td role="cell" data-label="Price now" className="is-right">
                        {p.current === null ? <span className="kit-cell-unset">No price</span> : fmtMoney(p.current)}
                      </td>
                      <td role="cell" data-label="Prices" className="is-right">
                        {p.prices.length}
                      </td>
                      <td role="cell" data-label="State">
                        <Badge tone={p.status === "ACTIVE" ? "active" : "inactive"}>
                          {p.status === "ACTIVE" ? "In use" : "Retired"}
                        </Badge>
                      </td>
                      <td role="cell" data-label="Action" className="is-right">
                        <span className="kit-rowacts">
                          <Btn
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const next = open === p.id ? null : p.id;
                              setOpen(next);
                              setNewPrice({ price: "", effectiveFrom: today });
                              setRename(p.subType);
                            }}
                          >
                            {open === p.id ? "Close" : "Prices"}
                          </Btn>
                          <Btn
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={async () => {
                              if (
                                p.status === "ACTIVE" &&
                                !(await confirm({
                                  title: `Retire ${p.subType}?`,
                                  body: "It leaves the entry screens. Everything already recorded stays, and you can use it again later.",
                                  confirmLabel: "Retire",
                                  danger: true,
                                }))
                              )
                                return;
                              send(
                                { id: p.id, status: p.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" },
                                "PATCH",
                                p.status === "ACTIVE" ? `${p.subType} retired` : `${p.subType} back in use`,
                              );
                            }}
                          >
                            {p.status === "ACTIVE" ? "Retire" : "Use again"}
                          </Btn>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {rows
              .filter((p) => open === p.id)
              .map((p) => (
                <Card key={`${p.id}-panel`} className="kit-card-p kit-mb-20">
                  <SectionHead
                    title={`${p.subType} — price history`}
                    sub="Each price applies from its date until the next one. Entries already recorded keep the price they were entered at."
                  />
                  <ul className="kit-pricelist">
                    {p.prices.map((pr, i) => (
                      <li key={pr.effectiveFrom}>
                        <span className="kit-pricelist-amount">{fmtMoney(pr.price)}</span>
                        <span className="kit-pricelist-from">
                          from {pr.effectiveFrom}
                          {i === 0 && pr.effectiveFrom <= today && " · in force now"}
                          {pr.effectiveFrom > today && " · starts later"}
                        </span>
                        {p.prices.length > 1 && (
                          <Btn
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={async () => {
                              if (
                                !(await confirm({
                                  title: `Remove the ${fmtMoney(pr.price)} price from ${pr.effectiveFrom}?`,
                                  body: "Entries already recorded keep the price they were entered at.",
                                  confirmLabel: "Remove price",
                                  danger: true,
                                }))
                              )
                                return;
                              send({ productId: p.id, effectiveFrom: pr.effectiveFrom }, "DELETE", "Price removed");
                            }}
                          >
                            Remove
                          </Btn>
                        )}
                      </li>
                    ))}
                  </ul>

                  <div className="kit-form-grid">
                    <Field label="New price">
                      <NumberInput
                        min="0"
                        step="0.01"
                        value={newPrice.price}
                        onChange={(e) => setNewPrice({ ...newPrice, price: e.target.value })}
                      />
                    </Field>
                    <Field label="Starts from">
                      <input
                        className="kit-input"
                        type="date"
                        value={newPrice.effectiveFrom}
                        onChange={(e) => setNewPrice({ ...newPrice, effectiveFrom: e.target.value })}
                      />
                    </Field>
                    <Field label="Name" hint="A label; no figure reads it">
                      <input className="kit-input" value={rename} onChange={(e) => setRename(e.target.value)} />
                    </Field>
                    {p.category === "SIM" && (
                      <Field label="Activates as" hint="saved as soon as it is picked">
                        <select
                          className="kit-input"
                          value={p.activationType ?? ""}
                          disabled={busy}
                          onChange={(e) =>
                            send({ id: p.id, activationType: e.target.value }, "PATCH", "Activation link saved")
                          }
                        >
                          {ACTIVATION_OPTIONS.map(([v, label]) => (
                            <option key={v || "none"} value={v}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}
                  </div>
                  <span className="kit-rowacts">
                    <Btn
                      disabled={busy || newPrice.price === ""}
                      onClick={() => send({ id: p.id, ...newPrice }, "PATCH", "Price saved")}
                    >
                      Save price
                    </Btn>
                    <Btn
                      variant="ghost"
                      disabled={busy || !rename.trim() || rename === p.subType}
                      onClick={() => send({ id: p.id, subType: rename }, "PATCH", "Renamed")}
                    >
                      Rename
                    </Btn>
                  </span>
                </Card>
              ))}
          </section>
        ))
      )}

      <p className="kit-note">
        <Icon name="info" /> Prices can be added, corrected and removed freely. Every entry already recorded carries the
        price it was entered at, so changing a price here cannot move a figure that has already been saved.
      </p>
    </>
  );
}

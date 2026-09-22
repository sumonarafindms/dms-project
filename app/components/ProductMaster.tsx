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
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABEL, type ProductCategory } from "@/lib/stock";

export type MasterProduct = {
  id: string;
  category: ProductCategory;
  subType: string;
  unitLabel: string | null;
  status: "ACTIVE" | "INACTIVE";
  movements: number;
  /** Newest first. */
  prices: { price: number; effectiveFrom: string }[];
  current: number | null;
};

export function ProductMaster({ products, today }: { products: MasterProduct[]; today: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showRetired, setShowRetired] = useState(false);

  const [add, setAdd] = useState({
    category: "SIM" as ProductCategory,
    subType: "",
    unitLabel: "",
    price: "",
    effectiveFrom: today,
  });
  const [newPrice, setNewPrice] = useState({ price: "", effectiveFrom: today });
  const [rename, setRename] = useState("");

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(
      (p) =>
        (showRetired || p.status === "ACTIVE") &&
        (!q || `${p.subType} ${PRODUCT_CATEGORY_LABEL[p.category]}`.toLowerCase().includes(q)),
    );
  }, [products, search, showRetired]);

  /* Grouped by kind, because a catalogue of SIMs, cards, routers and handsets
     read as one flat list is a list nobody scans. */
  const groups = useMemo(() => {
    const by = new Map<ProductCategory, MasterProduct[]>();
    for (const p of shown) by.set(p.category, [...(by.get(p.category) || []), p]);
    return PRODUCT_CATEGORIES.filter((c) => by.has(c)).map((c) => [c, by.get(c)!] as const);
  }, [shown]);

  async function send(body: unknown, method: string, okText: string) {
    setBusy(true);
    setMessage("");
    const r = await apiSend<{ entriesOnOrAfter?: number }>("/api/stock/products", method, body);
    setBusy(false);
    setOk(r.ok);
    if (!r.ok) return setMessage(r.message);
    const n = r.data?.entriesOnOrAfter;
    setMessage(
      n
        ? `${okText} ${n} ${n === 1 ? "entry" : "entries"} already recorded on or after that date keep the price they were entered at.`
        : okText,
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
              value={add.category}
              onChange={(e) => setAdd({ ...add, category: e.target.value as ProductCategory })}
            >
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {PRODUCT_CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
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
        </div>
        <Btn
          onClick={async () => {
            if (await send(add, "POST", "Product added.")) setAdd({ ...add, subType: "", unitLabel: "", price: "" });
          }}
          disabled={busy || !add.subType || add.price === ""}
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
        groups.map(([category, rows]) => (
          <section key={category} className="kit-mb-20">
            <SectionHead
              title={PRODUCT_CATEGORY_LABEL[category]}
              sub={`${rows.length} ${rows.length === 1 ? "product" : "products"}`}
            />
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
                            onClick={() =>
                              send(
                                { id: p.id, status: p.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" },
                                "PATCH",
                                p.status === "ACTIVE" ? "Retired." : "Back in use.",
                              )
                            }
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
                            onClick={() =>
                              send({ productId: p.id, effectiveFrom: pr.effectiveFrom }, "DELETE", "Price removed.")
                            }
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
                  </div>
                  <span className="kit-rowacts">
                    <Btn
                      disabled={busy || newPrice.price === ""}
                      onClick={() => send({ id: p.id, ...newPrice }, "PATCH", "Price saved.")}
                    >
                      Save price
                    </Btn>
                    <Btn
                      variant="ghost"
                      disabled={busy || !rename.trim() || rename === p.subType}
                      onClick={() => send({ id: p.id, subType: rename }, "PATCH", "Renamed.")}
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

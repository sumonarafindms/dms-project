"use client";

/**
 * The Accounts home's two halves: what moved, product by product, and who is
 * holding it. Data from `lib/accounts-overview.ts`; this file only lays it out.
 *
 * One period switch drives the whole page — "This month" or "Yesterday" — so
 * the product cards and the people below them always talk about the same days.
 * A page where the top said one period and the bottom another is a page whose
 * numbers cannot be compared, which is the only thing a home page is for.
 *
 * Client-side because the switch, the holder tabs and the search are all
 * instant view changes over data that is already here: a few hundred small
 * rows, not worth a round trip per tap.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppLink as Link } from "./AppLink";
import { Card, EmptyState } from "./Kit";
import { Icon } from "./icons";
import { fmtDate, fmtMoney, fmtNumber } from "@/lib/format";
import { HOLDER_TYPE_LABEL, kindLabel, type HolderType } from "@/lib/stock";
import { matchesTokens } from "@/lib/text-search";
import {
  QUIET_DAYS,
  SHELF_LABEL,
  attentionCount,
  shelfOf,
  type Attention,
  type AccountsOverview as Overview,
  type HolderStock,
  type OverviewProduct,
  type PeriodKey,
  type ProductFlow,
  type ShelfKey,
} from "@/lib/accounts-shelves";

const SHELVES: ShelfKey[] = ["SIM_NORMAL", "SIM_SWAP", "CARD", "ITOPUP", "DEVICE", "OTHER"];
const SHELF_ICON: Record<ShelfKey, string> = {
  SIM_NORMAL: "sim",
  SIM_SWAP: "sim",
  CARD: "wallet",
  ITOPUP: "balance",
  DEVICE: "phone",
  OTHER: "shop",
};

/** Units for everything, Taka for iTopup — whose unit IS the Taka. */
const qty = (p: Pick<OverviewProduct, "category">, n: number) => (p.category === "ITOPUP" ? fmtMoney(n) : fmtNumber(n));

function hasMovement(f: ProductFlow | undefined) {
  return !!f && !!(f.lifted || f.given || f.sold || f.returned || f.activated);
}

/** Short enough to sit under a figure a quarter of a card wide. */
const SHORT: Record<HolderType, string> = { RSO: "RSO", SUPERVISOR: "Sup", BP: "BP" };

/** "RSO 40 · Sup 5" — only when someone other than RSOs took any. */
function byLine(by: Record<HolderType, number>, p: OverviewProduct) {
  const parts = (Object.keys(by) as HolderType[]).filter((t) => by[t]);
  if (!parts.length || (parts.length === 1 && parts[0] === "RSO")) return null;
  return parts.map((t) => `${SHORT[t]} ${qty(p, by[t])}`).join(" · ");
}

function Metric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string | null;
  tone?: "muted" | "good" | "warn";
}) {
  return (
    <div className={`acc-metric${tone ? ` is-${tone}` : ""}`}>
      <span className="acc-metric-label">{label}</span>
      <b className="acc-metric-value">{value}</b>
      {sub ? <span className="acc-metric-sub">{sub}</span> : null}
    </div>
  );
}

function ProductCard({
  product,
  flow,
  godown,
  sharedWith,
}: {
  product: OverviewProduct;
  flow: ProductFlow;
  godown: number | undefined;
  sharedWith: string[];
}) {
  const isSim = product.category === "SIM";
  const linked = isSim && product.activationType !== null;
  /*
   * The gap between what was reported sold and what the company activated.
   * Only for a SIM whose link is its own: when two products share a link, the
   * activations belong to the pair and a per-product gap would be invented.
   */
  const gap = linked && !sharedWith.length && flow.activated !== null ? flow.activated - flow.sold : 0;
  return (
    <article className="acc-flow">
      <header className="acc-flow-head">
        <strong>
          {product.subType}
          {product.category === "OTHER" ? <em className="acc-flow-kind">{kindLabel(product)}</em> : null}
        </strong>
        {godown !== undefined && godown !== 0 ? (
          <span className={`acc-chip${godown < 0 ? " is-bad" : ""}`} title="In the godown now">
            Godown {qty(product, godown)}
          </span>
        ) : null}
      </header>
      <div className={`acc-metrics${isSim ? " is-four" : product.category === "ITOPUP" ? " is-money" : ""}`}>
        <Metric label="Company lifting" value={qty(product, flow.lifted)} tone={flow.lifted ? undefined : "muted"} />
        <Metric
          label="Given out"
          value={qty(product, flow.given)}
          sub={byLine(flow.givenBy, product)}
          tone={flow.given ? undefined : "muted"}
        />
        <Metric
          label="Reported sold"
          value={qty(product, flow.sold)}
          sub={byLine(flow.soldBy, product)}
          tone={flow.sold ? undefined : "muted"}
        />
        {isSim ? (
          linked ? (
            <Metric
              label="Activated"
              value={fmtNumber(flow.activated ?? 0)}
              sub={sharedWith.length ? `shared with ${sharedWith.join(", ")}` : "company feed"}
              tone="good"
            />
          ) : (
            <Metric label="Activated" value="—" sub="not linked — set on Products" tone="muted" />
          )
        ) : null}
      </div>
      {gap > 0 ? (
        <p className="acc-flow-note is-warn">
          <Icon name="alert" /> {fmtNumber(gap)} more activated than reported sold —{" "}
          <Link href="/stock/sim-check">SIM check →</Link>
        </p>
      ) : gap < 0 ? (
        <p className="acc-flow-note">
          <Icon name="info" /> {fmtNumber(-gap)} reported sold, not activated yet
        </p>
      ) : null}
    </article>
  );
}

function ShelfTotals({ rows, period }: { rows: OverviewProduct[]; period: Overview["periods"][PeriodKey] }) {
  // Units add up across a shelf; iTopup is one product, so this is never Taka + pieces.
  const sum = (k: "lifted" | "given" | "sold") => rows.reduce((a, p) => a + (period.flows[p.id]?.[k] || 0), 0);
  const p = rows[0];
  return (
    <span className="acc-shelf-totals">
      <span>
        Lifted <b>{qty(p, sum("lifted"))}</b>
      </span>
      <span>
        Given <b>{qty(p, sum("given"))}</b>
      </span>
      <span>
        Sold <b>{qty(p, sum("sold"))}</b>
      </span>
    </span>
  );
}

function HolderRow({
  holder,
  period,
  products,
  today,
  team,
}: {
  holder: HolderStock;
  period: PeriodKey;
  products: Map<string, OverviewProduct>;
  today: string;
  /** Supervisors only: how many people are in their team, and how many owe (v200). */
  team?: { people: number; owing: number; quiet: number };
}) {
  const shelfSum = (pred: (p: OverviewProduct) => boolean) =>
    holder.lines.reduce((a, l) => {
      const p = products.get(l.productId);
      return p && pred(p) ? a + l.inHand : a;
    }, 0);
  const sims = shelfSum((p) => p.category === "SIM");
  const cards = shelfSum((p) => p.category === "CARD");
  const topup = shelfSum((p) => p.category === "ITOPUP");
  const devices = shelfSum((p) => p.category === "ROUTER" || p.category === "HANDSET");
  const others = shelfSum((p) => p.category === "OTHER");
  const unitsTook = holder.lines.reduce(
    (a, l) => (products.get(l.productId)?.category === "ITOPUP" ? a : a + l.took[period]),
    0,
  );
  const unitsSold = holder.lines.reduce(
    (a, l) => (products.get(l.productId)?.category === "ITOPUP" ? a : a + l.sold[period]),
    0,
  );
  const quiet = !holder.lastDeposit || daysBetween(holder.lastDeposit, today) >= QUIET_DAYS;
  return (
    <details className="acc-holder">
      <summary>
        <span className="acc-holder-who">
          <strong>
            {holder.name}
            {holder.inactive ? <span className="acc-chip is-muted"> no longer active</span> : null}
          </strong>
          <em>
            {[holder.code, holder.supervisorName ? `under ${holder.supervisorName}` : null]
              .filter(Boolean)
              .join(" · ") || HOLDER_TYPE_LABEL[holder.type]}
          </em>
        </span>
        <span className="acc-holder-hand" aria-label="In hand now">
          {sims ? <span className="acc-chip">SIM {fmtNumber(sims)}</span> : null}
          {cards ? <span className="acc-chip">Card {fmtNumber(cards)}</span> : null}
          {devices ? <span className="acc-chip">Device {fmtNumber(devices)}</span> : null}
          {others ? <span className="acc-chip">Other {fmtNumber(others)}</span> : null}
          {topup ? <span className="acc-chip">iTopup {fmtMoney(topup)}</span> : null}
          {!sims && !cards && !devices && !others && !topup ? (
            <span className="acc-chip is-muted">Nothing in hand</span>
          ) : null}
        </span>
        <span className="acc-holder-figs">
          <span>
            Took <b>{fmtNumber(unitsTook)}</b>
          </span>
          <span>
            Sold <b>{fmtNumber(unitsSold)}</b>
          </span>
          <span className={holder.due > 0 ? "is-owing" : undefined}>
            Due <b>{fmtMoney(holder.due)}</b>
          </span>
          {/* v199: when money last came in — the first question about any due. */}
          <span className={holder.due > 0 && quiet ? "is-quiet" : undefined}>
            Last money <b>{ago(holder.lastDeposit ? daysBetween(holder.lastDeposit, today) : null)}</b>
          </span>
        </span>
        {team ? (
          <span className="acc-holder-team">
            Team: <b>{fmtNumber(team.people)}</b> {team.people === 1 ? "person" : "people"} ·{" "}
            <b>{fmtNumber(team.owing)}</b> owing
            {team.quiet ? (
              <>
                {" "}
                · <b>{fmtNumber(team.quiet)}</b> with no money in {QUIET_DAYS}+ days
              </>
            ) : null}
          </span>
        ) : null}
      </summary>
      <div className="acc-holder-body">
        {holder.lines.length ? (
          <table className="acc-holder-table">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col" className="is-right">
                  Took
                </th>
                <th scope="col" className="is-right">
                  Sold
                </th>
                <th scope="col" className="is-right">
                  In hand
                </th>
              </tr>
            </thead>
            <tbody>
              {holder.lines.map((l) => {
                const p = products.get(l.productId);
                if (!p) return null;
                return (
                  <tr key={l.productId}>
                    <th scope="row">{p.subType}</th>
                    <td className="is-right">{l.took[period] ? qty(p, l.took[period]) : "—"}</td>
                    <td className="is-right">{l.sold[period] ? qty(p, l.sold[period]) : "—"}</td>
                    <td className={`is-right${l.inHand < 0 ? " is-bad" : ""}`}>
                      <b>{qty(p, l.inHand)}</b>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="kit-hint is-xs">No stock recorded for this person yet.</p>
        )}
        <Link className="acc-holder-link" href={`/stock/${holder.type}/${holder.id}`}>
          Open {holder.name}&apos;s ledger →
        </Link>
      </div>
    </details>
  );
}

/** "3 days ago", "today", "never". */
function ago(days: number | null) {
  if (days === null) return "never";
  if (days <= 0) return "today";
  return days === 1 ? "yesterday" : `${fmtNumber(days)} days ago`;
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

/**
 * v199 — what needs somebody to act, as a to-do list.
 *
 * The owner's job description for the role was "check that everything is
 * right, and keep the money right". Each group names who or what, links to
 * where it is fixed, and shows three before folding the rest. Nothing to do is
 * said too, in green, because an empty space reads as "not checked".
 */
function AttentionCard({ a }: { a: Attention }) {
  const total = attentionCount(a);
  /*
   * Open on a desk, folded on a phone — where it would otherwise push the
   * product figures a whole screen down. Folded, the summary still names each
   * kind of problem and how many, so nothing is hidden, only shortened.
   */
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (window.matchMedia("(max-width: 719px)").matches) setOpen(false);
  }, []);
  if (!total)
    return (
      <p className="acc-attn-clear">
        <Icon name="check" /> Nothing needs attention — every due has had money in the last {QUIET_DAYS} days, no stock
        is short, and every product has a price.
      </p>
    );
  const groups: { key: string; title: string; hint: string; items: { key: string; text: ReactNode }[] }[] = [
    {
      key: "quiet",
      title: `No money in ${QUIET_DAYS}+ days`,
      hint: "Owing, and nothing deposited for a week or more.",
      items: a.quietDues.map((d) => ({
        key: `${d.type}:${d.id}`,
        text: (
          <>
            <Link href={`/stock/${d.type}/${d.id}`}>{d.name}</Link> owes <b>{fmtMoney(d.due)}</b> · last money{" "}
            {ago(d.days)}
          </>
        ),
      })),
    },
    {
      key: "left",
      title: "Left, still in the books",
      hint: "No longer active, but still holding stock or money.",
      items: a.leftWithBalance.map((d) => ({
        key: `${d.type}:${d.id}`,
        text: (
          <>
            <Link href={`/stock/${d.type}/${d.id}`}>{d.name}</Link> · due <b>{fmtMoney(d.due)}</b>
          </>
        ),
      })),
    },
    {
      key: "neg",
      title: "More sold than given",
      hint: "A sale or return was entered for stock the person never received.",
      items: a.negativeStock.map((d) => ({
        key: `${d.type}:${d.id}:${d.product}`,
        text: (
          <>
            <Link href={`/stock/${d.type}/${d.id}`}>{d.name}</Link> · {d.product} <b>{fmtNumber(d.inHand)}</b>
          </>
        ),
      })),
    },
    {
      key: "godown",
      title: "Godown below zero",
      hint: "More given out than lifted — a lifting is probably not entered.",
      items: a.negativeGodown.map((d) => ({
        key: d.product,
        text: (
          <>
            <Link href="/stock/lifting">{d.product}</Link> <b>{fmtNumber(d.qty)}</b>
          </>
        ),
      })),
    },
    {
      key: "unpriced",
      title: "No price today",
      hint: "Cannot be entered until a price is set.",
      items: a.unpriced.map((n) => ({ key: n, text: <Link href="/stock/products">{n}</Link> })),
    },
    {
      key: "unlinked",
      title: "SIM not linked to activations",
      hint: "Set “Activates as” so sold can be compared with activated.",
      items: a.unlinkedSims.map((n) => ({ key: n, text: <Link href="/stock/products">{n}</Link> })),
    },
  ].filter((g) => g.items.length);

  return (
    <details className="acc-attn" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <Icon name="alert" /> Needs attention <em>{fmtNumber(total)}</em>
        {!open ? (
          <span className="acc-attn-kinds">{groups.map((g) => `${g.title} ${g.items.length}`).join(" · ")}</span>
        ) : null}
      </summary>
      <div className="acc-attn-grid">
        {groups.map((g) => (
          <section key={g.key} className="acc-attn-group" aria-label={g.title}>
            <h3>
              {g.title} <em>{fmtNumber(g.items.length)}</em>
            </h3>
            <p className="kit-hint is-xs">{g.hint}</p>
            <ul>
              {g.items.slice(0, 3).map((i) => (
                <li key={i.key}>{i.text}</li>
              ))}
            </ul>
            {g.items.length > 3 ? (
              <details className="acc-attn-more">
                <summary>and {fmtNumber(g.items.length - 3)} more</summary>
                <ul>
                  {g.items.slice(3).map((i) => (
                    <li key={i.key}>{i.text}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        ))}
      </div>
    </details>
  );
}

export function AccountsOverview({ data }: { data: Overview }) {
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [holderType, setHolderType] = useState<HolderType>("RSO");
  const [search, setSearch] = useState("");
  const [onlyHolding, setOnlyHolding] = useState(true);

  const products = useMemo(() => new Map(data.products.map((p) => [p.id, p])), [data.products]);
  const current = data.periods[period];

  /*
   * A shelf shows every product in use, plus a retired one that still moved in
   * EITHER period — so switching period never makes a card jump in or out.
   */
  const shelves = useMemo(
    () =>
      SHELVES.map((shelf) => ({
        shelf,
        rows: data.products.filter(
          (p) =>
            shelfOf(p) === shelf &&
            (p.active ||
              hasMovement(data.periods.month.flows[p.id]) ||
              hasMovement(data.periods.yesterday.flows[p.id])),
        ),
      })).filter((s) => s.rows.length),
    [data],
  );

  const names = (ids: string[], self: string) =>
    ids.filter((id) => id !== self).map((id) => products.get(id)?.subType || "");

  const counts = useMemo(() => {
    const c: Record<HolderType, number> = { RSO: 0, SUPERVISOR: 0, BP: 0 };
    for (const h of data.holders) c[h.type] += 1;
    return c;
  }, [data.holders]);

  /*
   * A supervisor's team, as COUNTS — never a sum of money or stock (v200).
   * lib/stock.ts states the rule: "Nobody's stock is added to anybody else's.
   * There is no team total ... a supervisor reading their team sees a LIST of
   * people who each owe something, not a sum that belongs to no one." v199
   * broke it, and also netted an overpaid person against an owing one.
   * Keyed on the supervisor's ID, never the name (v181); people who left are
   * counted under the supervisor they left from.
   */
  const teams = useMemo(() => {
    const out = new Map<string, { people: number; owing: number; quiet: number }>();
    for (const h of data.holders) {
      if (h.type === "SUPERVISOR" || !h.supervisorId) continue;
      const t = out.get(h.supervisorId) || { people: 0, owing: 0, quiet: 0 };
      t.people += 1;
      if (h.due >= 1) {
        t.owing += 1;
        if (!h.lastDeposit || daysBetween(h.lastDeposit, data.today) >= QUIET_DAYS) t.quiet += 1;
      }
      out.set(h.supervisorId, t);
    }
    return out;
  }, [data.holders, data.today]);

  /*
   * v201: the search reads phone numbers too — an RSO's wallet, a BP outlet's
   * iTopUp and transaction numbers, and the number each person logs in with —
   * however they are typed (+880, 880, 0 or none). It keeps the name, code and
   * supervisor it always read.
   */
  const shownBy = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (h: HolderStock) =>
      (!onlyHolding || h.lines.some((l) => l.inHand) || h.due !== 0) &&
      (!q ||
        matchesTokens(
          `${h.name} ${h.code || ""} ${h.supervisorName || ""}`.toLowerCase(),
          q,
          (h.phones ?? []).join(" "),
        ));
  }, [search, onlyHolding]);

  const holders = useMemo(
    () => data.holders.filter((h) => h.type === holderType && shownBy(h)),
    [data.holders, holderType, shownBy],
  );

  // While searching, each tab says how many it found, so a number typed on the
  // RSO tab that belongs to a BP is one tap away rather than "Nobody matches".
  const found = useMemo(() => {
    if (!search.trim()) return null;
    const c: Record<HolderType, number> = { RSO: 0, SUPERVISOR: 0, BP: 0 };
    for (const h of data.holders) if (shownBy(h)) c[h.type] += 1;
    return c;
  }, [data.holders, search, shownBy]);

  return (
    <>
      <AttentionCard a={data.attention} />
      <div className="acc-period" role="tablist" aria-label="Which days">
        {(["month", "yesterday"] as PeriodKey[]).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={period === k}
            className={`ops-level-tab${period === k ? " is-active" : ""}`}
            onClick={() => setPeriod(k)}
          >
            <span>{data.periods[k].label}</span>
          </button>
        ))}
      </div>

      {!shelves.length ? (
        <Card padded>
          <EmptyState
            title="No products yet"
            hint="Add what you hand out on the Products page, then record liftings and the day's entries."
            icon={<Icon name="shop" />}
          />
        </Card>
      ) : (
        shelves.map(({ shelf, rows }) => (
          <section key={shelf} className="acc-shelf" aria-label={SHELF_LABEL[shelf]}>
            <header className="acc-shelf-head">
              <h2>
                <Icon name={SHELF_ICON[shelf]} /> {SHELF_LABEL[shelf]}
              </h2>
              {rows.length > 1 && shelf !== "DEVICE" && shelf !== "OTHER" ? (
                <ShelfTotals rows={rows} period={current} />
              ) : null}
            </header>
            {shelf === shelves.find((s) => s.shelf.startsWith("SIM"))?.shelf &&
            data.activationsThrough !== null &&
            data.activationsThrough < current.to ? (
              <p className="acc-feed-note">
                <Icon name="info" />
                <span>
                  Activations are uploaded a day late — the company feed runs to{" "}
                  <b>{fmtDate(data.activationsThrough)}</b>, so the days after it show none yet.
                </span>
              </p>
            ) : null}
            <div className="acc-flow-grid">
              {rows.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  flow={current.flows[p.id]}
                  godown={data.godown[p.id]}
                  sharedWith={p.activationType ? names(data.sharedLinks[p.activationType], p.id) : []}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <section className="acc-holders" aria-label="Who is holding stock">
        <header className="acc-shelf-head">
          <h2>
            <Icon name="users" /> Who is holding stock
          </h2>
          <span className="acc-shelf-totals">
            <span>
              Took and sold: <b>{current.label.replace(/^This month · /, "")}</b>
            </span>
          </span>
        </header>
        <div className="acc-holder-tools">
          <div className="ops-level-tabs" role="tablist" aria-label="Which holders">
            {(["RSO", "SUPERVISOR", "BP"] as HolderType[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={holderType === t}
                className={`ops-level-tab${holderType === t ? " is-active" : ""}`}
                onClick={() => setHolderType(t)}
              >
                <span>{t === "SUPERVISOR" ? "Supervisors" : `${HOLDER_TYPE_LABEL[t]}s`}</span>
                <em>{fmtNumber(found ? found[t] : counts[t])}</em>
              </button>
            ))}
          </div>
          <input
            className="kit-input acc-holder-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a name, code or phone"
            aria-label="Find a holder"
          />
          <label className="acc-toggle">
            <input type="checkbox" checked={onlyHolding} onChange={(e) => setOnlyHolding(e.target.checked)} />
            <span>Only with stock or a due</span>
          </label>
        </div>
        {holders.length ? (
          <div className="acc-holder-list">
            {holders.map((h) => (
              <HolderRow
                key={`${h.type}:${h.id}`}
                holder={h}
                period={period}
                products={products}
                today={data.today}
                team={h.type === "SUPERVISOR" ? teams.get(h.id) : undefined}
              />
            ))}
          </div>
        ) : (
          <Card padded>
            <EmptyState
              title={search ? "Nobody matches" : "Nobody here is holding stock"}
              hint={
                found && (["RSO", "SUPERVISOR", "BP"] as HolderType[]).some((t) => found[t])
                  ? `Found in ${(["RSO", "SUPERVISOR", "BP"] as HolderType[])
                      .filter((t) => found[t])
                      .map((t) => (t === "SUPERVISOR" ? "Supervisors" : `${HOLDER_TYPE_LABEL[t]}s`))
                      .join(" and ")} — tap that tab.`
                  : onlyHolding
                    ? "Untick “Only with stock or a due” to see everyone."
                    : "Try a different name, code or phone number."
              }
              icon={<Icon name="users" />}
            />
          </Card>
        )}
      </section>
    </>
  );
}

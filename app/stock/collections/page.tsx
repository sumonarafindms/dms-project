/**
 * v206 — the Collection dashboard: goods out and money in, for one month.
 */

import { requireUser } from "../../../lib/auth";
import { dhakaTodayYmd, isYm } from "../../../lib/business-time";
import { fmtMoney } from "../../../lib/format";
import { stockScope } from "../../../lib/stock-data";
import { collections } from "../../../lib/collections";
import { monthLabel, monthOfYmd, nextMonthOf, prevMonthOf } from "../../../lib/month-close-rules";
import { LinkBtn, PageHeader, SummaryStrip } from "../../components/Kit";
import { CollectionsView } from "../../components/CollectionsView";

export const dynamic = "force-dynamic";

export default async function CollectionsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const u = await requireUser(["ACCOUNTS", "ADMIN", "IT", "MANAGER", "SUPERVISOR"]);
  const sp = await searchParams;
  const today = dhakaTodayYmd();
  const current = monthOfYmd(today);
  // A month still to come has nothing in it.
  const month = isYm(sp.month) && sp.month <= current ? sp.month : current;

  const data = await collections(await stockScope(u), month, today);
  const net = data.totals.given - data.totals.returned;
  const silent = data.rows.filter((r) => r.given > 0 && r.collected === 0).length;

  return (
    <main className="page">
      <PageHeader
        title="Collections"
        subtitle="What went out to people and what came back in — by day and by person."
        action={
          <span className="cmp-head-actions">
            <LinkBtn href={`/stock/collections?month=${prevMonthOf(month)}`} variant="ghost" size="sm">
              ← {monthLabel(prevMonthOf(month))}
            </LinkBtn>
            {month < current ? (
              <LinkBtn href={`/stock/collections?month=${nextMonthOf(month)}`} variant="ghost" size="sm">
                {monthLabel(nextMonthOf(month))} →
              </LinkBtn>
            ) : null}
          </span>
        }
      />
      <p className="col-month">
        <strong>{monthLabel(month)}</strong>
        {month === current ? " · so far" : ""}
      </p>
      <SummaryStrip
        items={[
          {
            label: "Goods given",
            value: fmtMoney(data.totals.given),
            note: data.totals.returned ? `${fmtMoney(data.totals.returned)} returned` : undefined,
          },
          {
            label: "Collected",
            value: fmtMoney(data.totals.collected),
            tone: "brand",
            note: `Cash ${fmtMoney(data.totals.cash)} · Bank ${fmtMoney(data.totals.bank)}`,
          },
          {
            label: "Collection rate",
            value: data.rate === null ? "—" : `${data.rate}%`,
            note: net > 0 ? "Money in ÷ goods out, net of returns" : "No goods went out",
          },
          // A company figure is a real question; a team's "total due" is money nobody owes (lib/stock.ts).
          ...(data.totals.closing !== null
            ? [
                {
                  label: "Outstanding at end",
                  value: fmtMoney(data.totals.closing),
                  note: `Brought forward ${fmtMoney(data.totals.broughtForward ?? 0)}`,
                },
              ]
            : [
                {
                  label: "Took goods, paid nothing",
                  value: String(silent),
                  tone: silent ? ("amber" as const) : undefined,
                },
              ]),
        ]}
      />
      <CollectionsView data={data} />
    </main>
  );
}

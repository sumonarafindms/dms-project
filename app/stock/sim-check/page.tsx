/**
 * SIM check — given, activated, sold.
 *
 * The owner's example, in his words:
 *
 *   *"100 sim tar kach theke niche 50 ta active korce but 30 ta sell
 *    dekhaice.. ar mane baki 20tar taka tar kache ace ba nijer jono khoroj
 *    kore falce... aita just tar knowledge ar jono"*
 *
 * The middle column is the one that makes this worth having: an ACTIVATED SIM
 * is proof the thing left the RSO's hands and somebody is using it, so the
 * money exists whether or not it was reported. That figure comes from the GA
 * feed the app has always imported — nobody types it.
 *
 * **It never touches a due**, and the page says so. The two sides count
 * slightly different things and always will (see `simCheckRows`), so a gap is
 * a question to ask somebody, not a number to put on their account.
 */

import { requireUser } from "../../../lib/auth";
import { resolveRange } from "../../../lib/report-range";
import { simCheckRows, simCheckScope } from "../../../lib/lifting-data";
import { fmtMoney, fmtNumber } from "../../../lib/format";
import { EmptyState, PageHeader, SectionHead, SummaryStrip } from "../../components/Kit";
import { ReportActionBar, ReportDateBar } from "../../components/ReportShell";
import { Icon } from "../../components/icons";

export const dynamic = "force-dynamic";

export default async function SimCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  /*
   * The literal, not SIM_CHECK_ROLES, because tests/route-guards reads this
   * call as source text. tests/lifting.smoke.test.ts asserts they agree.
   *
   * Wider than the other three new screens on purpose: this page carries no
   * purchase price, and spotting a gap in their own team is a supervisor's job
   * before it is anybody else's.
   */
  const me = await requireUser(["ACCOUNTS", "ADMIN", "IT", "MANAGER", "SUPERVISOR"]);

  const sp = await searchParams;
  const range = resolveRange(sp.from, sp.to);
  const scope = await simCheckScope(me);
  const rows = await simCheckRows(scope, range);
  const nowIso = new Date().toISOString();

  const withGap = rows.filter((r) => r.unreported > 0);
  const totalUnreported = withGap.reduce((s, r) => s + r.unreported, 0);
  const totalValue = withGap.reduce((s, r) => s + (r.unreportedValue ?? 0), 0);
  /* Gaps that could not be priced, counted rather than silently added as zero. */
  const unpriced = withGap.filter((r) => r.unreportedValue === null);
  const active = rows.filter((r) => r.given || r.activated || r.sold);

  return (
    <main className="page">
      <PageHeader title="SIM check" subtitle="Given, activated and reported sold — and the gap between them." />
      <ReportDateBar range={range} nowIso={nowIso} />
      <ReportActionBar
        exportHref={`/api/stock/export?report=simcheck&from=${range.from}&to=${range.to}`}
        rowCount={active.length}
      />

      <SummaryStrip
        items={[
          { label: "People", value: String(active.length) },
          { label: "Activated not reported", value: fmtNumber(totalUnreported), tone: "brand" },
          {
            label: unpriced.length ? "Worth, where priced" : "That gap is worth",
            value: fmtMoney(totalValue),
          },
          { label: "People with a gap", value: `${withGap.length} of ${active.length}` },
        ]}
      />

      {!active.length ? (
        <EmptyState
          title="Nothing to check in this period"
          hint="No SIMs were handed out and no activations were recorded for these dates."
          icon={<Icon name="sim" />}
        />
      ) : (
        <>
          <SectionHead
            title="Biggest gap first"
            sub="Activated means a real customer is using it. Sold means the RSO told Accounts about it."
          />
          <div className="kit-table-wrap kit-mb-20">
            <table className="kit-report-table" role="table">
              <thead>
                <tr role="row">
                  <th role="columnheader" scope="col">
                    RSO
                  </th>
                  <th role="columnheader" scope="col" className="is-right">
                    Given
                  </th>
                  <th role="columnheader" scope="col" className="is-right">
                    Activated
                  </th>
                  <th role="columnheader" scope="col" className="is-right">
                    Sold
                  </th>
                  <th role="columnheader" scope="col" className="is-right">
                    Not reported
                  </th>
                  <th role="columnheader" scope="col" className="is-right">
                    Worth
                  </th>
                  <th role="columnheader" scope="col" className="is-right">
                    Not activated
                  </th>
                </tr>
              </thead>
              <tbody>
                {active.map((r) => (
                  <tr role="row" key={r.employeeId}>
                    <td role="cell" data-label="RSO">
                      <strong>{r.name}</strong>
                      <span className="kit-cell-sub">{[r.code, r.supervisorName].filter(Boolean).join(" · ")}</span>
                    </td>
                    <td role="cell" data-label="Given" className="is-right">
                      {fmtNumber(r.given)}
                    </td>
                    <td role="cell" data-label="Activated" className="is-right">
                      {fmtNumber(r.activated)}
                    </td>
                    <td role="cell" data-label="Sold" className="is-right">
                      {fmtNumber(r.sold)}
                    </td>
                    <td role="cell" data-label="Not reported" className="is-right">
                      {r.unreported > 0 ? (
                        <span className="kit-due is-owing">{fmtNumber(r.unreported)}</span>
                      ) : (
                        <span className="kit-cell-unset">—</span>
                      )}
                    </td>
                    <td role="cell" data-label="Worth" className="is-right">
                      {r.unreportedValue === null && r.unreported > 0 ? (
                        <span className="kit-cell-unset">no price</span>
                      ) : r.unreportedValue ? (
                        <span className="kit-due is-owing">{fmtMoney(r.unreportedValue)}</span>
                      ) : (
                        <span className="kit-cell-unset">—</span>
                      )}
                    </td>
                    {/*
                     * Handed out and not yet in a customer's phone. Usually
                     * ordinary — stock in a bag, or sitting with a retailer —
                     * so it is shown quietly and never called a shortfall.
                     */}
                    <td role="cell" data-label="Not activated" className="is-right">
                      {r.notActivated > 0 ? fmtNumber(r.notActivated) : <span className="kit-cell-unset">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {unpriced.length > 0 && (
        <p className="kit-note">
          <Icon name="info" /> {unpriced.length} {unpriced.length === 1 ? "person has" : "people have"} activated SIMs
          but {unpriced.length === 1 ? "was" : "were"} never handed one through this ledger, so there is no price to
          value the gap at: {unpriced.map((r) => r.name).join(", ")}. They are counted above, not valued.
        </p>
      )}

      <p className="kit-note">
        <Icon name="info" /> This page changes nobody&apos;s due. Activations come from the company&apos;s GA feed and
        can include SIMs a retailer already had, and an outlet that changed hands mid-period counts under whoever holds
        it now — so a gap is a question worth asking, not a charge.
      </p>
    </main>
  );
}

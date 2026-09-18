/**
 * The manager's retailer list — the page that was missing.
 *
 * ## Why this is a bug fix rather than a feature
 *
 * `roleDefaults.MANAGER` in lib/permissions.ts has granted `retailers: view`
 * from the beginning. The permission existed; the page never did. So a manager
 * held a key to a door that had not been built, and three things followed from
 * it:
 *
 *   - There was no "Retailers" entry in the manager's navigation, while the
 *     RSO and the supervisor both have one.
 *   - `/manager/attention` links every row to `/manager/retailers/{id}` — a
 *     detail page that DOES exist — so the rows worked and the list behind
 *     them did not.
 *   - `/manager/retailers/[id]` therefore had nowhere to send the reader back
 *     to, and pointed its back button at `/manager/rsos/{employeeId}` instead:
 *     a different screen about a different thing. Working down a two-hundred
 *     row attention queue on a phone meant being thrown onto some RSO's
 *     performance page after every single tap, then finding your place in the
 *     queue again.
 *
 * The supervisor's version of this page is the same screen over a different
 * scope, so this is its twin rather than a new design — `RetailerSearchView`,
 * `retailerListPage` and `sortOptionsFor` are the shared parts, and the only
 * thing that differs is which employees are in scope.
 */

import { requirePagePermission } from "../../../lib/auth";
import { managerScope } from "../../../lib/manager-scope";
import { normalizeMonth } from "../../../lib/drilldown";
import { retailerOpportunities } from "../../../lib/retailer-opportunities";
import { retailerListPage, sortOptionsFor } from "../../../lib/retailer-list";
import { RetailerSearchView } from "../../components/RetailerOpportunityViews";
import { Card, PageHeader, PageNotice, SectionHead, SummaryStrip } from "../../components/Kit";
import { fmtNumber } from "../../../lib/format";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; month?: string; from?: string; to?: string; sort?: string; page?: string }>;
}) {
  const u = await requirePagePermission(["MANAGER"], "retailers"),
    s = await searchParams,
    month = normalizeMonth(s.from?.slice(0, 7) || s.month);
  const scope = await managerScope(u.id);

  // v175's rule: an empty scope is a mapping problem, not an empty result.
  if (!scope.employeeIds.length)
    return (
      <PageNotice
        title="No teams assigned"
        subtitle="Ask Admin to assign your supervisors."
        hint="Until then there are no RSOs under you, so this page has no outlets to list."
      />
    );

  const rows = await retailerOpportunities(month, scope.employeeIds, s.from, s.to),
    sim = rows.filter((x) => x.simSeller).length,
    flagged = rows.filter((x) => x.priority > 0).length;
  const listPage = retailerListPage(rows, { q: s.q, sort: s.sort, page: s.page });

  return (
    <main className="page">
      <PageHeader
        title="Retailers"
        subtitle={`${month} · Every active retailer under your Supervisor and RSO teams.`}
      />
      <SummaryStrip
        items={[
          { label: "Retailers", value: fmtNumber(rows.length) },
          { label: "SIM Sellers", value: fmtNumber(sim) },
          { label: "Flagged", value: fmtNumber(flagged), tone: flagged ? "amber" : "brand" },
          { label: "On Track", value: fmtNumber(rows.length - flagged), tone: "brand" },
        ]}
      />
      <SectionHead title="Search & review" sub="GA, C2S, SSO and LSO status for the selected dates." />
      <Card padded>
        <RetailerSearchView
          page={listPage}
          sortOptions={sortOptionsFor(false)}
          month={month}
          from={s.from}
          to={s.to}
          base="/manager/retailers"
        />
      </Card>
    </main>
  );
}

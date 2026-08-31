import { requireUser } from "../../../lib/auth";
import { normalizeMonth } from "../../../lib/drilldown";
import { retailerOpportunities } from "../../../lib/retailer-opportunities";
import { retailerListPage, sortOptionsFor } from "../../../lib/retailer-list";
import { RetailerSearchView } from "../../components/RetailerOpportunityViews";
import { PageHeader } from "../../components/Kit";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; month?: string; from?: string; to?: string; sort?: string; page?: string }>;
}) {
  await requireUser(["ADMIN", "IT"]);
  const s = await searchParams,
    month = normalizeMonth(s.from?.slice(0, 7) || s.month),
    rows = await retailerOpportunities(month, undefined, s.from, s.to);
  const listPage = retailerListPage(rows, {
    q: s.q,
    sort: s.sort,
    page: s.page,
  });

  return (
    <main className="page">
      <PageHeader title="Retailer search" subtitle="Search the full retailer base and review exact-date performance." />
      <RetailerSearchView
        page={listPage}
        sortOptions={sortOptionsFor(false)}
        month={month}
        from={s.from}
        to={s.to}
        base="/admin/retailers"
      />
    </main>
  );
}

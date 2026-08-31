import { requirePagePermission } from "../../../lib/auth";
import { normalizeMonth } from "../../../lib/drilldown";
import { retailerOpportunities } from "../../../lib/retailer-opportunities";
import { RoleAttentionList } from "../../components/RoleAttention";
import { Card, PageHeader, SectionHead, SummaryStrip } from "../../components/Kit";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; from?: string; to?: string }>;
}) {
  const u = await requirePagePermission(["RSO"], "attention"),
    s = await searchParams,
    month = normalizeMonth(s.from?.slice(0, 7) || s.month);
  const all = u.employeeId ? await retailerOpportunities(month, [u.employeeId], s.from, s.to) : [],
    rows = all.filter((x) => x.priority > 0).sort((a, b) => b.priority - a.priority || a.c2s - b.c2s);
  const high = rows.filter((x) => x.priority >= 3).length,
    sso = all.filter((x) => x.simSeller && !x.ssoComplete).length,
    lso = all.filter((x) => !x.lsoComplete).length;
  const end = s.to || new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).toISOString().slice(0, 10);
  return (
    <main className="page">
      <PageHeader title="Retailer Focus" subtitle="Outlets where a visit can move SSO or LSO closer to completion." />
      <SummaryStrip
        items={[
          { label: "High Priority", value: String(high), tone: "amber" },
          { label: "SSO Pending", value: String(sso) },
          { label: "LSO Pending", value: String(lso) },
          { label: "Flagged", value: String(rows.length) },
        ]}
      />
      <form className="kit-report-datebar">
        <div className="kit-report-dates">
          <label className="kit-field">
            <span>From</span>
            <input className="kit-input" type="date" name="from" defaultValue={s.from || `${month}-01`} />
          </label>
          <label className="kit-field">
            <span>To</span>
            <input className="kit-input" type="date" name="to" defaultValue={end} />
          </label>
          <button className="kit-btn is-primary is-end">Apply</button>
        </div>
      </form>
      <SectionHead title="Visit these retailers first" sub="Highest priority appears first." />
      <Card padded>
        <RoleAttentionList
          rows={rows}
          base="/rso/retailers"
          query={`?month=${month}${s.from ? `&from=${s.from}` : ""}${s.to ? `&to=${s.to}` : ""}`}
        />
      </Card>
    </main>
  );
}

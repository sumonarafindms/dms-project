/**
 * BP activation list and detail — migrated to the role-UI kit.
 *
 * Shared by the manager, supervisor and RSO routes; `basePath` / `backHref`
 * are the only things that differ, and `user` decides scope inside
 * lib/bp-activations rather than here.
 *
 * Every count and every row on these screens is standard GA only — the query
 * applies withStandardGa/withSimSwap — so SIMWAP and EV-SWAP appear as their
 * own figure and never inside the GA total.
 */

import Link from "next/link";
import { FilterForm } from "./DrillUI";
import { Icon } from "./icons";
import { Badge, Card, EmptyState, PageHeader, Row, SectionHead, SummaryStrip } from "./Kit";
import type { BpViewer } from "../../lib/bp-activations";
import { bpAssignmentDetail, listBpAssignments } from "../../lib/bp-activations";

export async function BpActivationListView({
  user,
  basePath,
  month,
  q,
  from,
  to,
}: {
  user: BpViewer;
  basePath: string;
  month?: string;
  q?: string;
  from?: string;
  to?: string;
  /** Ignored — the kit page header has no eyebrow. Kept so callers compile. */
  eyebrow?: string;
}) {
  const data = await listBpAssignments(user, month, q, from, to);
  const range = `month=${data.month}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`;

  return (
    <main className="page">
      <PageHeader
        title="BP Activation Details"
        subtitle="SIM activations by assigned BP retailer, counted only within each assignment's effective period."
      />
      <FilterForm
        q={q || ""}
        month={data.month}
        from={from}
        to={to}
        dateRange
        placeholder="Search BP code, BP name or RSO"
      />
      <SectionHead
        title={`${data.assignments.length} BP ${data.assignments.length === 1 ? "assignment" : "assignments"}`}
        sub="Active assignments first."
      />
      <Card padded>
        {data.assignments.length ? (
          <div className="kit-rows">
            {data.assignments.map((a) => (
              <Row
                key={a.id}
                href={`${basePath}/${a.id}?${range}`}
                avatar={a.retailer.retailerName || a.retailer.retailerCode}
                title={a.retailer.retailerName || a.retailer.retailerCode}
                sub={`${a.retailer.retailerCode} · RSO ${a.employee.name}${a.employee.supervisor?.name ? ` · ${a.employee.supervisor.name}` : ""}`}
                detail={`${a.startDate.toISOString().slice(0, 10)} → ${a.endDate?.toISOString().slice(0, 10) || "current"}`}
                // Wrapped in .kit-row-actions so the mobile rule moves it to
                // its own line; a bare badge stays inline and squeezes the BP
                // name to an ellipsis on a phone.
                after={
                  <div className="kit-row-actions">
                    <Badge tone={a.active ? "active" : "neutral"}>{a.active ? "Active" : "History"}</Badge>
                  </div>
                }
                value={a.monthGa}
                valueSub="GA"
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No BP assignment found"
            hint="Nothing was assigned in this period. Try another date range."
            icon={<Icon name="sim" />}
          />
        )}
      </Card>
    </main>
  );
}

export async function BpActivationDetailView({
  user,
  id,
  backHref,
  month,
  q,
  from,
  to,
}: {
  user: BpViewer;
  id: string;
  backHref: string;
  month?: string;
  q?: string;
  from?: string;
  to?: string;
  /** Ignored — see BpActivationListView. */
  eyebrow?: string;
}) {
  const d = await bpAssignmentDetail(user, id, month, q, from, to);

  if (!d)
    return (
      <main className="page">
        <Link href={backHref} className="kit-detail-back">
          <Icon name="arrow" /> Back
        </Link>
        <PageHeader title="BP activation unavailable" />
        <Card>
          <EmptyState
            title="Not available"
            hint="This BP assignment is outside your access scope or no longer exists."
            icon={<Icon name="shield" />}
          />
        </Card>
      </main>
    );

  // effectiveEnd is exclusive, so the last counted day is the millisecond before it.
  const lastDay = new Date(d.effectiveEnd.getTime() - 1).toISOString().slice(0, 10);

  return (
    <main className="page">
      <Link href={`${backHref}?month=${d.month}`} className="kit-detail-back">
        <Icon name="arrow" /> Back
      </Link>
      <PageHeader
        title={d.assignment.retailer.retailerName || d.assignment.retailer.retailerCode}
        subtitle={`${d.assignment.retailer.retailerCode} · RSO ${d.assignment.employee.name} · ${d.assignment.employee.supervisor?.name || "No supervisor"}`}
      />

      <SummaryStrip
        items={[
          { label: "Total GA", value: d.total.toLocaleString(), tone: "teal" },
          { label: "150", value: d.total150.toLocaleString() },
          { label: "300", value: d.total300.toLocaleString() },
          { label: "SIM SWAP", value: d.simSwap.toLocaleString(), tone: "amber" },
          { label: "GA Target", value: d.assignment.gaTarget || "—" },
          { label: "Days with GA", value: d.daily.length.toLocaleString() },
        ]}
      />

      <div className="kit-note is-warn" role="note">
        <Icon name="info" />
        <span>
          Counting only activations during this BP assignment period:{" "}
          <strong>{d.effectiveStart.toISOString().slice(0, 10)}</strong> to <strong>{lastDay}</strong>. SIM SWAP is
          shown separately and is not part of Total GA.
        </span>
      </div>

      <FilterForm q={d.q} month={d.month} from={from} to={to} dateRange placeholder="Search SIM serial" />

      <SectionHead title="Activation details" sub={`${d.rows.length} shown, newest first.`} />
      <Card padded style={{ marginBottom: "1.25rem" }}>
        {d.rows.length ? (
          <div className="kit-rows">
            {d.rows.map((x) => (
              <Row
                key={x.simNo}
                icon={<Icon name="sim" />}
                title={`SIM ${x.simNo}`}
                sub={`${x.activationDate.toISOString().slice(0, 10)}${x.activationTime ? ` · ${x.activationTime}` : ""}`}
                value={`৳${Number(x.sellingPrice).toLocaleString()}`}
                // These rows are standard GA only, so price maps cleanly onto
                // the two packs: 170 is the 150 pack, everything else is 300.
                valueSub={Number(x.sellingPrice) === 170 ? "150 pack" : "300 pack"}
              />
            ))}
          </div>
        ) : (
          <EmptyState title="No activation found" hint="Nothing matches this filter." icon={<Icon name="search" />} />
        )}
      </Card>

      <SectionHead title="Daily GA" sub={`${d.daily.length} ${d.daily.length === 1 ? "day" : "days"} with activity.`} />
      <Card padded>
        {d.daily.length ? (
          <div className="kit-rows">
            {d.daily.map((x) => (
              <Row
                key={x.date.toISOString()}
                icon={<Icon name="calendar" />}
                title={x.date.toISOString().slice(0, 10)}
                sub="BP activation count"
                value={x.count}
                valueSub="GA"
              />
            ))}
          </div>
        ) : (
          <EmptyState title="No daily activity" icon={<Icon name="calendar" />} />
        )}
      </Card>
    </main>
  );
}

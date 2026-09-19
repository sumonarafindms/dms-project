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

import { bpDisplayName } from "../../lib/bp-name";
import Link from "next/link";
import { FilterForm } from "./DrillUI";
import { Icon } from "./icons";
import { Card, EmptyState, PageHeader, Row, SectionHead, SummaryStrip } from "./Kit";
import { BpAssignmentList } from "./BpAssignmentList";
import { SimActivationList } from "./SimActivationList";
import type { BpViewer } from "../../lib/bp-activations";
import { bpAssignmentDetail, listBpAssignments } from "../../lib/bp-activations";
import { GA_CATEGORY_LABEL, gaRowLabel } from "../../lib/business-rules";

export async function BpActivationListView({
  user,
  basePath,
  month,
  from,
  to,
}: {
  user: BpViewer;
  basePath: string;
  month?: string;
  from?: string;
  to?: string;
}) {
  // No `q`: the server no longer narrows the list, the browser does.
  const data = await listBpAssignments(user, month, from, to);
  const range = `month=${data.month}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`;

  return (
    <main className="page">
      <PageHeader
        title="BP Activation Details"
        subtitle="SIM activations by assigned BP retailer, counted only within each assignment's effective period."
      />
      <BpAssignmentList
        // Serialised here rather than in the client component: the query, the
        // scope and the date arithmetic all stay on the server.
        rows={data.assignments.map((a) => ({
          id: a.id,
          active: a.active,
          gaTarget: a.gaTarget,
          monthGa: a.monthGa,
          startDate: a.startDate.toISOString().slice(0, 10),
          endDate: a.endDate?.toISOString().slice(0, 10) ?? null,
          retailerCode: a.retailer.retailerCode,
          retailerName: a.retailer.retailerName || "",
          bpName: a.retailer.bpName,
          rsoName: a.employee.name,
          supervisorName: a.employee.supervisor?.name || "",
        }))}
        basePath={basePath}
        range={range}
        month={data.month}
        from={from}
        to={to}
      />
    </main>
  );
}

export async function BpActivationDetailView({
  user,
  id,
  backHref,
  month,
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
}) {
  const d = await bpAssignmentDetail(user, id, month, from, to);

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
        title={bpDisplayName(d.assignment.retailer)}
        subtitle={`${d.assignment.retailer.retailerCode} · RSO ${d.assignment.employee.name} · ${d.assignment.employee.supervisor?.name || "No supervisor"}`}
      />

      <SummaryStrip
        items={[
          { label: "Total GA", value: d.total.toLocaleString("en-US"), tone: "brand" },
          { label: GA_CATEGORY_LABEL.GA_170, value: d.total170.toLocaleString("en-US") },
          { label: GA_CATEGORY_LABEL.GA_300, value: d.total300.toLocaleString("en-US") },
          { label: "SIM SWAP", value: d.simSwap.toLocaleString("en-US"), tone: "amber" },
          { label: "GA Target", value: d.assignment.gaTarget || "—" },
          { label: "Days with GA", value: d.daily.length.toLocaleString("en-US") },
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

      {/* The date range still navigates — it selects a different dataset — but
          the SIM search does not: SimActivationList filters the rows already
          on the page, so typing a serial costs no request at all. */}
      <FilterForm month={d.month} from={from} to={to} dateRange />

      <SimActivationList
        title="Activation details"
        rows={d.rows.map((x) => ({
          simNo: x.simNo,
          date: x.activationDate.toISOString().slice(0, 10),
          time: x.activationTime || "",
          price: Number(x.sellingPrice),
          /*
           * The shared rules, not a price comparison.
           *
           * This read `Number(x.sellingPrice) === 170 ? "150 pack" : "300 pack"`
           * — the last hardcoded tariff left in the app after v157 and v172
           * took them out of everything else. The day the carrier moves the
           * price, every row on this one screen would have been labelled wrong
           * while the counts above it stayed right.
           */
          category: gaRowLabel(x, new Set(d.ga170Tariff)),
        }))}
        month={d.month}
        from={from}
        to={to}
        capped={d.capped}
      />

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

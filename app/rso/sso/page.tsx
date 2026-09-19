/**
 * RSO's SSO worklist. Scoped to this RSO's own retailers only.
 *
 * Non-SIM-sellers are excluded: the SSO rule applies only to them, so listing
 * them as pending would put work on an RSO's list that does not exist.
 */

import { bpDisplayName } from "../../../lib/bp-name";
import { requirePagePermission } from "../../../lib/auth";
import { retailerOpportunities } from "../../../lib/retailer-opportunities";
import { normalizeMonth } from "../../../lib/drilldown";
import { dhakaMonth } from "../../../lib/business-time";
import { SSO_MIN_MONTHLY_STANDARD_GA } from "../../../lib/business-rules";
import { prisma } from "../../../lib/prisma";
import { OperationalWorklist, resolveSort } from "../OperationalWorklist";
import type { WorklistRow } from "../OperationalWorklist";
import { PageNotice } from "../../components/Kit";

export const dynamic = "force-dynamic";

export default async function SsoWorklist({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; sort?: string; status?: string }>;
}) {
  const u = await requirePagePermission(["RSO"], "attention");
  const s = await searchParams;
  const month = normalizeMonth(s.month || dhakaMonth());

  if (!u.employeeId)
    return <PageNotice title="Account not mapped" subtitle="Ask Admin to link this login to an RSO employee record." />;

  const [retailers, assignments] = await Promise.all([
    retailerOpportunities(month, [u.employeeId]),
    prisma.bpAssignment.findMany({
      where: { employeeId: u.employeeId, active: true },
      select: { retailerId: true, retailer: { select: { retailerName: true, retailerCode: true, bpName: true } } },
    }),
  ]);
  const bpByRetailer = new Map(assignments.map((a) => [a.retailerId, bpDisplayName(a.retailer)]));

  const rows: WorklistRow[] = retailers
    .filter((r) => r.simSeller)
    .map((r) => ({
      id: r.id,
      name: r.retailerName,
      code: r.retailerCode,
      bpName: bpByRetailer.get(r.id) ?? "—",
      current: Math.min(r.ga, SSO_MIN_MONTHLY_STANDARD_GA),
      remaining: `${Math.max(SSO_MIN_MONTHLY_STANDARD_GA - r.ga, 0)} GA`,
      complete: r.ssoComplete,
    }));

  return (
    <OperationalWorklist
      title="SSO"
      requirement={`Complete at ${SSO_MIN_MONTHLY_STANDARD_GA} standard GA in one month`}
      progressLabel="SIM Done"
      required={SSO_MIN_MONTHLY_STANDARD_GA}
      rows={rows}
      month={month}
      sort={resolveSort(s.sort)}
      basePath="/rso/sso"
      statusFilter={s.status === "pending" || s.status === "complete" ? s.status : "all"}
      emptyScope={{
        title: "No SIM-seller retailers",
        hint: "SSO is measured on outlets marked as SIM sellers, and none of yours is. Ask your supervisor if that looks wrong.",
      }}
    />
  );
}

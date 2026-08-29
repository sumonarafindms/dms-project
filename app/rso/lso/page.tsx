/**
 * RSO's LSO worklist. Scoped to this RSO's own retailers only.
 *
 * LSO needs BOTH the monthly amount and the transaction count, so a single
 * progress bar cannot express it honestly. Progress tracks the amount and the
 * "Remaining" line names whichever parts are still short.
 */

import { requirePagePermission } from "../../../lib/auth";
import { retailerOpportunities } from "../../../lib/retailer-opportunities";
import { normalizeMonth } from "../../../lib/drilldown";
import { dhakaMonth } from "../../../lib/business-time";
import {
  LSO_MIN_MONTHLY_AMOUNT,
  LSO_MIN_MONTHLY_TRANSACTIONS,
  lsoAmountRemaining,
  lsoTransactionsRemaining,
} from "../../../lib/business-rules";
import { prisma } from "../../../lib/prisma";
import { OperationalWorklist, resolveSort } from "../OperationalWorklist";
import type { WorklistRow } from "../OperationalWorklist";
import { Card, EmptyState, PageHeader } from "../../components/Kit";
import { Icon } from "../../components/icons";

export const dynamic = "force-dynamic";

export default async function LsoWorklist({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; sort?: string; status?: string }>;
}) {
  const u = await requirePagePermission(["RSO"], "attention");
  const s = await searchParams;
  const month = normalizeMonth(s.month || dhakaMonth());

  if (!u.employeeId)
    return (
      <main className="page">
        <PageHeader title="Account not mapped" subtitle="Ask Admin to link this login to an RSO employee record." />
        <Card>
          <EmptyState title="Account not mapped" icon={<Icon name="alert" />} />
        </Card>
      </main>
    );

  const [retailers, assignments] = await Promise.all([
    retailerOpportunities(month, [u.employeeId]),
    prisma.bpAssignment.findMany({
      where: { employeeId: u.employeeId, active: true },
      select: { retailerId: true, retailer: { select: { retailerName: true, retailerCode: true } } },
    }),
  ]);
  const bpByRetailer = new Map(
    assignments.map((a) => [a.retailerId, a.retailer.retailerName || a.retailer.retailerCode]),
  );

  const rows: WorklistRow[] = retailers.map((r) => {
    const amountGap = lsoAmountRemaining(r.c2s);
    const trxGap = lsoTransactionsRemaining(r.c2sTransactions);
    const parts: string[] = [];
    if (amountGap > 0) parts.push(`৳${Math.ceil(amountGap).toLocaleString()}`);
    if (trxGap > 0) parts.push(`${trxGap} trx`);
    return {
      id: r.id,
      name: r.retailerName,
      code: r.retailerCode,
      bpName: bpByRetailer.get(r.id) ?? "—",
      current: Math.min(Math.round(r.c2s), LSO_MIN_MONTHLY_AMOUNT),
      remaining: parts.join(" + ") || "—",
      complete: r.lsoComplete,
    };
  });

  return (
    <OperationalWorklist
      title="LSO"
      requirement={`Complete at ৳${LSO_MIN_MONTHLY_AMOUNT} and ${LSO_MIN_MONTHLY_TRANSACTIONS} transactions in one month`}
      progressLabel="C2S Amount"
      required={LSO_MIN_MONTHLY_AMOUNT}
      rows={rows}
      month={month}
      sort={resolveSort(s.sort)}
      basePath="/rso/lso"
      statusFilter={s.status === "pending" || s.status === "complete" ? s.status : "all"}
    />
  );
}

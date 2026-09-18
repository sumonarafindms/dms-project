import { requireUser } from "../../../../lib/auth";
import { resolveRange } from "../../../../lib/report-range";
import { valueGroup } from "../../../../lib/report-builders";
import { ValueReport } from "../ValueReport";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; group?: string; page?: string; q?: string }>;
}) {
  await requireUser(["ADMIN", "IT"]);
  const sp = await searchParams;
  // One instant for both renders — see ReportDateBar's nowIso.
  const nowIso = new Date().toISOString();

  return (
    <ValueReport
      metric="c2s"
      range={resolveRange(sp.from, sp.to)}
      nowIso={nowIso}
      group={valueGroup(sp.group)}
      page={sp.page}
      q={sp.q}
    />
  );
}

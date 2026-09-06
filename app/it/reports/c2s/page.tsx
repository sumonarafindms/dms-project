import { requireUser } from "../../../../lib/auth";
import { resolveRange } from "../../../../lib/report-range";
import { valueGroup } from "../../../../lib/report-builders";
import { ValueReport } from "../ValueReport";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; group?: string; page?: string }>;
}) {
  await requireUser(["ADMIN", "IT"]);
  const sp = await searchParams;
  return <ValueReport metric="c2s" range={resolveRange(sp.from, sp.to)} group={valueGroup(sp.group)} page={sp.page} />;
}

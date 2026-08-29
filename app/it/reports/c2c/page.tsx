import { requireUser } from "../../../../lib/auth";
import { resolveRange } from "../../../../lib/report-range";
import { ValueReport, VALUE_GROUPS } from "../ValueReport";
import type { ValueGroup } from "../ValueReport";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; group?: string }>;
}) {
  await requireUser(["ADMIN", "IT"]);
  const sp = await searchParams;
  const group = (VALUE_GROUPS.find((g) => g.key === sp.group)?.key ?? "supervisor") as ValueGroup;
  return <ValueReport metric="c2c" range={resolveRange(sp.from, sp.to)} group={group} />;
}

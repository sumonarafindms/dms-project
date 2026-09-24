import { notFound } from "next/navigation";
import { requirePagePermission } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { AppLink as Link } from "../../../components/AppLink";
import { PageHeader } from "../../../components/Kit";
import { Icon } from "../../../components/icons";
import { CampaignForm, type CampaignFormEmployee } from "../../../components/CampaignForm";
import type { CampaignScope } from "../../../../lib/campaign";

export const dynamic = "force-dynamic";

export default async function EditCampaign({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission(["ADMIN", "IT", "MANAGER"], "campaigns", "edit");
  const { id } = await params;
  const [row, employees] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        scope: true,
        totalTarget: true,
        perEmployeeTarget: true,
        note: true,
        active: true,
        targets: { select: { employeeId: true, target: true } },
      },
    }),
    prisma.employee.findMany({
      where: { active: true },
      select: { id: true, name: true, employeeCode: true, rsoMsisdn: true, supervisor: { select: { name: true } } },
      orderBy: [{ supervisor: { name: "asc" } }, { name: "asc" }],
    }),
  ]);
  if (!row) notFound();

  const stored = new Map(row.targets.map((t) => [t.employeeId, t.target]));
  const list: CampaignFormEmployee[] = employees.map((e) => ({
    id: e.id,
    name: e.name,
    code: e.employeeCode,
    wallet: e.rsoMsisdn,
    supervisor: e.supervisor?.name || "Unassigned",
    // "" is "no exception"; "0" is an exception that says zero.
    override: stored.has(e.id) ? String(stored.get(e.id)) : "",
  }));

  return (
    <main className="page">
      <Link href={`/campaigns/${row.id}`} className="kit-detail-back no-print">
        <Icon name="arrow" /> Back to {row.name}
      </Link>
      {/* The heading names the record, as v185 requires of every edit screen. */}
      <PageHeader title={`Campaign · ${row.name}`} subtitle="Change the window, the target, or one person's number." />
      <CampaignForm
        initial={{
          id: row.id,
          name: row.name,
          startDate: row.startDate.toISOString().slice(0, 10),
          endDate: row.endDate.toISOString().slice(0, 10),
          scope: row.scope as CampaignScope,
          totalTarget: row.totalTarget,
          perEmployeeTarget: row.perEmployeeTarget,
          note: row.note,
          active: row.active,
        }}
        employees={list}
      />
    </main>
  );
}

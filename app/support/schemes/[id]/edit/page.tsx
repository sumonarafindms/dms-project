import { notFound } from "next/navigation";
import { requirePagePermission } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { AppLink as Link } from "../../../../components/AppLink";
import { PageHeader } from "../../../../components/Kit";
import { Icon } from "../../../../components/icons";
import { SupportSchemeForm } from "../../../../components/SupportSchemeForm";
import { dayLabel } from "../../../../components/SupportViews";

export const dynamic = "force-dynamic";

export default async function EditSupportScheme({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission(["ADMIN", "IT", "MANAGER"], "support", "edit");
  const { id } = await params;
  const row = await prisma.supportScheme.findUnique({
    where: { id },
    select: {
      id: true,
      date: true,
      name: true,
      note: true,
      ssoRatePerSim: true,
      ssoMinSimsSameDay: true,
      active: true,
      slabs: { select: { minSims: true, ratePerSim: true }, orderBy: { minSims: "asc" } },
    },
  });
  if (!row) notFound();
  const ymd = row.date.toISOString().slice(0, 10);

  return (
    <main className="page">
      <Link href="/support/schemes" className="kit-detail-back no-print">
        <Icon name="arrow" /> Back to offers
      </Link>
      {/* The heading names the day, as v185 requires: every edit screen has to
          say which record was opened. */}
      <PageHeader
        title={`Support offer · ${dayLabel(ymd)}`}
        subtitle={row.name || "Slabs for this day, and the SSO offer if it is running."}
      />
      <SupportSchemeForm
        initial={{
          id: row.id,
          date: ymd,
          name: row.name,
          note: row.note,
          ssoRatePerSim: row.ssoRatePerSim === null ? "" : String(Number(row.ssoRatePerSim)),
          ssoMinSimsSameDay: row.ssoMinSimsSameDay,
          active: row.active,
          slabs: row.slabs.map((s) => ({ minSims: s.minSims, ratePerSim: String(Number(s.ratePerSim)) })),
        }}
      />
    </main>
  );
}

import { notFound } from "next/navigation";
import { requirePagePermission } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { SCHEME_SELECT } from "../../../../../lib/sim-support-data";
import { AppLink as Link } from "../../../../components/AppLink";
import { PageHeader } from "../../../../components/Kit";
import { Icon } from "../../../../components/icons";
import { SupportSchemeForm } from "../../../../components/SupportSchemeForm";
import { dayLabel, schemeFormValues } from "../../../../components/SupportViews";

export const dynamic = "force-dynamic";

export default async function EditSupportScheme({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission(["ADMIN", "IT", "MANAGER"], "support", "edit");
  const { id } = await params;
  const row = await prisma.supportScheme.findUnique({ where: { id }, select: SCHEME_SELECT });
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
        subtitle={row.name || "The day's target, the SIM bonus, and the SSO offer if it is running."}
      />
      <SupportSchemeForm key={row.id} initial={schemeFormValues(row)} />
    </main>
  );
}

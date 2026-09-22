/**
 * Which outlets earn the Sim Support SLAB.
 *
 * RSOs only, and only the slab. A BP is not listed: it earns on the outlet it
 * holds, which the BP assignment already says, so there is nothing to choose.
 * The SSO offer is not chosen here either — it counts every outlet under an
 * RSO, picked or not.
 *
 * There is no cap on how many may be picked. Two is what the office picks
 * today; the owner's ruling is that the number must not live in the code.
 */

import { requirePagePermission } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { AppLink as Link } from "../../components/AppLink";
import { Card, EmptyState, PageHeader } from "../../components/Kit";
import { Icon } from "../../components/icons";
import { SupportCodePicker, type CodePickerRso } from "../../components/SupportCodePicker";

export const dynamic = "force-dynamic";

export default async function SupportCodes() {
  await requirePagePermission(["ADMIN", "IT", "MANAGER"], "support", "edit");
  const employees = await prisma.employee.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      employeeCode: true,
      supervisor: { select: { name: true } },
      retailers: {
        where: { active: true },
        select: { id: true, retailerCode: true, retailerName: true, supportEligible: true },
        orderBy: { retailerCode: "asc" },
      },
    },
    orderBy: [{ supervisor: { name: "asc" } }, { name: "asc" }],
  });

  const rsos: CodePickerRso[] = employees.map((e) => ({
    employeeId: e.id,
    name: e.name,
    code: e.employeeCode,
    supervisor: e.supervisor?.name || "Unassigned",
    retailers: e.retailers.map((r) => ({
      id: r.id,
      retailerCode: r.retailerCode,
      retailerName: r.retailerName,
      selected: r.supportEligible,
    })),
  }));

  return (
    <main className="page">
      <Link href="/support" className="kit-detail-back no-print">
        <Icon name="arrow" /> Back to Sim Support
      </Link>
      <PageHeader
        title="Support codes"
        subtitle="The slab is paid on the codes picked here — as many as you like, usually two. The SSO offer counts every outlet under an RSO whether or not it is picked."
      />
      {!rsos.length ? (
        <Card padded>
          <EmptyState title="No RSOs yet" hint="Add employees first." icon={<Icon name="users" />} />
        </Card>
      ) : (
        <SupportCodePicker rsos={rsos} />
      )}
    </main>
  );
}

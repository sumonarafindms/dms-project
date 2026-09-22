import { requirePagePermission } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { SCHEME_SELECT } from "../../../../lib/sim-support-data";
import { AppLink as Link } from "../../../components/AppLink";
import { PageHeader } from "../../../components/Kit";
import { Icon } from "../../../components/icons";
import { SupportSchemeForm } from "../../../components/SupportSchemeForm";
import { schemeFormValues } from "../../../components/SupportViews";

export const dynamic = "force-dynamic";

export default async function NewSupportScheme() {
  await requirePagePermission(["ADMIN", "IT", "MANAGER"], "support", "add");
  /*
   * The last offer saved, as a starting point. The owner's offers change a
   * rate or two from day to day, and typing ten steps every morning is how a
   * typo gets in. The day itself is NOT carried over — it has to be picked.
   */
  const last = await prisma.supportScheme.findFirst({ select: SCHEME_SELECT, orderBy: { date: "desc" } });
  return (
    <main className="page">
      <Link href="/support/schemes" className="kit-detail-back no-print">
        <Icon name="arrow" /> Back to offers
      </Link>
      <PageHeader
        title="New support offer"
        subtitle="The day's target, the 300৳ and 170৳ SIM bonus, and the SSO offer if it is running."
      />
      <SupportSchemeForm template={last ? { ...schemeFormValues(last), id: undefined, date: "" } : null} />
    </main>
  );
}

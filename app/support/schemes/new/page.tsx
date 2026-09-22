import { requirePagePermission } from "../../../../lib/auth";
import { AppLink as Link } from "../../../components/AppLink";
import { PageHeader } from "../../../components/Kit";
import { Icon } from "../../../components/icons";
import { SupportSchemeForm } from "../../../components/SupportSchemeForm";

export const dynamic = "force-dynamic";

export default async function NewSupportScheme() {
  await requirePagePermission(["ADMIN", "IT", "MANAGER"], "support", "add");
  return (
    <main className="page">
      <Link href="/support/schemes" className="kit-detail-back no-print">
        <Icon name="arrow" /> Back to offers
      </Link>
      <PageHeader title="New support offer" subtitle="Slabs for a day, and the SSO offer if it is running." />
      <SupportSchemeForm />
    </main>
  );
}

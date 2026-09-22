import { requirePagePermission } from "../../../lib/auth";
import { AppLink as Link } from "../../components/AppLink";
import { PageHeader } from "../../components/Kit";
import { Icon } from "../../components/icons";
import { CampaignForm } from "../../components/CampaignForm";

export const dynamic = "force-dynamic";

/**
 * A new campaign, with no exceptions table.
 *
 * Exceptions are set once the campaign exists: they are rows keyed on its id,
 * and asking somebody to pick exceptions to a number they have not typed yet
 * is the wrong order.
 */
export default async function NewCampaign() {
  await requirePagePermission(["ADMIN", "IT", "MANAGER"], "campaigns", "add");
  return (
    <main className="page">
      <Link href="/campaigns" className="kit-detail-back no-print">
        <Icon name="arrow" /> Back to Campaigns
      </Link>
      <PageHeader title="New campaign" subtitle="A SIM target with a start and an end." />
      <CampaignForm employees={[]} />
    </main>
  );
}

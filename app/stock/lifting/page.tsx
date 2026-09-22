/**
 * Lifting — what the company sent us, and what is left in the godown.
 *
 * Accounts writes; IT and Admin read. Nobody else sees a purchase price:
 * the owner's ruling on who may know the buying side.
 */

import { requireUser } from "../../../lib/auth";
import { dhakaTodayYmd } from "../../../lib/business-time";
import { prisma } from "../../../lib/prisma";
import { activeProducts } from "../../../lib/stock-data";
import { BOOKS_WRITE_ROLES, godown, recentLiftings } from "../../../lib/lifting-data";
import { fmtMoney } from "../../../lib/format";
import { LinkBtn, PageHeader, SectionHead, SummaryStrip } from "../../components/Kit";
import { Icon } from "../../components/icons";
import { GodownTable, LiftingEntryForm, LiftingList } from "../../components/LiftingViews";

export const dynamic = "force-dynamic";

export default async function LiftingPage() {
  /*
   * The literal, not BOOKS_READ_ROLES, because tests/route-guards reads this
   * call as source text. tests/lifting.smoke.test.ts asserts they agree.
   */
  const me = await requireUser(["ACCOUNTS", "ADMIN", "IT"]);
  const canWrite = BOOKS_WRITE_ROLES.includes(me.role);

  const [products, liftings, lines] = await Promise.all([activeProducts(), recentLiftings(60), godown()]);

  /* The last cost paid for each product, so a repeat purchase is one tap. */
  const last = await prisma.lifting.findMany({
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: { productId: true, unitCost: true },
    take: 400,
  });
  const suggested: Record<string, number> = {};
  for (const l of last) if (!(l.productId in suggested)) suggested[l.productId] = Number(l.unitCost);

  const liftedCost = lines.reduce((s, l) => s + l.liftedCost, 0);
  const godownValue = lines.reduce((s, l) => s + l.godownValue, 0);
  const outValue = lines.reduce((s, l) => s + l.issuedCost, 0);

  return (
    <main className="page">
      <PageHeader
        title="Lifting"
        subtitle="What the company sent us, what it cost, and what is still in the godown."
        action={
          <LinkBtn href="/stock/profit" variant="ghost">
            <Icon name="chart" /> Profit
          </LinkBtn>
        }
      />

      <SummaryStrip
        items={[
          { label: "Lifted, all time", value: fmtMoney(liftedCost), tone: "brand" },
          { label: "In godown now", value: fmtMoney(godownValue) },
          { label: "Out with people", value: fmtMoney(outValue) },
          { label: "Liftings recorded", value: String(liftings.length) },
        ]}
      />

      {canWrite && <LiftingEntryForm products={products} today={dhakaTodayYmd()} suggested={suggested} />}

      <SectionHead
        title="In the godown"
        sub="Lifted, less what is out with people, plus what they handed back. All time — not the period of any filter."
      />
      <div className="kit-mb-20">
        <GodownTable lines={lines} />
      </div>

      <SectionHead title="Recent liftings" sub="Newest first." />
      <LiftingList rows={liftings} />
    </main>
  );
}

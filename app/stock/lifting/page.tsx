/**
 * Lifting — what the company sent us, and what is left in the godown.
 *
 * Accounts writes; IT and Admin read. Nobody else sees a purchase price:
 * the owner's ruling on who may know the buying side.
 */

import { closedMonths } from "../../../lib/month-close";
import { requireUser } from "../../../lib/auth";
import { dhakaTodayYmd } from "../../../lib/business-time";
import { prisma } from "../../../lib/prisma";
import { activeProducts } from "../../../lib/stock-data";
import { BOOKS_WRITE_ROLES, godown, recentLiftings } from "../../../lib/lifting-data";
import { fmtMoney, fmtNumber } from "../../../lib/format";
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

  const [products, liftings, lines, liftingCount, closed] = await Promise.all([
    activeProducts(),
    recentLiftings(60),
    godown(),
    // The real count. The list below shows the latest 60; the figure must not stop there (v199).
    prisma.lifting.count(),
    closedMonths(),
  ]);

  /* The last cost paid for each product, so a repeat purchase is one tap. */
  const last = await prisma.lifting.findMany({
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: { productId: true, unitCost: true },
    take: 400,
  });
  const suggested: Record<string, number> = {};
  for (const l of last) if (!(l.productId in suggested)) suggested[l.productId] = Number(l.unitCost);

  /*
   * Summed over what CAN be valued. A product with no lifting cost has stock
   * but no value, and adding it as ৳0 made ৳39.8 lakh of iTopup vanish from
   * both figures (v195). It is named under the table instead.
   */
  const valued = lines.filter((l) => l.hasCost);
  const unvalued = lines.filter((l) => !l.hasCost && (l.inGodown || l.withPeopleQty));
  const liftedCost = lines.reduce((s, l) => s + l.liftedCost, 0);
  const godownValue = valued.reduce((s, l) => s + l.godownValue, 0);
  // v199: what people actually hold now — not everything ever handed out.
  const outValue = valued.reduce((s, l) => s + l.withPeopleCost, 0);

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
          { label: unvalued.length ? "In godown, valued" : "In godown now", value: fmtMoney(godownValue) },
          { label: unvalued.length ? "Out, valued" : "Out with people", value: fmtMoney(outValue) },
          { label: "Liftings recorded", value: fmtNumber(liftingCount) },
        ]}
      />

      {canWrite && (
        <LiftingEntryForm products={products} today={dhakaTodayYmd()} suggested={suggested} closed={closed} />
      )}

      <SectionHead
        title="In the godown"
        sub="Lifted, less what is out with people, plus what they handed back. All time — not the period of any filter."
      />
      <div className="kit-mb-20">
        <GodownTable lines={lines} />
      </div>
      {unvalued.length > 0 && (
        <p className="kit-note">
          <Icon name="info" /> Not valued above, because no lifting cost has been recorded:{" "}
          {unvalued.map((l) => l.product.subType).join(", ")}. Record what the company charged and they are valued.
        </p>
      )}

      <SectionHead title="Recent liftings" sub="Newest first." />
      <LiftingList rows={liftings} canWrite={canWrite} closed={closed} />
    </main>
  );
}

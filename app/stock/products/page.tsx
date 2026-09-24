/**
 * The product master. Accounts only.
 *
 * Note what this page no longer has to be careful about: in v192 a price was
 * the input to every recorded figure, so the screen enforced a freeze. Every
 * movement now carries its own price, so the catalogue is just a catalogue.
 */

import { requireUser } from "../../../lib/auth";
import { dhakaTodayYmd } from "../../../lib/business-time";
import { productCatalogue } from "../../../lib/stock-data";
import { PageHeader } from "../../components/Kit";
import { ProductMaster, type MasterProduct } from "../../components/ProductMaster";

export const dynamic = "force-dynamic";

export default async function Products() {
  /*
   * The literal, not STOCK_WRITE_ROLES, because tests/route-guards reads this
   * call as source text and a map entry that cannot be read is not a guard.
   * tests/stock.smoke.test.ts asserts the two say the same thing.
   */
  await requireUser(["ACCOUNTS"]);

  const today = dhakaTodayYmd();
  const rows = await productCatalogue(today);
  const products: MasterProduct[] = rows.map((p) => ({
    id: p.id,
    category: p.category,
    subType: p.subType,
    unitLabel: p.unitLabel ?? null,
    status: p.status,
    kindName: p.kindName ?? null,
    activationType: p.activationType,
    movements: p.movements,
    prices: p.prices,
    current: p.current,
  }));

  return (
    <main className="page">
      <PageHeader title="Products" subtitle="What Accounts hands out, and what each unit has cost over time." />
      <ProductMaster products={products} today={today} />
    </main>
  );
}

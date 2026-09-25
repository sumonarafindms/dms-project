/**
 * The house's running costs, by day.
 *
 * Accounts writes; IT and Admin read. A manager sees every RSO's due and still
 * has no business knowing what the office spends — the owner's ruling on who
 * may see the buying side applies here too.
 */

import { closedMonths } from "../../../lib/month-close";
import { requireUser } from "../../../lib/auth";
import { dhakaTodayYmd } from "../../../lib/business-time";
import { resolveRange } from "../../../lib/report-range";
import { BOOKS_WRITE_ROLES, expensesIn } from "../../../lib/lifting-data";
import { expenseTotals } from "../../../lib/lifting";
import { prisma } from "../../../lib/prisma";
import { fmtMoney } from "../../../lib/format";
import { Card, PageHeader, SectionHead, SummaryStrip } from "../../components/Kit";
import { ReportActionBar, ReportDateBar } from "../../components/ReportShell";
import { ExpenseByCategory, ExpenseEntryForm, ExpenseList } from "../../components/ExpenseViews";

export const dynamic = "force-dynamic";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  /*
   * The literal, not BOOKS_READ_ROLES, because tests/route-guards reads this
   * call as source text. tests/lifting.smoke.test.ts asserts they agree.
   */
  const me = await requireUser(["ACCOUNTS", "ADMIN", "IT"]);
  const canWrite = BOOKS_WRITE_ROLES.includes(me.role);

  const sp = await searchParams;
  const range = resolveRange(sp.from, sp.to);
  const [rows, kindRows, closed] = await Promise.all([
    expensesIn(range),
    // v201: the owner's own kinds used so far, offered again in the menu.
    prisma.expense.findMany({
      where: { category: "OTHER", label: { not: null } },
      distinct: ["label"],
      select: { label: true },
      orderBy: { label: "asc" },
    }),
    closedMonths(),
  ]);
  const kinds = kindRows.map((k) => k.label!).filter(Boolean);
  const totals = expenseTotals(rows);

  // One instant for both renders — see ReportDateBar's nowIso.
  const nowIso = new Date().toISOString();

  return (
    <main className="page">
      <PageHeader title="Expenses" subtitle="What it costs to run the place, day by day." />
      <ReportDateBar range={range} nowIso={nowIso} />
      <ReportActionBar
        exportHref={`/api/stock/export?report=expenses&from=${range.from}&to=${range.to}`}
        rowCount={rows.length}
      />

      <SummaryStrip
        items={[
          { label: "Spent in period", value: fmtMoney(totals.total), tone: "brand" },
          { label: "From cash", value: fmtMoney(totals.cash) },
          { label: "From bank", value: fmtMoney(totals.bank) },
          { label: "Entries", value: String(rows.length) },
        ]}
      />

      {canWrite && (
        <ExpenseEntryForm
          today={dhakaTodayYmd()}
          kinds={kinds}
          shown={{ from: range.from, to: range.to }}
          closed={closed}
        />
      )}

      {totals.byCategory.length > 0 && (
        <Card className="kit-card-p kit-mb-20">
          <SectionHead title="By kind" sub="For the period above." />
          <ExpenseByCategory rows={totals.byCategory} />
        </Card>
      )}

      <SectionHead title="Entries" sub="Newest first." />
      <ExpenseList rows={rows} canWrite={canWrite} closed={closed} />
    </main>
  );
}

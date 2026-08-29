/**
 * RSO & BP directory — migrated to the role-UI kit.
 *
 * Read-only reference for the accounts role: who owns which retailers while
 * validating an import. A BP row shows its *current* GA target, which is the
 * newest monthly override if one exists and the assignment's own target
 * otherwise — the same precedence the import and performance code uses.
 */

import { requirePagePermission } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { Card, EmptyState, PageHeader, Row, SectionHead, SummaryStrip } from "../../components/Kit";
import { Icon } from "../../components/icons";

export default async function Page() {
  await requirePagePermission(["ACCOUNTS"], "employees");
  const [rsos, bps, supervisors] = await Promise.all([
    prisma.employee.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        rsoMsisdn: true,
        employeeCode: true,
        _count: { select: { retailers: true } },
        supervisor: { select: { name: true } },
      },
    }),
    prisma.bpAssignment.findMany({
      where: { active: true },
      orderBy: { employee: { name: "asc" } },
      include: { employee: true, retailer: true, monthlyTargets: { orderBy: { month: "desc" }, take: 1 } },
    }),
    prisma.supervisor.count({ where: { active: true } }),
  ]);

  return (
    <main className="page">
      <PageHeader
        title="RSO & BP Directory"
        subtitle="The active field hierarchy, for checking imports, targets and retailer ownership."
      />

      <SummaryStrip
        items={[
          { label: "Active RSOs", value: rsos.length.toLocaleString() },
          { label: "BP Assignments", value: bps.length.toLocaleString() },
          { label: "Supervisors", value: supervisors.toLocaleString() },
          {
            label: "Owned Retailers",
            value: rsos.reduce((n, x) => n + x._count.retailers, 0).toLocaleString(),
            tone: "teal",
          },
        ]}
      />

      <SectionHead title="Active BP assignments" sub="Retailer code, RSO ownership and current GA target." />
      <Card padded style={{ marginBottom: "1.25rem" }}>
        {bps.length ? (
          <div className="kit-rows">
            {bps.map((x) => (
              <Row
                key={x.id}
                avatar={x.retailer.retailerName || x.retailer.retailerCode}
                title={x.retailer.retailerName || x.retailer.retailerCode}
                sub={x.retailer.retailerCode}
                detail={`RSO ${x.employee.name} · since ${x.startDate.toISOString().slice(0, 10)}`}
                value={x.monthlyTargets[0]?.gaTarget ?? x.gaTarget}
                valueSub="GA target"
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No active BP assignments"
            hint="A BP appears here once it holds a live assignment."
            icon={<Icon name="sim" />}
          />
        )}
      </Card>

      <SectionHead title="RSO reference" sub="Useful for employee mapping and retailer ownership checks." />
      <Card padded>
        {rsos.length ? (
          <div className="kit-rows">
            {rsos.map((x) => (
              <Row
                key={x.id}
                avatar={x.name}
                title={x.name}
                // employeeCode falls back to the MSISDN, so without this an
                // RSO with no code showed the same number twice.
                sub={x.employeeCode ? `${x.employeeCode} · ${x.rsoMsisdn}` : x.rsoMsisdn}
                detail={x.supervisor?.name || "No supervisor assigned"}
                value={x._count.retailers}
                valueSub="outlets"
              />
            ))}
          </div>
        ) : (
          <EmptyState title="No active RSOs" icon={<Icon name="users" />} />
        )}
      </Card>
    </main>
  );
}

import { requireUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { PageHeader } from "../../components/Kit";
import BpManager from "./BpManager";

export default async function BpManagement() {
  await requireUser(["ADMIN","IT"]);

  const [employees, retailers, current, history] = await Promise.all([
    prisma.employee.findMany({
      where: { active: true },
      orderBy: [{ supervisor: { name: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        rsoMsisdn: true,
        supervisor: { select: { name: true } },
      },
    }),
    prisma.retailer.findMany({
      where: { active: true },
      orderBy: { retailerCode: "asc" },
      select: {
        id: true,
        retailerCode: true,
        retailerName: true,
        employeeId: true,
        employee: { select: { name: true, rsoMsisdn: true } },
      },
    }),
    prisma.bpAssignment.findMany({
      where: { active: true },
      orderBy: { employee: { name: "asc" } },
      include: {
        employee: { include: { supervisor: true } },
        retailer: {
          select: {
            id: true,
            retailerCode: true,
            retailerName: true,
            bpUser: { select: { displayName: true, mobileNumber: true, active: true, role: true } },
          },
        },
      },
    }),
    prisma.bpAssignment.findMany({
      where: { active: false },
      orderBy: { endDate: "desc" },
      take: 30,
      include: {
        employee: { select: { name: true } },
        retailer: { select: { retailerCode: true, retailerName: true } },
      },
    }),
  ]);

  return (
    <main className="page">
      <PageHeader
        title="BP Management"
        subtitle="Select a retailer code as BP, assign it under an RSO, and keep effective-date history when BP codes change."
      />
      <BpManager
        employees={employees.map((e) => ({
          id: e.id,
          name: e.name,
          rsoMsisdn: e.rsoMsisdn,
          supervisor: e.supervisor?.name || "Unassigned",
        }))}
        retailers={retailers.map((r) => ({
          id: r.id,
          code: r.retailerCode,
          name: r.retailerName || "",
          employeeId: r.employeeId || "",
          employee: r.employee?.name || "",
          rsoMsisdn: r.employee?.rsoMsisdn || "",
        }))}
        current={current.map((a) => ({
          id: a.id,
          employeeId: a.employeeId,
          employee: a.employee.name,
          supervisor: a.employee.supervisor?.name || "Unassigned",
          retailerId: a.retailerId,
          code: a.retailer.retailerCode,
          name: a.retailer.retailerName || "",
          startDate: a.startDate.toISOString().slice(0, 10),
          gaTarget: a.gaTarget,
          login: a.retailer.bpUser?.active && a.retailer.bpUser.role === "BP" ? a.retailer.bpUser.displayName : "",
          mobile: a.retailer.bpUser?.active && a.retailer.bpUser.role === "BP" ? a.retailer.bpUser.mobileNumber || "" : "",
        }))}
        history={history.map((a) => ({
          id: a.id,
          employee: a.employee.name,
          code: a.retailer.retailerCode,
          name: a.retailer.retailerName || "",
          startDate: a.startDate.toISOString().slice(0, 10),
          endDate: a.endDate?.toISOString().slice(0, 10) || "",
        }))}
      />
    </main>
  );
}

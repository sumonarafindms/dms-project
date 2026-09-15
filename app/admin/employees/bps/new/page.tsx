import { requireUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import AdminEmployeeForm from "../../../../components/AdminEmployeeForm";
export default async function Page() {
  await requireUser(["ADMIN", "IT"]);
  const [employees, retailers] = await Promise.all([
    prisma.employee.findMany({ where: { active: true }, orderBy: { name: "asc" }, include: { supervisor: true } }),
    prisma.retailer.findMany({
      where: { active: true },
      orderBy: { retailerCode: "asc" },
      select: { id: true, retailerCode: true, retailerName: true, employeeId: true },
    }),
  ]);
  return (
    <AdminEmployeeForm
      role="bps"
      /* Wallet AND supervisor, not one or the other: the picker searches the
         meta line, and the wallet number is how an operator tells two RSOs with
         similar names apart. */
      employees={employees.map((x) => ({
        id: x.id,
        name: x.name,
        meta: [x.rsoMsisdn, x.supervisor?.name].filter(Boolean).join(" · "),
      }))}
      retailers={retailers.map((x) => ({
        id: x.id,
        name: x.retailerCode,
        meta: x.retailerName || "",
        employeeId: x.employeeId || "",
      }))}
    />
  );
}

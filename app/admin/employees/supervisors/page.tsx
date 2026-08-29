import { requireUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { EmployeeList } from "../../../components/AdminEmployeesUI";
import { PageHeader } from "../../../components/Kit";
export default async function Page() {
  await requireUser(["ADMIN", "IT"]);
  const rows = await prisma.supervisor.findMany({
    orderBy: { name: "asc" },
    include: { user: true, _count: { select: { employees: true } } },
  });
  return (
    <main className="page">
      <PageHeader
        title="Supervisors"
        subtitle="Create supervisors, manage their login, and review assigned RSO count."
      />
      <EmployeeList
        title="Supervisors"
        addHref="/admin/employees/supervisors/new"
        rows={rows.map((x) => ({
          id: x.id,
          name: x.name,
          mobile: x.user?.mobileNumber || "",
          role: "SUPERVISOR",
          active: x.active && Boolean(x.user?.active ?? true),
          meta: `${x._count.employees} assigned RSOs`,
          detail: x.user?.mobileNumber ? `Login: ${x.user.mobileNumber}` : "No login account yet",
          editHref: `/admin/employees/supervisors/${x.id}`,
        }))}
      />
    </main>
  );
}

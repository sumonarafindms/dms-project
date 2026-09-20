import { requireUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import AdminEmployeeForm from "../../../../components/AdminEmployeeForm";
import { notFound } from "next/navigation";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(["ADMIN", "IT"]);
  const { id } = await params,
    [e, supervisors] = await Promise.all([
      prisma.employee.findUnique({
        where: { id },
        include: {
          user: true,
          supervisor: { select: { name: true } },
          _count: { select: { retailers: true, bpAssignments: true } },
        },
      }),
      prisma.supervisor.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    ]);
  if (!e) notFound();
  return (
    <AdminEmployeeForm
      role="rsos"
      heading={e.name}
      /* Who this is and what they carry, above the fields that change it — the
         same panel the BP form needed and every edit screen now has. */
      identity={[
        { label: "Wallet", value: e.rsoMsisdn, sub: e.employeeCode || undefined },
        { label: "Supervisor", value: e.supervisor?.name || "Unassigned" },
        { label: "Retailers", value: e._count.retailers.toLocaleString("en-US") },
        { label: "BP assignments", value: e._count.bpAssignments.toLocaleString("en-US") },
      ]}
      supervisors={supervisors.map((x) => ({ id: x.id, name: x.name }))}
      initial={{
        id: e.id,
        name: e.name,
        mobile: e.user?.mobileNumber || "",
        active: e.active && Boolean(e.user?.active ?? true),
        rsoMsisdn: e.rsoMsisdn,
        employeeCode: e.employeeCode || "",
        supervisorId: e.supervisorId || "",
      }}
    />
  );
}

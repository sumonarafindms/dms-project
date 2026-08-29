import { requireUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import AdminEmployeeForm from "../../../../components/AdminEmployeeForm";
import { notFound } from "next/navigation";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(["ADMIN", "IT"]);
  const { id } = await params,
    a = await prisma.bpAssignment.findUnique({
      where: { id },
      include: { retailer: { include: { bpUser: true } }, employee: true },
    });
  if (!a) notFound();
  return (
    <AdminEmployeeForm
      role="bps"
      initial={{
        id: a.id,
        name: a.retailer.bpUser?.displayName || a.retailer.retailerName || a.retailer.retailerCode,
        mobile: a.retailer.bpUser?.mobileNumber || "",
        active: a.active && Boolean(a.retailer.bpUser?.active ?? true),
        employeeId: a.employeeId,
        retailerId: a.retailerId,
        startDate: a.startDate.toISOString().slice(0, 10),
        gaTarget: a.gaTarget,
      }}
    />
  );
}

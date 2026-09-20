import { requireUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import AdminEmployeeForm from "../../../../components/AdminEmployeeForm";
import { bpDisplayName } from "../../../../../lib/bp-name";
import { fmtDate } from "../../../../../lib/format";
import { notFound } from "next/navigation";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(["ADMIN", "IT"]);
  const { id } = await params,
    a = await prisma.bpAssignment.findUnique({
      where: { id },
      include: {
        retailer: { include: { bpUser: true } },
        employee: { include: { supervisor: { select: { name: true } } } },
      },
    });
  if (!a) notFound();
  /*
   * What this assignment IS, as opposed to what can be changed about it.
   *
   * The form used to receive only ids and the optional display name, so an
   * operator who opened one of two hundred BP assignments saw "Edit BP" and a
   * box reading "Current BP assignment" — nothing naming the outlet, the RSO
   * or the team. Everything below is already loaded for the form's own fields;
   * it was simply never passed on.
   */
  const label = bpDisplayName({
    bpName: a.retailer.bpName,
    retailerName: a.retailer.retailerName,
    retailerCode: a.retailer.retailerCode,
  });
  const ended = a.endDate ? fmtDate(a.endDate.toISOString(), "—") : null;
  return (
    <AdminEmployeeForm
      role="bps"
      heading={label}
      identity={[
        {
          label: "Retailer",
          value: a.retailer.retailerCode,
          sub: a.retailer.retailerName || undefined,
        },
        {
          label: "RSO",
          value: a.employee.name,
          sub: a.employee.employeeCode || a.employee.rsoMsisdn,
        },
        { label: "Supervisor", value: a.employee.supervisor?.name || "Unassigned" },
        {
          label: "Effective",
          value: fmtDate(a.startDate.toISOString(), "—"),
          // An assignment that has ended still opens here, and saying so is
          // the difference between reading a live record and a closed one.
          sub: ended ? `until ${ended}` : "open-ended",
        },
      ]}
      initial={{
        id: a.id,
        /*
         * The BP's own name, from the retailer row that now holds it.
         *
         * This was the ONE place in the app that read the name back, which is
         * why it looked right here and nowhere else. It reads the same field
         * every other screen reads now, and falls back the same way.
         */
        name: a.retailer.bpName || "",
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

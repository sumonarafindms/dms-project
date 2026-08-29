import { requireUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { notFound } from "next/navigation";
import PermissionEditor from "../../../components/PermissionEditor";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(["ADMIN", "IT"]);
  const { id } = await params,
    u = await prisma.user.findUnique({ where: { id } });
  if (!u || ["ADMIN", "IT"].includes(u.role)) notFound();
  return <PermissionEditor userId={u.id} name={u.displayName} role={u.role} />;
}

import { requireUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import PermissionBulkManager from "../../components/PermissionBulkManager";
import { Card, EmptyState, PageHeader, Row, SectionHead, SummaryStrip } from "../../components/Kit";
import { Icon } from "../../components/icons";

export default async function Page() {
  await requireUser(["ADMIN", "IT"]);
  // ADMIN and IT always hold full access (lib/permissions.ts permissionsFor/hasPermission),
  // and every write path rejects them. Listing them here produced rows that 404'd on click.
  const users = await prisma.user.findMany({
    where: { role: { notIn: ["ADMIN", "IT"] } },
    orderBy: [{ role: "asc" }, { displayName: "asc" }],
    include: { _count: { select: { permissions: true } } },
  });
  const custom = users.filter((u) => u._count.permissions > 0).length,
    defaults = users.length - custom;

  return (
    <main className="page">
      <PageHeader
        title="Permissions Center"
        subtitle="Control individual access, apply safe role presets or copy an existing setup."
      />

      <SummaryStrip
        items={[
          { label: "Login Users", value: users.length.toLocaleString() },
          { label: "Role Default", value: defaults.toLocaleString() },
          { label: "Customized", value: custom.toLocaleString(), tone: "teal" },
          { label: "Roles", value: new Set(users.map((x) => x.role)).size.toLocaleString() },
        ]}
      />

      <PermissionBulkManager
        users={users.map((u) => ({
          id: u.id,
          name: u.displayName,
          role: u.role,
          mobile: u.mobileNumber || "",
          custom: u._count.permissions,
        }))}
      />

      <SectionHead title="Individual access" sub="Open a user to set module permissions one by one." />
      <Card padded>
        {users.length ? (
          <div className="kit-rows">
            {users.map((u) => (
              <Row
                key={u.id}
                href={`/admin/permissions/${u.id}`}
                avatar={u.displayName}
                title={u.displayName}
                sub={`${u.role} · ${u.mobileNumber || "No mobile"}`}
                value={u._count.permissions ? u._count.permissions : "—"}
                valueSub={u._count.permissions ? "custom" : "role default"}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No editable accounts"
            hint="ADMIN and IT always hold full access and are not listed here."
            icon={<Icon name="shield" />}
          />
        )}
      </Card>
    </main>
  );
}

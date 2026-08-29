/**
 * Accounts Operations Center — migrated to the role-UI kit.
 *
 * The list is filtered by this user's own module permissions, so an accounts
 * user who cannot see C2S never gets a link into it. That check is the
 * server's (`permissionsFor`), and the page only renders what it returns —
 * which is also why an empty list is a real state worth handling rather than
 * an impossible one.
 */

import { requireUser } from "../../../lib/auth";
import { permissionsFor } from "../../../lib/permissions";
import { Card, EmptyState, PageHeader, SectionHead, Tile } from "../../components/Kit";
import { Icon } from "../../components/icons";

export default async function Page() {
  const u = await requireUser(["ACCOUNTS"]),
    permissions = await permissionsFor(u.id, u.role);

  const modules = [
    {
      key: "ga",
      href: "/accounts/operations/ga",
      icon: "sim",
      title: "GA Activation",
      sub: "Upload activation workbook and review GA",
    },
    {
      key: "c2c",
      href: "/accounts/operations/c2c",
      icon: "wallet",
      title: "C2C Stock Lifting",
      sub: "Upload stock-lifting report",
    },
    {
      key: "c2s",
      href: "/accounts/operations/c2s",
      icon: "chart",
      title: "C2S Retail Sales",
      sub: "Import cumulative retailer sales",
    },
    {
      key: "ob",
      href: "/accounts/operations/ob",
      icon: "balance",
      title: "Opening Balance",
      sub: "Maintain latest balance snapshot",
    },
    {
      key: "targets",
      href: "/accounts/operations/targets",
      icon: "target",
      title: "SC & Targets",
      sub: "Monthly target and SC control",
    },
  ].filter((m) => permissions[m.key]?.view);

  return (
    <main className="page">
      <PageHeader
        title="Operations Center"
        subtitle="Import, validate and maintain the daily datasets that power every role dashboard."
      />

      <div className="kit-note is-warn" role="note">
        <Icon name="shield" />
        <span>
          Duplicate detection, mapping checks and source validation stay active inside every module — nothing is written
          until a file passes them.
        </span>
      </div>

      <SectionHead
        title="Data operations"
        sub={`${modules.length} ${modules.length === 1 ? "module" : "modules"} available to you.`}
      />
      {modules.length ? (
        <div className="kit-card-grid">
          {modules.map((m) => (
            <Tile key={m.key} href={m.href} icon={<Icon name={m.icon} />} title={m.title} sub={m.sub} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            title="No import modules available"
            hint="Your account has no view permission on any data module. An administrator can grant one."
            icon={<Icon name="shield" />}
          />
        </Card>
      )}
    </main>
  );
}

/**
 * Employee Control Center — migrated to the role-UI kit.
 *
 * The workforce hub: headcount by role, a link into each role's directory,
 * the reporting chain, and the two access-management entry points.
 */

import Link from "next/link";
import { requireUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { Icon } from "../../components/icons";
import { withDatabaseRetry } from "../../../lib/db-retry";
import { Card, PageHeader, Row, SectionHead, SummaryStrip } from "../../components/Kit";

export default async function Page() {
  await requireUser(["ADMIN", "IT"]);
  let counts: { managers: number; supervisors: number; rsos: number; bps: number; logins: number; itUsers: number } | null =
    null;
  try {
    counts = await withDatabaseRetry(async () => {
      const [managers, supervisors, rsos, bps, logins, itUsers] = await Promise.all([
        prisma.user.count({ where: { role: "MANAGER" } }),
        prisma.supervisor.count({}),
        prisma.employee.count({}),
        prisma.bpAssignment.count({ where: { active: true } }),
        prisma.user.count({ where: { active: true } }),
        prisma.user.count({ where: { role: "IT", active: true } }),
      ]);
      return { managers, supervisors, rsos, bps, logins, itUsers };
    });
  } catch (error) {
    console.error("Employee Control Center load failed", error);
  }

  if (!counts)
    return (
      <main className="page">
        <PageHeader
          title="Employee data is taking longer than expected"
          subtitle="The page retried the database connection automatically. No employee, login or assignment data was changed."
        />
        <Card padded>
          <div className="kit-form-actions" style={{ marginTop: 0 }}>
            <Link className="kit-btn is-primary size-md" href="/admin/employees">
              Try again
            </Link>
            <Link className="kit-btn is-ghost size-md" href="/dashboard">
              Back to dashboard
            </Link>
          </div>
        </Card>
      </main>
    );

  const { managers, supervisors, rsos, bps, logins, itUsers } = counts;
  const roles = [
    { href: "/admin/employees/managers", icon: "users", label: "Managers", count: managers, sub: "Monitoring & overview" },
    {
      href: "/admin/employees/supervisors",
      icon: "users",
      label: "Supervisors",
      count: supervisors,
      sub: "Team ownership",
    },
    { href: "/admin/employees/rsos", icon: "chart", label: "RSOs", count: rsos, sub: "Field employees" },
    { href: "/admin/employees/bps", icon: "sim", label: "BPs", count: bps, sub: "SIM sales assignments" },
    { href: "/admin/users", icon: "shield", label: "IT", count: itUsers, sub: "System administration" },
  ];

  return (
    <main className="page">
      <PageHeader
        title="Employee Control Center"
        subtitle="Workforce structure, field ownership, assignments and login access in one workspace."
      />

      <SummaryStrip
        items={[
          { label: "Field Force", value: (supervisors + rsos).toLocaleString() },
          { label: "Active BPs", value: bps.toLocaleString() },
          { label: "Login Accounts", value: logins.toLocaleString(), tone: "teal" },
          { label: "IT Users", value: itUsers.toLocaleString() },
        ]}
      />

      <SectionHead title="Directories" sub="Open a role to add, edit or deactivate its records." />
      <Card padded style={{ marginBottom: "1.25rem" }}>
        <div className="kit-rows">
          {roles.map((r) => (
            <Row
              key={r.href}
              href={r.href}
              icon={<Icon name={r.icon} />}
              title={r.label}
              sub={r.sub}
              value={r.count.toLocaleString()}
            />
          ))}
        </div>
      </Card>

      <SectionHead
        title="Organization structure"
        sub="Assignments follow this reporting chain. IT stays outside the field hierarchy."
      />
      <Card padded style={{ marginBottom: "1.25rem" }}>
        <div className="kit-flow">
          <span>Manager</span>
          <b aria-hidden="true">→</b>
          <span>Supervisor</span>
          <b aria-hidden="true">→</b>
          <span>RSO</span>
          <b aria-hidden="true">→</b>
          <span>BP / Retailer</span>
        </div>
      </Card>

      <SectionHead title="Access management" sub="Authorized accounts and module-level permissions." />
      <Card padded>
        <div className="kit-form-actions" style={{ marginTop: 0 }}>
          <Link className="kit-btn is-primary size-md" href="/admin/permissions">
            <Icon name="shield" /> Manage Permissions
          </Link>
          <Link className="kit-btn is-secondary size-md" href="/admin/users">
            Login Accounts
          </Link>
        </div>
      </Card>
    </main>
  );
}

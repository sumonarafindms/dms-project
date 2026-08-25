import Link from "next/link";
import { requireUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

export default async function Employees() {
  await requireUser(["ADMIN", "IT"]);

  const [managers, supervisors, rsos, bps, logins, itUsers] =
    await Promise.all([
      prisma.user.count({
        where: { role: "MANAGER", active: true },
      }),

      prisma.supervisor.count({
        where: { active: true },
      }),

      prisma.employee.count({
        where: { active: true },
      }),

      prisma.bpAssignment.count({
        where: { active: true },
      }),

      prisma.user.count({
        where: { active: true },
      }),

      prisma.user.count({
        where: { role: "IT", active: true },
      }),
    ]);

  return (
    <main className="page admin-employees">
      <section className="people-command people-v3-command">
        <div>
          <div className="admin-kicker">PEOPLE & ACCESS</div>

          <h1>Employee Control Center</h1>

          <p className="employees-sub">
            Manage workforce structure, field ownership,
            assignments and login access from one workspace.
          </p>

          <div className="people-v3-chips">
            <span>{managers} Managers</span>
            <span>{supervisors} Supervisors</span>
            <span>{rsos} RSOs</span>
            <span>{bps} Active BPs</span>
            <span>{itUsers} IT Users</span>
          </div>
        </div>

        <div className="people-command-stat">
          <small>AUTHORIZED USERS</small>
          <strong>{logins}</strong>
          <span>Active login accounts</span>
        </div>
      </section>

      <div className="employee-role-grid">
        <Link
          href="/admin/employees/managers"
          className="employee-role-card manager"
        >
          <div className="employee-role-icon">MG</div>

          <div>
            <strong>Managers</strong>
            <small>Monitoring & overview</small>
          </div>

          <b>{managers}</b>
          <span>›</span>
        </Link>

        <Link
          href="/admin/employees/supervisors"
          className="employee-role-card supervisor"
        >
          <div className="employee-role-icon">SP</div>

          <div>
            <strong>Supervisors</strong>
            <small>Team ownership</small>
          </div>

          <b>{supervisors}</b>
          <span>›</span>
        </Link>

        <Link
          href="/admin/employees/rsos"
          className="employee-role-card rso"
        >
          <div className="employee-role-icon">RS</div>

          <div>
            <strong>RSOs</strong>
            <small>Field employees</small>
          </div>

          <b>{rsos}</b>
          <span>›</span>
        </Link>

        <Link
          href="/admin/employees/bps"
          className="employee-role-card bp"
        >
          <div className="employee-role-icon">BP</div>

          <div>
            <strong>BPs</strong>
            <small>SIM sales assignments</small>
          </div>

          <b>{bps}</b>
          <span>›</span>
        </Link>

        <Link
          href="/admin/users"
          className="employee-role-card it"
        >
          <div className="employee-role-icon">IT</div>

          <div>
            <strong>IT</strong>
            <small>System administration access</small>
          </div>

          <b>{itUsers}</b>
          <span>›</span>
        </Link>
      </div>

      <div className="employee-management-grid">
        <section className="card employee-hierarchy premium-hierarchy">
          <div className="employee-hierarchy-title">
            Organization hierarchy
          </div>

          <div className="hierarchy-flow premium-flow">
            <span>Manager</span>
            <b>→</b>
            <span>Supervisor</span>
            <b>→</b>
            <span>RSO</span>
            <b>→</b>
            <span>BP / Retailer</span>
          </div>

          <p>
            IT is a system-access role and is not part of the
            field reporting hierarchy.
          </p>
        </section>

        <aside className="card employee-access-card">
          <span>ACCESS MANAGEMENT</span>

          <strong>
            Control login accounts and module-level permissions.
          </strong>

          <div className="employee-hub-actions">
            <Link
              className="btn admin-primary"
              href="/admin/permissions"
            >
              Manage Permissions
            </Link>

            <Link
              className="btn btn-ghost"
              href="/admin/users"
            >
              Login Accounts
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
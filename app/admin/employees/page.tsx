import {requireUser} from "../../../lib/auth";
import {prisma} from "../../../lib/prisma";
import {EmployeeHubCard} from "../../components/AdminEmployeesUI";

export default async function Page(){
 await requireUser(["ADMIN","IT"]);
 const [managers,supervisors,rsos,bps,logins]=await Promise.all([
  prisma.user.count({where:{role:"MANAGER"}}),prisma.supervisor.count({}),prisma.employee.count({}),prisma.bpAssignment.count({where:{active:true}}),prisma.user.count({where:{active:true}})
 ]);
 return <main className="page admin-employees premium-employees">
  <section className="people-command people-v3-command"><div><div className="admin-kicker">PEOPLE & ACCESS</div><h1>Employee Control Center</h1><p className="employees-sub">Manage workforce structure, field ownership, assignments and login access from one workspace.</p><div className="people-v3-chips"><span>{managers} Managers</span><span>{supervisors} Supervisors</span><span>{rsos} RSOs</span><span>{bps} Active BPs</span></div></div><div className="people-command-stat"><small>AUTHORIZED USERS</small><strong>{logins}</strong><span>Active login accounts</span></div></section>
  <div className="employee-hub-grid premium-people-grid"><EmployeeHubCard href="/admin/employees/managers" icon="users" title="Managers" count={managers} sub="Monitoring & overview"/><EmployeeHubCard href="/admin/employees/supervisors" icon="users" title="Supervisors" count={supervisors} sub="Team ownership"/><EmployeeHubCard href="/admin/employees/rsos" icon="chart" title="RSOs" count={rsos} sub="Field employees"/><EmployeeHubCard href="/admin/employees/bps" icon="sim" title="BPs" count={bps} sub="SIM sales assignments"/></div>
  <div className="employee-management-grid"><section className="card employee-hierarchy premium-hierarchy"><div className="employee-hierarchy-title">Organization hierarchy</div><div className="hierarchy-flow premium-flow"><span>Manager</span><b>→</b><span>Supervisor</span><b>→</b><span>RSO</span><b>→</b><span>BP / Retailer</span></div><p>Hierarchy assignments automatically drive team views, performance drill-down and role visibility.</p></section><aside className="card employee-access-card"><span>ACCESS MANAGEMENT</span><strong>Control who can see and update each module.</strong><div className="employee-hub-actions"><a className="btn admin-primary" href="/admin/permissions">Manage Permissions</a><a className="btn btn-ghost" href="/admin/users">Login Accounts</a></div></aside></div>
 </main>
}
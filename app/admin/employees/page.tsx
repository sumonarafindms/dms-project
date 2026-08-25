import {requireUser} from "../../../lib/auth";
import {prisma} from "../../../lib/prisma";
import {EmployeeHubCard} from "../../components/AdminEmployeesUI";

export default async function Page(){
 await requireUser(["ADMIN"]);
 const [managers,supervisors,rsos,bps]=await Promise.all([
  prisma.user.count({where:{role:"MANAGER"}}),
  prisma.supervisor.count({}),
  prisma.employee.count({}),
  prisma.bpAssignment.count({where:{active:true}}),
 ]);
 return <main className="page admin-employees"><div className="admin-kicker">PEOPLE & ACCESS</div><h1>Employees</h1><p className="employees-sub">Create, edit, assign and manage DMS employee accounts and hierarchy.</p>
 <div className="employee-hub-grid"><EmployeeHubCard href="/admin/employees/managers" icon="users" title="Managers" count={managers} sub="Monitoring & overview"/><EmployeeHubCard href="/admin/employees/supervisors" icon="users" title="Supervisors" count={supervisors} sub="Team ownership"/><EmployeeHubCard href="/admin/employees/rsos" icon="chart" title="RSOs" count={rsos} sub="Field employees"/><EmployeeHubCard href="/admin/employees/bps" icon="sim" title="BPs" count={bps} sub="SIM sales assignments"/></div>
 <div className="employee-hub-actions"><a className="btn btn-ghost" href="/admin/permissions">Manage Permissions</a><a className="btn btn-ghost" href="/admin/users">View all login accounts</a></div><div className="card employee-hierarchy"><div className="employee-hierarchy-title">Organization hierarchy</div><div className="hierarchy-flow"><span>Manager</span><b>↓</b><span>Supervisor</span><b>↓</b><span>RSO</span><b>↓</b><span>BP / Retailer</span></div><p>Assignments made here are reflected in Admin Performance drill-down and role-based access.</p></div></main>
}

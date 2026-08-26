import Link from "next/link";
import {requireUser} from "../../../lib/auth";
import {prisma} from "../../../lib/prisma";
import {Icon} from "../../components/icons";
import {withDatabaseRetry} from "../../../lib/db-retry";

function RoleCard({href,icon,label,count,description,tone}:{href:string;icon:string;label:string;count:number;description:string;tone:string}){
 return <Link href={href} className={`ecc-v82-role ${tone}`}>
  <span className="ecc-v82-icon"><Icon name={icon}/></span>
  <span className="ecc-v82-role-copy"><strong>{label}</strong><small>{description}</small></span>
  <b>{count}</b><span className="ecc-v82-arrow">›</span>
 </Link>
}

export default async function Page(){
 await requireUser(["ADMIN","IT"]);
 let counts:{managers:number;supervisors:number;rsos:number;bps:number;logins:number;itUsers:number}|null=null;
 try{
  counts=await withDatabaseRetry(async()=>{
   const [managers,supervisors,rsos,bps,logins,itUsers]=await Promise.all([
    prisma.user.count({where:{role:"MANAGER"}}),
    prisma.supervisor.count({}),
    prisma.employee.count({}),
    prisma.bpAssignment.count({where:{active:true}}),
    prisma.user.count({where:{active:true}}),
    prisma.user.count({where:{role:"IT",active:true}})
   ]);
   return {managers,supervisors,rsos,bps,logins,itUsers};
  });
 }catch(error){
  console.error("Employee Control Center load failed",error);
 }
 if(!counts)return <main className="page ecc-v82"><section className="employee-retry-v91"><span>DATA CONNECTION</span><h1>Employee data is taking longer than expected</h1><p>The page retried the database connection automatically. No employee, login or assignment data was changed.</p><div><Link className="btn admin-primary" href="/admin/employees">Try again</Link><Link className="btn btn-ghost" href="/dashboard">Back to dashboard</Link></div></section></main>;
 const {managers,supervisors,rsos,bps,logins,itUsers}=counts;

 return <main className="page ecc-v82">
  <section className="ecc-v82-hero">
   <div className="ecc-v82-hero-copy">
    <span className="ecc-v82-kicker">PEOPLE &amp; ACCESS</span>
    <h1>Employee Control Center</h1>
    <p>Manage workforce structure, field ownership, assignments and login access from one workspace.</p>
    <div className="ecc-v82-chips">
     <span>{managers} Managers</span><span>{supervisors} Supervisors</span>
     <span>{rsos} RSOs</span><span>{bps} Active BPs</span><span>{itUsers} IT Users</span>
    </div>
   </div>
   <div className="ecc-v82-auth">
    <span>AUTHORIZED USERS</span><strong>{logins}</strong><small>Active login accounts</small>
   </div>
  </section>

  <section className="ecc-v82-roles" aria-label="Employee roles">
   <RoleCard href="/admin/employees/managers" icon="users" label="Managers" count={managers} description="Monitoring & overview" tone="blue"/>
   <RoleCard href="/admin/employees/supervisors" icon="users" label="Supervisors" count={supervisors} description="Team ownership" tone="violet"/>
   <RoleCard href="/admin/employees/rsos" icon="chart" label="RSOs" count={rsos} description="Field employees" tone="green"/>
   <RoleCard href="/admin/employees/bps" icon="sim" label="BPs" count={bps} description="SIM sales assignments" tone="amber"/>
   <RoleCard href="/admin/users" icon="users" label="IT" count={itUsers} description="System administration" tone="cyan"/>
  </section>

  <section className="ecc-v82-lower">
   <div className="ecc-v82-hierarchy">
    <div className="ecc-v82-section-label">ORGANIZATION STRUCTURE</div>
    <h2>Field reporting hierarchy</h2>
    <div className="ecc-v82-flow">
     <span>Manager</span><b>→</b><span>Supervisor</span><b>→</b><span>RSO</span><b>→</b><span>BP / Retailer</span>
    </div>
    <p>Assignments follow this reporting chain. IT is a system-access role and stays outside the field hierarchy.</p>
   </div>

   <aside className="ecc-v82-access">
    <span className="ecc-v82-section-label">ACCESS MANAGEMENT</span>
    <h2>Control accounts and permissions</h2>
    <p>Manage authorized users and define module-level access from one place.</p>
    <div className="ecc-v82-actions">
     <Link className="ecc-v82-primary" href="/admin/permissions"><Icon name="users"/>Manage Permissions</Link>
     <Link className="ecc-v82-secondary" href="/admin/users">Login Accounts</Link>
    </div>
   </aside>
  </section>
 </main>
}

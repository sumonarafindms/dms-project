import {requireUser} from "../../../lib/auth";
import {prisma} from "../../../lib/prisma";
import UserManager from "./UserManager";

export default async function Users(){await requireUser(["ADMIN","IT"]);const [users,employees,supervisors,bps]=await Promise.all([
 prisma.user.findMany({orderBy:{createdAt:"asc"},include:{employee:true,supervisor:true,bpRetailer:true}}),
 prisma.employee.findMany({where:{active:true},orderBy:{name:"asc"}}),
 prisma.supervisor.findMany({where:{active:true},orderBy:{name:"asc"}}),
 prisma.bpAssignment.findMany({where:{active:true},orderBy:{employee:{name:"asc"}},include:{employee:true,retailer:{include:{bpUser:true}}}}),
]);return <main className="page admin-users-v3"><section className="users-v3-hero"><div><div className="admin-kicker">LOGIN & ACCESS</div><h1>Authorized Users</h1><p>Create and edit mobile/PIN logins, update role mappings and control account status.</p></div><div className="users-v3-hero-count"><span>TOTAL ACCOUNTS</span><strong>{users.length}</strong><small>{users.filter(u=>u.active).length} active</small></div></section><UserManager users={users.map(u=>({id:u.id,displayName:u.displayName,mobileNumber:u.mobileNumber,role:u.role,active:u.active,employeeId:u.employeeId,supervisorId:u.supervisorId,bpRetailerId:u.bpRetailerId,link:u.employee?.name||u.supervisor?.name||(u.bpRetailer?`${u.bpRetailer.retailerCode} · ${u.bpRetailer.retailerName||"BP"}`:"")}))} employees={employees.map(e=>({id:e.id,name:e.name,meta:e.rsoMsisdn}))} supervisors={supervisors.map(s=>({id:s.id,name:s.name}))} bps={bps.map(a=>({id:a.retailerId,name:`${a.retailer.retailerCode} · ${a.retailer.retailerName||"BP"}`,meta:`Under ${a.employee.name}`}))}/></main>}

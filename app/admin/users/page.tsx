import {requireUser} from "../../../lib/auth";
import {prisma} from "../../../lib/prisma";
import UserManager from "./UserManager";
import {PageHead} from "../../components/RoleUI";
export default async function Users(){await requireUser(["ADMIN"]);const [users,employees,supervisors,bps]=await Promise.all([
 prisma.user.findMany({orderBy:{createdAt:"asc"},include:{employee:true,supervisor:true,bpRetailer:true}}),
 prisma.employee.findMany({where:{active:true},orderBy:{name:"asc"}}),
 prisma.supervisor.findMany({where:{active:true},orderBy:{name:"asc"}}),
 prisma.bpAssignment.findMany({where:{active:true},orderBy:{employee:{name:"asc"}},include:{employee:true,retailer:{include:{bpUser:true}}}}),
]);return <main className="page"><PageHead eyebrow="Admin" title="Users & Access" subtitle="Create role-based mobile logins and control who can access the DMS."/><UserManager users={users.map(u=>({id:u.id,displayName:u.displayName,mobileNumber:u.mobileNumber,role:u.role,active:u.active,link:u.employee?.name||u.supervisor?.name||(u.bpRetailer?`${u.bpRetailer.retailerCode} · ${u.bpRetailer.retailerName||"BP"}`:"")}))} employees={employees.map(e=>({id:e.id,name:e.name,meta:e.rsoMsisdn}))} supervisors={supervisors.map(s=>({id:s.id,name:s.name}))} bps={bps.filter(a=>!a.retailer.bpUser).map(a=>({id:a.retailerId,name:`${a.retailer.retailerCode} · ${a.retailer.retailerName||"BP"}`,meta:`Under ${a.employee.name}`}))}/></main>}

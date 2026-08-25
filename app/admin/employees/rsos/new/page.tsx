import {requireUser} from "../../../../../lib/auth";
import {prisma} from "../../../../../lib/prisma";
import AdminEmployeeForm from "../../../../components/AdminEmployeeForm";
export default async function Page(){await requireUser(["ADMIN"]);const supervisors=await prisma.supervisor.findMany({where:{active:true},orderBy:{name:"asc"}});return <AdminEmployeeForm role="rsos" supervisors={supervisors.map(x=>({id:x.id,name:x.name}))}/>}
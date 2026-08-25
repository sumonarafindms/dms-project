import {prisma} from "./prisma";
export async function managerScope(managerId:string){
 const links=await prisma.managerSupervisor.findMany({where:{managerId,supervisor:{active:true}},select:{supervisorId:true}});
 const supervisorIds=links.map(x=>x.supervisorId);
 const employees=supervisorIds.length?await prisma.employee.findMany({where:{supervisorId:{in:supervisorIds},active:true},select:{id:true}}):[];
 return {supervisorIds,employeeIds:employees.map(x=>x.id)};
}

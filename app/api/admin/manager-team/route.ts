import {NextResponse} from "next/server";
import {prisma} from "../../../../lib/prisma";
import {getCurrentUser} from "../../../../lib/auth";
export async function PATCH(req:Request){
 const me=await getCurrentUser();if(!me||me.role!=="ADMIN")return NextResponse.json({error:"Unauthorized"},{status:401});
 const b=await req.json(),managerId=String(b.managerId||""),supervisorIds=Array.isArray(b.supervisorIds)?b.supervisorIds.map(String):[];
 const manager=await prisma.user.findUnique({where:{id:managerId}});if(!manager||manager.role!=="MANAGER")return NextResponse.json({error:"Manager not found"},{status:404});
 await prisma.$transaction(async tx=>{
  await tx.managerSupervisor.deleteMany({where:{managerId,supervisorId:{notIn:supervisorIds}}});
  for(const supervisorId of supervisorIds){
   await tx.managerSupervisor.upsert({
    where:{supervisorId},
    update:{managerId},
    create:{managerId,supervisorId},
   });
  }
 });
 return NextResponse.json({ok:true,count:supervisorIds.length});
}

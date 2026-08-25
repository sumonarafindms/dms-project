import {NextResponse} from "next/server";
import {prisma} from "../../../../lib/prisma";
import {getCurrentUser} from "../../../../lib/auth";
export async function PATCH(req:Request){
 const me=await getCurrentUser();if(!me||me.role!=="ADMIN")return NextResponse.json({error:"Unauthorized"},{status:401});
 const b=await req.json(),supervisorId=String(b.supervisorId||""),rsoIds=Array.isArray(b.rsoIds)?b.rsoIds.map(String):[];
 const sup=await prisma.supervisor.findUnique({where:{id:supervisorId}});if(!sup)return NextResponse.json({error:"Supervisor not found"},{status:404});
 await prisma.$transaction([
  prisma.employee.updateMany({where:{supervisorId,id:{notIn:rsoIds}},data:{supervisorId:null}}),
  prisma.employee.updateMany({where:{id:{in:rsoIds}},data:{supervisorId}}),
 ]);
 return NextResponse.json({ok:true,count:rsoIds.length});
}
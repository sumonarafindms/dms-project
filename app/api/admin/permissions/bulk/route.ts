import {NextResponse} from "next/server";
import {prisma} from "../../../../../lib/prisma";
import {getCurrentUser} from "../../../../../lib/auth";
import {permissionModules,presetPermissions} from "../../../../../lib/permissions";
import {audit} from "../../../../../lib/audit";

async function admin(){const u=await getCurrentUser();return u?.role==="ADMIN"?u:null}

async function saveRows(userId:string,rows:any[]){
 const allowed=new Set(permissionModules.map(m=>m.key));
 await prisma.$transaction(async tx=>{
  for(const row of rows){
   const module=String(row.module||"");if(!allowed.has(module as any))continue;
   const canView=Boolean(row.view),canAdd=canView&&Boolean(row.add),canEdit=canView&&Boolean(row.edit),canUpdate=canView&&Boolean(row.update);
   await tx.userPermission.upsert({
    where:{userId_module:{userId,module}},
    update:{canView,canAdd,canEdit,canUpdate},
    create:{userId,module,canView,canAdd,canEdit,canUpdate},
   });
  }
 });
}

export async function POST(req:Request){
 const me=await admin();if(!me)return NextResponse.json({error:"Unauthorized"},{status:401});
 const b=await req.json(),mode=String(b.mode||"");
 if(mode==="preset"){
  const userIds=Array.isArray(b.userIds)?b.userIds.map(String):[],preset=String(b.preset||"");
  const users=await prisma.user.findMany({where:{id:{in:userIds},role:{not:"ADMIN"}},select:{id:true,role:true}});
  if(!users.length)return NextResponse.json({error:"Select at least one non-Admin user."},{status:400});
  for(const user of users){
   if(preset==="ROLE_DEFAULT"){await prisma.userPermission.deleteMany({where:{userId:user.id}});continue}
   await saveRows(user.id,presetPermissions(user.role,preset));
  }
  await audit(me,"BULK_PERMISSION_PRESET","permissions",{detail:`Applied ${preset} to ${users.length} user(s)`,metadata:{preset,count:users.length}});
  return NextResponse.json({ok:true,updated:users.length});
 }
 if(mode==="copy"){
  const sourceId=String(b.sourceId||""),targetIds=Array.isArray(b.targetIds)?b.targetIds.map(String):[];
  const [source,targets]=await Promise.all([
   prisma.user.findUnique({where:{id:sourceId},include:{permissions:true}}),
   prisma.user.findMany({where:{id:{in:targetIds},role:{not:"ADMIN"}},select:{id:true,role:true}})
  ]);
  if(!source||source.role==="ADMIN")return NextResponse.json({error:"Source user not found."},{status:404});
  if(!targets.length)return NextResponse.json({error:"Select at least one target user."},{status:400});
  const sourceRows=source.permissions.length
   ? source.permissions.map(p=>({module:p.module,view:p.canView,add:p.canAdd,edit:p.canEdit,update:p.canUpdate}))
   : presetPermissions(source.role,"ROLE_DEFAULT");
  for(const target of targets){await saveRows(target.id,sourceRows)}
  await audit(me,"COPY_PERMISSIONS","permissions",{targetType:"User",targetId:source.id,targetName:source.displayName,detail:`Copied permissions to ${targets.length} user(s)`,metadata:{count:targets.length}});
  return NextResponse.json({ok:true,updated:targets.length});
 }
 return NextResponse.json({error:"Unsupported bulk permission action."},{status:400});
}

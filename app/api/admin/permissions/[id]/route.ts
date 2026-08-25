import {NextResponse} from "next/server";
import {prisma} from "../../../../../lib/prisma";
import {getCurrentUser} from "../../../../../lib/auth";
import {permissionModules,roleDefaults} from "../../../../../lib/permissions";
import {audit} from "../../../../../lib/audit";

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
 const me=await getCurrentUser();if(!me||!["ADMIN","IT"].includes(me.role))return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id}=await params,user=await prisma.user.findUnique({where:{id},include:{permissions:true}});
 if(!user)return NextResponse.json({error:"User not found"},{status:404});
 const custom=new Map(user.permissions.map(p=>[p.module,p]));
 return NextResponse.json({user:{id:user.id,name:user.displayName,role:user.role,mobile:user.mobileNumber},modules:permissionModules.map(m=>{const p=custom.get(m.key),d=roleDefaults[user.role]?.[m.key]||{view:false,add:false,edit:false,update:false};return {...m,view:p?.canView??d.view,add:p?.canAdd??d.add,edit:p?.canEdit??d.edit,update:p?.canUpdate??d.update}})});
}
export async function PUT(req:Request,{params}:{params:Promise<{id:string}>}){
 const me=await getCurrentUser();if(!me||!["ADMIN","IT"].includes(me.role))return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id}=await params,user=await prisma.user.findUnique({where:{id}});if(!user)return NextResponse.json({error:"User not found"},{status:404});
 if(["ADMIN","IT"].includes(user.role)||user.role==="IT")return NextResponse.json({error:"Admin and IT always have full access."},{status:400});
 const body=await req.json(),rows=Array.isArray(body.permissions)?body.permissions:[];
 const allowed=new Set(permissionModules.map(m=>m.key));
 await prisma.$transaction(async tx=>{
  for(const row of rows){
   const module=String(row.module||"");if(!allowed.has(module as any))continue;
   const canView=Boolean(row.view),canAdd=canView&&Boolean(row.add),canEdit=canView&&Boolean(row.edit),canUpdate=canView&&Boolean(row.update);
   await tx.userPermission.upsert({where:{userId_module:{userId:id,module}},update:{canView,canAdd,canEdit,canUpdate},create:{userId:id,module,canView,canAdd,canEdit,canUpdate}});
  }
 });
 await audit(me,"UPDATE_PERMISSIONS","permissions",{targetType:"User",targetId:user.id,targetName:user.displayName,detail:"Saved custom module permissions"});
 return NextResponse.json({ok:true});
}
export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){
 const me=await getCurrentUser();if(!me||!["ADMIN","IT"].includes(me.role))return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id}=await params;const target=await prisma.user.findUnique({where:{id},select:{displayName:true}});
 await prisma.userPermission.deleteMany({where:{userId:id}});
 await audit(me,"RESET_PERMISSIONS","permissions",{targetType:"User",targetId:id,targetName:target?.displayName||"User",detail:"Reset to role defaults"});
 return NextResponse.json({ok:true});
}

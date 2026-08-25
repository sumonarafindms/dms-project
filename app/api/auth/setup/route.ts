import {NextResponse} from "next/server";
import {Prisma} from "@prisma/client";
import {prisma} from "../../../../lib/prisma";
import {createSession,hashCredential} from "../../../../lib/auth";
export async function POST(req:Request){
 try{
  const b=await req.json(),displayName=String(b.displayName||"").trim(),username=String(b.username||"").trim(),password=String(b.password||"");
  if(!displayName||!username||password.length<6)return NextResponse.json({error:"Name, username and a password of at least 6 characters are required."},{status:400});
  const hash=await hashCredential(password);
  const user=await prisma.$transaction(async tx=>{
   const existing=await tx.user.count();if(existing>0)throw new Error("SETUP_COMPLETE");
   return tx.user.create({data:{displayName,username,credentialHash:hash,role:"ADMIN"}});
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  await createSession(user.id);
  return NextResponse.json({ok:true,redirect:"/dashboard"});
 }catch(e:any){
  if(e?.message==="SETUP_COMPLETE"||e?.code==="P2034")return NextResponse.json({error:"System setup is already complete."},{status:409});
  if(e?.code==="P2002")return NextResponse.json({error:"System setup is already complete."},{status:409});
  console.error(e);return NextResponse.json({error:"Could not complete system setup."},{status:500});
 }
}

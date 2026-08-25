import {NextResponse} from "next/server";
import {prisma} from "../../../../lib/prisma";
import {createSession,hashCredential} from "../../../../lib/auth";
export async function POST(req:Request){
 const existing=await prisma.user.count(); if(existing>0)return NextResponse.json({error:"System setup is already complete."},{status:409});
 const b=await req.json(); const displayName=String(b.displayName||"").trim(),username=String(b.username||"").trim(),password=String(b.password||"");
 if(!displayName||!username||password.length<6)return NextResponse.json({error:"Name, username and a password of at least 6 characters are required."},{status:400});
 const user=await prisma.user.create({data:{displayName,username,credentialHash:await hashCredential(password),role:"ADMIN"}}); await createSession(user.id);
 return NextResponse.json({ok:true,redirect:"/dashboard"});
}

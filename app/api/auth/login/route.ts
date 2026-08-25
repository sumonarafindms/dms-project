import {NextResponse} from "next/server";
import {prisma} from "../../../../lib/prisma";
import {createSession,homeForRole,verifyCredential} from "../../../../lib/auth";
import {audit} from "../../../../lib/audit";
export async function POST(req:Request){
  try{
    const body=await req.json();
    const identifier=String(body.identifier||"").trim(); const credential=String(body.credential||""); const admin=!!body.admin;
    if(!identifier||!credential) return NextResponse.json({error:"Mobile/username and PIN/password are required."},{status:400});
    const user=await prisma.user.findFirst({where:admin?{OR:[{username:identifier},{mobileNumber:identifier}]}:{mobileNumber:identifier}});
    if(!user||!user.active||(admin&&user.role!=="ADMIN")||!(await verifyCredential(credential,user.credentialHash))) return NextResponse.json({error:"Invalid login credentials."},{status:401});
    await createSession(user.id);
    await audit(user,"LOGIN","auth",{targetType:"User",targetId:user.id,targetName:user.displayName,detail:"Signed in successfully"});
    return NextResponse.json({ok:true,redirect:homeForRole(user.role)});
  }catch(e){console.error(e);return NextResponse.json({error:"Unable to sign in right now."},{status:500})}
}

import {NextResponse} from "next/server";
import {prisma} from "../../../../lib/prisma";
import {getCurrentUser,hashCredential} from "../../../../lib/auth";
const roles=["MANAGER","SUPERVISOR","ACCOUNTS","RSO","BP"] as const;
export async function POST(req:Request){
 const me=await getCurrentUser(); if(!me||me.role!=="ADMIN")return NextResponse.json({error:"Unauthorized"},{status:401});
 const b=await req.json(); const role=String(b.role||"") as typeof roles[number];
 if(!roles.includes(role))return NextResponse.json({error:"Invalid role"},{status:400});
 const displayName=String(b.displayName||"").trim(),mobileNumber=String(b.mobileNumber||"").trim(),pin=String(b.pin||"").trim();
 if(!displayName||!mobileNumber||pin.length<4)return NextResponse.json({error:"Name, mobile number and at least 4-digit PIN are required."},{status:400});
 const employeeId=b.employeeId?String(b.employeeId):null, supervisorId=b.supervisorId?String(b.supervisorId):null, bpRetailerId=b.bpRetailerId?String(b.bpRetailerId):null;
 if(role==="RSO"&&!employeeId)return NextResponse.json({error:"Select the RSO employee for this login."},{status:400});
 if(role==="SUPERVISOR"&&!supervisorId)return NextResponse.json({error:"Select the supervisor for this login."},{status:400});
 if(role==="BP"&&!bpRetailerId)return NextResponse.json({error:"Select an active BP retailer for this login."},{status:400});
 if(role==="BP"){const activeBpRetailerId=bpRetailerId as string;const assignment=await prisma.bpAssignment.findFirst({where:{retailerId:activeBpRetailerId,active:true}});if(!assignment)return NextResponse.json({error:"That retailer is not currently assigned as a BP."},{status:400})}
 try{const user=await prisma.user.create({data:{displayName,mobileNumber,credentialHash:await hashCredential(pin),role,employeeId:role==="RSO"?employeeId:null,supervisorId:role==="SUPERVISOR"?supervisorId:null,bpRetailerId:role==="BP"?bpRetailerId:null}});return NextResponse.json({ok:true,id:user.id})}
 catch(e:any){return NextResponse.json({error:e?.code==="P2002"?"This mobile number or role mapping is already assigned.":"Could not create user."},{status:400})}
}
export async function PATCH(req:Request){
 const me=await getCurrentUser(); if(!me||me.role!=="ADMIN")return NextResponse.json({error:"Unauthorized"},{status:401});
 const b=await req.json(); const id=String(b.id||""); if(!id)return NextResponse.json({error:"User is required"},{status:400});
 const data:any={}; if(typeof b.active==="boolean")data.active=b.active; if(b.pin&&String(b.pin).length>=4)data.credentialHash=await hashCredential(String(b.pin));
 await prisma.user.update({where:{id},data}); return NextResponse.json({ok:true});
}

import {NextResponse} from "next/server";
import {prisma} from "../../../../../lib/prisma";
import {getCurrentUser,hashCredential} from "../../../../../lib/auth";
import {phoneKey} from "../../../../../lib/phone";
import {dhakaTodayYmd} from "../../../../../lib/business-time";

const clean=(v:unknown)=>String(v??"").trim();
const nullable=(v:unknown)=>{const x=clean(v);return x||null};
function day(v:unknown){const s=clean(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;const d=new Date(`${s}T00:00:00.000Z`);return Number.isNaN(d.getTime())?null:d}
async function admin(){const u=await getCurrentUser();return u&&["ADMIN","IT"].includes(u.role)?u:null}

export async function POST(req:Request,{params}:{params:Promise<{role:string}>}){
 if(!(await admin()))return NextResponse.json({error:"Unauthorized"},{status:401});
 const {role}=await params,b=await req.json(),r=role.toLowerCase();
 try{
  if(r==="managers"){
   const name=clean(b.name),mobile=clean(b.mobile),pin=clean(b.pin);
   if(!name||!mobile||pin.length<4)return NextResponse.json({error:"Name, mobile and at least 4-digit PIN are required."},{status:400});
   const user=await prisma.user.create({data:{displayName:name,mobileNumber:mobile,credentialHash:await hashCredential(pin),role:"MANAGER",active:b.active!==false}});
   return NextResponse.json({ok:true,id:user.id});
  }
  if(r==="supervisors"){
   const name=clean(b.name),mobile=clean(b.mobile),pin=clean(b.pin);
   if(!name)return NextResponse.json({error:"Supervisor name is required."},{status:400});
   if((mobile&&!pin)||(pin&&pin.length<4))return NextResponse.json({error:"Provide a mobile number and at least 4-digit PIN together."},{status:400});
   const result=await prisma.$transaction(async tx=>{
    const supervisor=await tx.supervisor.create({data:{name,active:b.active!==false}});
    if(mobile)await tx.user.create({data:{displayName:name,mobileNumber:mobile,credentialHash:await hashCredential(pin),role:"SUPERVISOR",supervisorId:supervisor.id,active:b.active!==false}});
    return supervisor;
   });
   return NextResponse.json({ok:true,id:result.id});
  }
  if(r==="rsos"){
   const name=clean(b.name),rsoMsisdn=clean(b.rsoMsisdn),employeeCode=nullable(b.employeeCode),supervisorId=nullable(b.supervisorId),mobile=clean(b.mobile),pin=clean(b.pin);
   if(!name||!rsoMsisdn)return NextResponse.json({error:"RSO name and RSO MSISDN are required."},{status:400});
   const existingPhones=await prisma.employee.findMany({select:{id:true,rsoMsisdn:true}});if(existingPhones.some(x=>phoneKey(x.rsoMsisdn)===phoneKey(rsoMsisdn)))return NextResponse.json({error:"This RSO MSISDN is already assigned."},{status:400});
   if((mobile&&!pin)||(pin&&pin.length<4))return NextResponse.json({error:"Provide a mobile number and at least 4-digit PIN together."},{status:400});
   const result=await prisma.$transaction(async tx=>{
    const employee=await tx.employee.create({data:{name,rsoMsisdn,employeeCode,supervisorId,active:b.active!==false}});
    if(mobile)await tx.user.create({data:{displayName:name,mobileNumber:mobile,credentialHash:await hashCredential(pin),role:"RSO",employeeId:employee.id,active:b.active!==false}});
    return employee;
   });
   return NextResponse.json({ok:true,id:result.id});
  }
  if(r==="bps"){
   const employeeId=clean(b.employeeId),retailerId=clean(b.retailerId),startDate=day(b.startDate),gaTarget=Math.max(0,Math.trunc(Number(b.gaTarget)||0)),name=clean(b.name),mobile=clean(b.mobile),pin=clean(b.pin);
   if(!employeeId||!retailerId||!startDate)return NextResponse.json({error:"RSO, retailer code and effective date are required."},{status:400});
   const today=new Date(`${dhakaTodayYmd()}T00:00:00.000Z`);
   if(startDate>today)return NextResponse.json({error:"Future BP assignment dates are not supported yet. Use today or an earlier valid date."},{status:400});
   if((mobile&&!pin)||(pin&&pin.length<4))return NextResponse.json({error:"Provide a mobile number and at least 4-digit PIN together."},{status:400});
   const retailer=await prisma.retailer.findUnique({where:{id:retailerId},select:{id:true,retailerCode:true,retailerName:true,employeeId:true,active:true}});
   if(!retailer?.active||retailer.employeeId!==employeeId)return NextResponse.json({error:"Selected retailer must be active and belong to the selected RSO."},{status:400});
   const result=await prisma.$transaction(async tx=>{
    const other=await tx.bpAssignment.findFirst({where:{retailerId,active:true}});
    if(other)throw new Error("This retailer is already an active BP.");
    const current=await tx.bpAssignment.findFirst({where:{employeeId,active:true}});
    let transferableUser:null|{id:string}=null;
    if(current){
      if(startDate<=current.startDate)throw new Error("New BP effective date must be after the current BP assignment start date.");
      transferableUser=await tx.user.findFirst({where:{role:"BP",bpRetailerId:current.retailerId,active:true},select:{id:true}});
      await tx.bpAssignment.update({where:{id:current.id},data:{active:false,endDate:new Date(startDate.getTime()-86400000)}});
    }
    const assignment=await tx.bpAssignment.create({data:{employeeId,retailerId,startDate,gaTarget,active:true}});
    if(mobile)await tx.user.create({data:{displayName:name||retailer.retailerName||retailer.retailerCode,mobileNumber:mobile,credentialHash:await hashCredential(pin),role:"BP",bpRetailerId:retailerId,active:b.active!==false}});
    else if(transferableUser)await tx.user.update({where:{id:transferableUser.id},data:{bpRetailerId:retailerId,displayName:name||retailer.retailerName||retailer.retailerCode}});
    return assignment;
   });
   return NextResponse.json({ok:true,id:result.id});
  }
  return NextResponse.json({error:"Unsupported employee role"},{status:404});
 }catch(e:any){
  return NextResponse.json({error:e?.code==="P2002"?"A unique code, mobile number, name, or mapping is already in use.":e?.message||"Could not create employee."},{status:400});
 }
}

export async function PATCH(req:Request,{params}:{params:Promise<{role:string}>}){
 if(!(await admin()))return NextResponse.json({error:"Unauthorized"},{status:401});
 const {role}=await params,b=await req.json(),r=role.toLowerCase(),id=clean(b.id);
 if(!id)return NextResponse.json({error:"Record id is required."},{status:400});
 try{
  if(r==="managers"){
   const user=await prisma.user.findUnique({where:{id}});if(!user||user.role!=="MANAGER")return NextResponse.json({error:"Manager not found."},{status:404});
   const data:any={displayName:clean(b.name)||user.displayName,active:b.active!==false};
   if(clean(b.mobile))data.mobileNumber=clean(b.mobile);
   if(clean(b.pin)){if(clean(b.pin).length<4)return NextResponse.json({error:"PIN must contain at least 4 characters."},{status:400});data.credentialHash=await hashCredential(clean(b.pin))}
   await prisma.user.update({where:{id},data});if(clean(b.pin)||b.active===false)await prisma.session.deleteMany({where:{userId:id}});return NextResponse.json({ok:true});
  }
  if(r==="supervisors"){
   const supervisor=await prisma.supervisor.findUnique({where:{id},include:{user:true}});if(!supervisor)return NextResponse.json({error:"Supervisor not found."},{status:404});
   const name=clean(b.name)||supervisor.name,active=b.active!==false,mobile=clean(b.mobile),pin=clean(b.pin);
   if(!active){const activeRsos=await prisma.employee.count({where:{supervisorId:id,active:true}});if(activeRsos)return NextResponse.json({error:`Reassign or deactivate ${activeRsos} active RSO(s) before deactivating this Supervisor.`},{status:400})}
   await prisma.$transaction(async tx=>{
    await tx.supervisor.update({where:{id},data:{name,active}});
    if(supervisor.user){
      const udata:any={displayName:name,active};if(mobile)udata.mobileNumber=mobile;if(pin){if(pin.length<4)throw new Error("PIN must contain at least 4 characters.");udata.credentialHash=await hashCredential(pin)}await tx.user.update({where:{id:supervisor.user.id},data:udata});if(pin||!active)await tx.session.deleteMany({where:{userId:supervisor.user.id}});
    }else if(mobile){if(pin.length<4)throw new Error("A PIN of at least 4 characters is required to create the login.");await tx.user.create({data:{displayName:name,mobileNumber:mobile,credentialHash:await hashCredential(pin),role:"SUPERVISOR",supervisorId:id,active}})}
   });return NextResponse.json({ok:true});
  }
  if(r==="rsos"){
   const employee=await prisma.employee.findUnique({where:{id},include:{user:true}});if(!employee)return NextResponse.json({error:"RSO not found."},{status:404});
   const name=clean(b.name)||employee.name,rsoMsisdn=clean(b.rsoMsisdn)||employee.rsoMsisdn,employeeCode=nullable(b.employeeCode),supervisorId=nullable(b.supervisorId),active=b.active!==false,mobile=clean(b.mobile),pin=clean(b.pin);
   const phoneConflicts=await prisma.employee.findMany({where:{id:{not:id}},select:{rsoMsisdn:true}});if(phoneConflicts.some(x=>phoneKey(x.rsoMsisdn)===phoneKey(rsoMsisdn)))return NextResponse.json({error:"This RSO MSISDN is already assigned to another employee."},{status:400});
   if(!active){const [activeRetailers,activeBps]=await Promise.all([prisma.retailer.count({where:{employeeId:id,active:true}}),prisma.bpAssignment.count({where:{employeeId:id,active:true}})]);if(activeRetailers||activeBps)return NextResponse.json({error:`Reassign ${activeRetailers} active retailer(s) and ${activeBps} active BP assignment(s) before deactivating this RSO.`},{status:400})}
   await prisma.$transaction(async tx=>{
    await tx.employee.update({where:{id},data:{name,rsoMsisdn,employeeCode,supervisorId,active}});
    if(employee.user){
      const udata:any={displayName:name,active};if(mobile)udata.mobileNumber=mobile;if(pin){if(pin.length<4)throw new Error("PIN must contain at least 4 characters.");udata.credentialHash=await hashCredential(pin)}await tx.user.update({where:{id:employee.user.id},data:udata});if(pin||!active)await tx.session.deleteMany({where:{userId:employee.user.id}});
    }else if(mobile){if(pin.length<4)throw new Error("A PIN of at least 4 characters is required to create the login.");await tx.user.create({data:{displayName:name,mobileNumber:mobile,credentialHash:await hashCredential(pin),role:"RSO",employeeId:id,active}})}
   });return NextResponse.json({ok:true});
  }
  if(r==="bps"){
   const a=await prisma.bpAssignment.findUnique({where:{id},include:{retailer:{include:{bpUser:true}}}});if(!a)return NextResponse.json({error:"BP assignment not found."},{status:404});
   const gaTarget=Math.max(0,Math.trunc(Number(b.gaTarget)||0)),active=b.active!==false,mobile=clean(b.mobile),pin=clean(b.pin),name=clean(b.name)||a.retailer.retailerName||a.retailer.retailerCode;
   await prisma.$transaction(async tx=>{
    const endDate=!active&&a.active?new Date(`${dhakaTodayYmd()}T00:00:00.000Z`):undefined;
    await tx.bpAssignment.update({where:{id},data:{gaTarget,active,...(endDate?{endDate}: {})}});
    if(a.retailer.bpUser){
      const udata:any={displayName:name,active};if(mobile)udata.mobileNumber=mobile;if(pin){if(pin.length<4)throw new Error("PIN must contain at least 4 characters.");udata.credentialHash=await hashCredential(pin)}await tx.user.update({where:{id:a.retailer.bpUser.id},data:udata});if(pin||!active)await tx.session.deleteMany({where:{userId:a.retailer.bpUser.id}});
    }else if(mobile&&active){if(pin.length<4)throw new Error("A PIN of at least 4 characters is required to create the login.");await tx.user.create({data:{displayName:name,mobileNumber:mobile,credentialHash:await hashCredential(pin),role:"BP",bpRetailerId:a.retailerId,active:true}})}
   });return NextResponse.json({ok:true});
  }
  return NextResponse.json({error:"Unsupported employee role"},{status:404});
 }catch(e:any){
  return NextResponse.json({error:e?.code==="P2002"?"A unique code, mobile number, name, or mapping is already in use.":e?.message||"Could not update employee."},{status:400});
 }
}

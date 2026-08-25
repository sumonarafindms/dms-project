import {NextResponse} from "next/server";
import * as XLSX from "xlsx";
import {apiUser,apiPermission} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {monthBounds} from "@/lib/month";
import {audit} from "@/lib/audit";

const text=(v:unknown)=>String(v??"").trim();
const num=(v:unknown)=>Math.max(0,Number(v)||0);
const int=(v:unknown)=>Math.max(0,Math.trunc(Number(v)||0));
const head=(v:unknown)=>text(v).toUpperCase().replace(/\s+/g,"_");

export const runtime="nodejs";

export async function POST(req:Request){
 const actor=await apiUser(["ADMIN","ACCOUNTS"]);if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
 if(!(await apiPermission("targets","update")))return NextResponse.json({error:"You do not have permission to update targets."},{status:403});
 try{
  const form=await req.formData(),file=form.get("file"),monthText=text(form.get("month"));
  if(!(file instanceof File))return NextResponse.json({error:"Target Excel file is required."},{status:400});
  if(!/^\d{4}-\d{2}$/.test(monthText))return NextResponse.json({error:"Select the target month first."},{status:400});
  const month=monthBounds(`${monthText}-01T00:00:00.000Z`).start;
  const wb=XLSX.read(Buffer.from(await file.arrayBuffer()),{type:"buffer",cellDates:true});
  const ws=wb.Sheets[wb.SheetNames[0]];
  const matrix=XLSX.utils.sheet_to_json<any[]>(ws,{header:1,raw:false,defval:""});
  if(!matrix.length)return NextResponse.json({error:"Target file is empty."},{status:400});
  const headers=(matrix[0]||[]).map(head),rows=matrix.slice(1).filter(r=>r.some((v:any)=>text(v)));
  const idx=(name:string)=>headers.indexOf(name);
  const iRso=idx("RSO_NUMBER"),iBp=idx("BP_CODE"),iType=idx("TARGET_TYPE"),iTarget=idx("TARGET");
  if(iRso<0&&iBp<0)return NextResponse.json({error:"Target file needs RSO_NUMBER and/or BP_CODE."},{status:400});
  if(iType<0||iTarget<0)return NextResponse.json({error:"Target file needs TARGET_TYPE and TARGET columns."},{status:400});
  let updated=0,failed=0;const errors:string[]=[];
  for(let n=0;n<rows.length;n++){
   const row=rows[n],rso=iRso>=0?text(row[iRso]):"",bp=iBp>=0?text(row[iBp]):"",type=text(row[iType]).toUpperCase(),value=num(row[iTarget]);
   try{
    if(bp){
      if(!["BP_GA","GA"].includes(type))throw new Error("BP_CODE supports TARGET_TYPE BP_GA or GA.");
      const retailer=await prisma.retailer.findUnique({where:{retailerCode:bp},select:{id:true}});
      if(!retailer)throw new Error(`BP code ${bp} not found.`);
      const {start,end}=monthBounds(`${monthText}-01`);
      const assignment=await prisma.bpAssignment.findFirst({where:{retailerId:retailer.id,startDate:{lt:end},OR:[{endDate:null},{endDate:{gte:start}}]},orderBy:{startDate:"desc"}});
      if(!assignment)throw new Error(`No BP assignment found for ${bp} in ${monthText}.`);
      await prisma.bpMonthlyTarget.upsert({where:{assignmentId_month:{assignmentId:assignment.id,month}},update:{gaTarget:int(value)},create:{assignmentId:assignment.id,month,gaTarget:int(value)}});
      updated++;continue;
    }
    if(!rso)throw new Error("RSO_NUMBER or BP_CODE is required.");
    const employee=await prisma.employee.findFirst({where:{OR:[{rsoMsisdn:rso},{employeeCode:rso}]},select:{id:true}});
    if(!employee)throw new Error(`RSO ${rso} not found.`);
    const existing=await prisma.monthlyTarget.findUnique({where:{employeeId_month:{employeeId:employee.id,month}}});
    const current={
      gaTarget:existing?.gaTarget||0,c2cTarget:Number(existing?.c2cTarget||0),scTarget:Number(existing?.scTarget||0),
      totalRechargeTarget:Number(existing?.totalRechargeTarget||0),ssoTarget:existing?.ssoTarget||0,lsoTarget:existing?.lsoTarget||0
    };
    if(type==="GA")current.gaTarget=int(value);
    else if(type==="C2C")current.c2cTarget=value;
    else if(type==="SC")current.scTarget=value;
    else if(["TOTAL_RECHARGE","RECHARGE"].includes(type))current.totalRechargeTarget=value;
    else if(type==="SSO")current.ssoTarget=int(value);
    else if(type==="LSO")current.lsoTarget=int(value);
    else throw new Error(`Unsupported TARGET_TYPE ${type}.`);
    if(!current.totalRechargeTarget)current.totalRechargeTarget=current.c2cTarget+current.scTarget;
    await prisma.monthlyTarget.upsert({where:{employeeId_month:{employeeId:employee.id,month}},update:current,create:{employeeId:employee.id,month,...current}});
    updated++;
   }catch(e){failed++;if(errors.length<20)errors.push(`Row ${n+2}: ${e instanceof Error?e.message:"Invalid row"}`)}
  }
  await audit(actor,"IMPORT_TARGETS","targets",{targetType:"File",targetName:file.name,detail:`Imported ${updated} target row(s) for ${monthText}`,metadata:{month:monthText,updated,failed}});
  return NextResponse.json({ok:true,month:monthText,totalRows:rows.length,updated,failed,errors});
 }catch(e){console.error(e);return NextResponse.json({error:e instanceof Error?e.message:"Target import failed"},{status:500})}
}
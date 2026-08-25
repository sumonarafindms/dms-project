import {NextResponse} from "next/server";
import {prisma} from "../../../lib/prisma";
import {apiError} from "../../../lib/http-errors";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(){
 const started=Date.now();
 try{
  await prisma.$queryRaw`SELECT 1`;
  return NextResponse.json({ok:true,database:"connected",latencyMs:Date.now()-started,timestamp:new Date().toISOString()},{headers:{"cache-control":"no-store"}});
 }catch(error){
  console.error("healthcheck database failure",error);
  const e=apiError(error,"Health check failed.");
  return NextResponse.json({ok:false,database:"unavailable",latencyMs:Date.now()-started,timestamp:new Date().toISOString(),error:e.error},{status:e.status,headers:{"cache-control":"no-store"}});
 }
}

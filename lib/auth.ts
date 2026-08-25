import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {randomBytes, scrypt as scryptCb, timingSafeEqual, createHash} from "crypto";
import {prisma} from "./prisma";
import {hasPermission} from "./permissions";
import type {PermissionAction,PermissionModule} from "./permissions";

const scrypt=(value:string,salt:string)=>new Promise<Buffer>((resolve,reject)=>scryptCb(value,salt,64,(err,key)=>err?reject(err):resolve(key as Buffer)));
export const SESSION_COOKIE="dms_session";
const SESSION_DAYS=14;
const sessionKey=(token:string)=>createHash("sha256").update(token).digest("hex");

export async function hashCredential(value:string){
  const salt=randomBytes(16).toString("hex");
  const derived=await scrypt(value,salt);
  return `${salt}:${derived.toString("hex")}`;
}
export async function verifyCredential(value:string,stored:string){
  const [salt,keyHex]=stored.split(":");
  if(!salt||!keyHex) return false;
  const derived=await scrypt(value,salt);
  const key=Buffer.from(keyHex,"hex");
  return key.length===derived.length&&timingSafeEqual(key,derived);
}
export async function createSession(userId:string){
  const token=randomBytes(32).toString("hex");
  const expiresAt=new Date(Date.now()+SESSION_DAYS*86400000);
  await prisma.session.deleteMany({where:{expiresAt:{lte:new Date()}}}).catch(()=>{});
  await prisma.session.create({data:{token:sessionKey(token),userId,expiresAt}});
  const store=await cookies();
  store.set(SESSION_COOKIE,token,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",expires:expiresAt});
}
export async function destroySession(){
  const store=await cookies(); const token=store.get(SESSION_COOKIE)?.value;
  if(token) await prisma.session.deleteMany({where:{token:sessionKey(token)}}).catch(()=>{});
  store.delete(SESSION_COOKIE);
}
export async function getCurrentUser(){
  const store=await cookies(); const token=store.get(SESSION_COOKIE)?.value;
  if(!token) return null;
  const session=await prisma.session.findUnique({where:{token:sessionKey(token)},include:{user:{include:{employee:true,supervisor:true}}}});
  if(!session||session.expiresAt<=new Date()||!session.user.active){
    if(session) await prisma.session.deleteMany({where:{id:session.id}}).catch(()=>{});
    return null;
  }
  return session.user;
}
export async function requireUser(allowed?:string[]){
  const user=await getCurrentUser();
  if(!user) redirect("/login");
  if(allowed&&!allowed.includes(user.role)) redirect(homeForRole(user.role));
  return user;
}
export function homeForRole(role:string){
  return ({ADMIN:"/dashboard",MANAGER:"/manager",SUPERVISOR:"/supervisor",ACCOUNTS:"/accounts",RSO:"/rso",BP:"/bp"} as Record<string,string>)[role]||"/login";
}
export function labelForRole(role:string){return role.charAt(0)+role.slice(1).toLowerCase()}

export async function apiUser(allowed?:string[]){const user=await getCurrentUser();if(!user)return null;if(allowed&&!allowed.includes(user.role))return null;return user}

export async function apiPermission(module:PermissionModule,action:PermissionAction="view"){const user=await getCurrentUser();if(!user)return null;return await hasPermission(user.id,user.role,module,action)?user:null}

export async function requirePagePermission(allowed:string[],module:PermissionModule,action:PermissionAction="view"){
 const user=await requireUser(allowed);
 if(!(await hasPermission(user.id,user.role,module,action))) redirect(homeForRole(user.role));
 return user;
}

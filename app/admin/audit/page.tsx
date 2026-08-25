import Link from "next/link";
import {requireUser} from "../../../lib/auth";
import {prisma} from "../../../lib/prisma";

const fmt=(d:Date)=>new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:true,timeZone:"Asia/Dhaka"}).format(d);
function dhakaDayStartUtc(){const shifted=new Date(Date.now()+6*3600000);return new Date(Date.UTC(shifted.getUTCFullYear(),shifted.getUTCMonth(),shifted.getUTCDate())-6*3600000)}
export default async function Page({searchParams}:{searchParams:Promise<{q?:string;module?:string;action?:string}>}){
 await requireUser(["ADMIN"]);const sp=await searchParams,q=(sp.q||"").trim(),module=(sp.module||"").trim(),action=(sp.action||"").trim();
 const where:any={};
 if(module)where.module=module;if(action)where.action=action;
 if(q)where.OR=[{actorName:{contains:q,mode:"insensitive"}},{targetName:{contains:q,mode:"insensitive"}},{detail:{contains:q,mode:"insensitive"}},{action:{contains:q,mode:"insensitive"}}];
 const [rows,total,today,logins]=await Promise.all([
  prisma.auditLog.findMany({where,orderBy:{createdAt:"desc"},take:250}),
  prisma.auditLog.count(),
  prisma.auditLog.count({where:{createdAt:{gte:dhakaDayStartUtc()}}}),
  prisma.auditLog.count({where:{action:"LOGIN",createdAt:{gte:dhakaDayStartUtc()}}})
 ]);
 const modules=await prisma.auditLog.findMany({distinct:["module"],select:{module:true},orderBy:{module:"asc"}});
 const actions=await prisma.auditLog.findMany({distinct:["action"],select:{action:true},orderBy:{action:"asc"}});
 return <main className="page admin-audit audit-v4-page"><section className="audit-v4-hero"><div><div className="admin-kicker">SECURITY & HISTORY</div><h1>Activity Log</h1><p>Review login, account, permission and administrative activity from one audit workspace.</p><div className="audit-v4-chips"><span>Asia/Dhaka time</span><span>Latest 250 results</span><span>Searchable history</span></div></div><div className="audit-v4-today"><span>TODAY</span><strong>{today}</strong><small>{logins} successful logins</small></div></section>
 <div className="perf-summary"><div className="card perf-summary-card"><span>Total Events</span><strong>{total}</strong><small>Stored history</small></div><div className="card perf-summary-card"><span>Today</span><strong>{today}</strong><small>New events</small></div><div className="card perf-summary-card"><span>Logins Today</span><strong>{logins}</strong><small>Successful sign-ins</small></div><div className="card perf-summary-card"><span>Shown</span><strong>{rows.length}</strong><small>Latest matching events</small></div></div>
 <form className="card audit-filters"><input name="q" defaultValue={q} placeholder="Search user, target or activity"/><select name="module" defaultValue={module}><option value="">All modules</option>{modules.map(x=><option key={x.module}>{x.module}</option>)}</select><select name="action" defaultValue={action}><option value="">All actions</option>{actions.map(x=><option key={x.action}>{x.action}</option>)}</select><button className="btn admin-primary">Filter</button>{(q||module||action)&&<Link className="btn btn-ghost" href="/admin/audit">Clear</Link>}</form>
 <div className="card audit-list audit-v4-timeline">{rows.length?rows.map(x=><div className="audit-row" key={x.id}><div className="audit-dot"/><div className="audit-main"><div><strong>{x.actorName}</strong><span>{x.actorRole}</span></div><p>{x.action.replaceAll("_"," ")}{x.targetName?<> · <b>{x.targetName}</b></>:null}</p><small>{x.detail||x.module}</small></div><div className="audit-meta"><b>{x.module}</b><span>{fmt(x.createdAt)}</span></div></div>):<div className="audit-empty">No matching activity found.</div>}</div></main>
}
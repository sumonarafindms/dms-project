import {requireUser} from "../../../../../lib/auth";
import {prisma} from "../../../../../lib/prisma";
import {employeePerformance,pct} from "../../../../../lib/performance";
import {normalizeMonth} from "../../../../../lib/drilldown";
import {monthBounds} from "../../../../../lib/month";
import {notFound} from "next/navigation";
import Link from "next/link";
import {Breadcrumb,PerfSummary,PerfBar} from "../../../../components/AdminPerformanceUI";

export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{month?:string}>}){
 await requireUser(["ADMIN"]);const {id}=await params,s=await searchParams,month=normalizeMonth(s.month),sup=await prisma.supervisor.findUnique({where:{id},select:{id:true,name:true,employees:{where:{active:true},select:{id:true}}}});if(!sup)notFound();
 const ids=sup.employees.map(x=>x.id),rows=await employeePerformance(`${month}-01`,ids),{start,end}=monthBounds(`${month}-01`);
 const bps=await prisma.bpAssignment.findMany({where:{employeeId:{in:ids},startDate:{lt:end},OR:[{endDate:null},{endDate:{gte:start}}]},include:{retailer:{select:{retailerCode:true,retailerName:true}},employee:{select:{id:true,name:true}}}});
 const target=rows.reduce((a,x)=>a+x.totalRechargeTarget,0),achieved=rows.reduce((a,x)=>a+x.totalRechargeAchieved,0),gaT=rows.reduce((a,x)=>a+x.gaTarget,0)+bps.reduce((a,x)=>a+x.gaTarget,0),gaA=rows.reduce((a,x)=>a+x.gaAchieved,0);
 return <main className="page admin-performance"><Breadcrumb items={[{label:"Performance",href:"/admin/performance/supervisors"},{label:"Supervisors",href:`/admin/performance/supervisors?month=${month}`},{label:sup.name}]}/><div className="perf-profile-head"><div className="perf-avatar large">{sup.name.slice(0,2).toUpperCase()}</div><div><div className="admin-kicker">SUPERVISOR</div><h1>{sup.name}</h1><p>{rows.length} RSOs · {bps.length} BP assignments</p></div></div>
 <PerfSummary items={[{label:"Recharge Target",value:`৳${Math.round(target).toLocaleString()}`,sub:"Team total"},{label:"Achieved",value:`৳${Math.round(achieved).toLocaleString()}`,sub:`${pct(achieved,target)}% complete`},{label:"Remaining",value:`৳${Math.max(0,Math.round(target-achieved)).toLocaleString()}`,sub:"Recharge gap"},{label:"GA",value:`${gaA} / ${gaT}`,sub:"Team + BP target"}]}/>
 <section className="section"><div className="admin-section-head"><div><span>TEAM</span><h2>Assigned RSOs</h2></div></div><div className="perf-list card">{rows.map(r=><Link href={`/admin/rsos/${r.employeeId}?month=${month}`} className="perf-list-row" key={r.employeeId}><div><strong>{r.name}</strong><span>{r.employeeCode||r.rsoMsisdn} · {r.retailerCount} retailers</span></div><div className="perf-row-numbers"><span>GA <b>{r.gaAchieved}/{r.gaTarget}</b></span><span>Recharge <b>{pct(r.totalRechargeAchieved,r.totalRechargeTarget)}%</b></span></div><b>›</b></Link>)}</div></section>
 <section className="section"><div className="admin-section-head"><div><span>BP</span><h2>Assigned BPs</h2></div></div><div className="perf-list card">{bps.map(b=><Link href={`/admin/performance/bps/${b.id}?month=${month}`} className="perf-list-row" key={b.id}><div><strong>{b.retailer.retailerName||b.retailer.retailerCode}</strong><span>{b.retailer.retailerCode} · RSO {b.employee.name}</span></div><div className="perf-row-numbers"><span>GA target <b>{b.gaTarget}</b></span></div><b>›</b></Link>)}</div></section></main>
}

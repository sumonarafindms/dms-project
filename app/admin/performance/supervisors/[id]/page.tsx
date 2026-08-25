import {requireUser} from "../../../../../lib/auth";
import {prisma} from "../../../../../lib/prisma";
import {employeePerformance,pct} from "../../../../../lib/performance";
import {normalizeMonth} from "../../../../../lib/drilldown";
import {monthBounds} from "../../../../../lib/month";
import {parseYmd,monthStartsInRange} from "../../../../../lib/date-range";
import {notFound} from "next/navigation";
import Link from "next/link";
import {Breadcrumb,PerfSummary,PerfBar} from "../../../../components/AdminPerformanceUI";
import {FilterForm} from "../../../../components/DrillUI";

export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{month?:string;from?:string;to?:string}>}){
 await requireUser(["ADMIN","IT"]);const {id}=await params,s=await searchParams,month=normalizeMonth(s.from?.slice(0,7)||s.month),{start,end}=monthBounds(`${month}-01`);
 const rs=parseYmd(s.from)||start,to=parseYmd(s.to),re=to?new Date(to.getTime()+86400000):end;
 const sup=await prisma.supervisor.findUnique({where:{id},select:{id:true,name:true,employees:{where:{active:true},select:{id:true}}}});if(!sup)notFound();
 const ids=sup.employees.map(x=>x.id),rows=await employeePerformance(`${month}-01`,ids,s.from,s.to);
 const bps=await prisma.bpAssignment.findMany({where:{employeeId:{in:ids},startDate:{lt:re},OR:[{endDate:null},{endDate:{gte:rs}}]},include:{retailer:{select:{retailerCode:true,retailerName:true}},employee:{select:{id:true,name:true}},monthlyTargets:true}});
 const bpStats=await Promise.all(bps.map(async b=>{
   const es=b.startDate>rs?b.startDate:rs,ae=b.endDate?new Date(b.endDate.getTime()+86400000):re,ee=ae<re?ae:re;
   const targetMap=new Map(b.monthlyTargets.map(x=>[x.month.toISOString().slice(0,7),x.gaTarget]));
   const target=es<ee?monthStartsInRange(es,ee).reduce((n,m)=>n+(targetMap.get(m.toISOString().slice(0,7))??b.gaTarget),0):0;
   const achieved=es<ee?await prisma.gaActivation.count({where:{retailerId:b.retailerId,activationDate:{gte:es,lt:ee}}}):0;
   return {...b,target,achieved};
 }));
 const rechargeTarget=rows.reduce((a,x)=>a+x.totalRechargeTarget,0),rechargeAchieved=rows.reduce((a,x)=>a+x.totalRechargeAchieved,0),rsoGaT=rows.reduce((a,x)=>a+x.gaTarget,0),rsoGaA=rows.reduce((a,x)=>a+x.gaAchieved,0),bpGaT=bpStats.reduce((a,x)=>a+x.target,0),bpGaA=bpStats.reduce((a,x)=>a+x.achieved,0);
 return <main className="page admin-performance"><Breadcrumb items={[{label:"Performance",href:"/admin/performance/supervisors"},{label:"Supervisors",href:"/admin/performance/supervisors"},{label:sup.name}]}/><div className="perf-profile-head"><div className="perf-avatar large">{sup.name.slice(0,2).toUpperCase()}</div><div><div className="admin-kicker">SUPERVISOR</div><h1>{sup.name}</h1><p>{rows.length} RSOs · {bpStats.length} BP assignments</p></div></div>
 <FilterForm month={month} from={s.from} to={s.to} dateRange showMonth placeholder=""/>
 <PerfSummary items={[{label:"Recharge",value:`৳${Math.round(rechargeAchieved).toLocaleString()} / ৳${Math.round(rechargeTarget).toLocaleString()}`,sub:`${pct(rechargeAchieved,rechargeTarget)}% complete`},{label:"RSO GA",value:`${rsoGaA} / ${rsoGaT}`,sub:"All retailer GA under team"},{label:"BP GA",value:`${bpGaA} / ${bpGaT}`,sub:"Assigned BP target only"},{label:"BPs",value:bpStats.length,sub:"Effective in selected dates"}]}/>
 <section className="section"><div className="admin-section-head"><div><span>TEAM</span><h2>Assigned RSOs</h2></div></div><div className="perf-list card">{rows.map(r=><Link href={`/admin/rsos/${r.employeeId}?month=${month}${s.from?`&from=${s.from}`:""}${s.to?`&to=${s.to}`:""}`} className="perf-list-row" key={r.employeeId}><div><strong>{r.name}</strong><span>{r.employeeCode||r.rsoMsisdn} · {r.retailerCount} retailers</span></div><div className="perf-row-numbers"><span>GA <b>{r.gaAchieved}/{r.gaTarget}</b></span><span>Recharge <b>{pct(r.totalRechargeAchieved,r.totalRechargeTarget)}%</b></span></div><b>›</b></Link>)}</div></section>
 <section className="section"><div className="admin-section-head"><div><span>BP</span><h2>Assigned BPs</h2></div></div><div className="perf-list card">{bpStats.map(b=><Link href={`/admin/performance/bps/${b.id}?month=${month}${s.from?`&from=${s.from}`:""}${s.to?`&to=${s.to}`:""}`} className="perf-list-row" key={b.id}><div><strong>{b.retailer.retailerName||b.retailer.retailerCode}</strong><span>{b.retailer.retailerCode} · RSO {b.employee.name}</span></div><div className="perf-row-numbers"><span>BP GA <b>{b.achieved}/{b.target}</b></span></div><b>›</b></Link>)}</div></section></main>
}
import {requireUser} from "../../../../../lib/auth";
import {bpAssignmentDetail} from "../../../../../lib/bp-activations";
import {normalizeMonth} from "../../../../../lib/drilldown";
import {notFound} from "next/navigation";
import {Breadcrumb,PerfSummary,PerfBar} from "../../../../components/AdminPerformanceUI";
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{month?:string}>}){
 const u=await requireUser(["ADMIN"]),{id}=await params,s=await searchParams,month=normalizeMonth(s.month),d=await bpAssignmentDetail(u,id,month);if(!d)notFound();const a=d.assignment;
 return <main className="page admin-performance"><Breadcrumb items={[{label:"Performance",href:"/admin/performance/bps"},{label:"BP",href:`/admin/performance/bps?month=${month}`},{label:a.retailer.retailerName||a.retailer.retailerCode}]}/><div className="perf-profile-head"><div className="perf-avatar large">{a.retailer.retailerCode.slice(-2)}</div><div><div className="admin-kicker">BP PERFORMANCE</div><h1>{a.retailer.retailerName||a.retailer.retailerCode}</h1><p>{a.retailer.retailerCode} · RSO {a.employee.name} · {a.employee.supervisor?.name||"No supervisor"}</p></div></div>
 <PerfSummary items={[{label:"GA Target",value:a.gaTarget,sub:"Assignment target"},{label:"GA Achieved",value:d.total,sub:`${a.gaTarget?Math.round(d.total/a.gaTarget*100):0}% complete`},{label:"GA Remaining",value:Math.max(0,a.gaTarget-d.total),sub:"To target"},{label:"SIM Mix",value:`${d.total150} / ${d.total300}`,sub:"170 price / other"}]}/>
 <section className="section"><div className="card perf-detail-progress"><div><span>Monthly GA progress</span><strong>{d.total} / {a.gaTarget}</strong></div><PerfBar achieved={d.total} target={a.gaTarget}/></div></section>
 <section className="section"><div className="admin-section-head"><div><span>ACTIVATIONS</span><h2>Recent SIM activations</h2></div></div><div className="perf-list card">{d.rows.slice(0,100).map(x=><div className="perf-list-row" key={x.simNo}><div><strong>{x.simNo}</strong><span>{x.activationDate.toISOString().slice(0,10)} · {x.activationTime||""}</span></div><div className="perf-row-numbers"><span>Price <b>৳{Number(x.sellingPrice)}</b></span></div></div>)}</div></section></main>
}

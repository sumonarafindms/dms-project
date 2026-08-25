import {requireUser} from "../../../../lib/auth";
import {listBpAssignments} from "../../../../lib/bp-activations";
import {normalizeMonth} from "../../../../lib/drilldown";
import {PerfHead,PerfSummary,PerfBar,EmptyPerf} from "../../../components/AdminPerformanceUI";
import Link from "next/link";
export default async function Page({searchParams}:{searchParams:Promise<{q?:string;month?:string;from?:string;to?:string}>}){
 const u=await requireUser(["ADMIN","IT"]),s=await searchParams,month=normalizeMonth(s.from?.slice(0,7)||s.month),data=await listBpAssignments(u,month,s.q,s.from,s.to);
 const rows=data.assignments,totalT=rows.reduce((a,x)=>a+x.gaTarget,0),totalA=rows.reduce((a,x)=>a+x.monthGa,0);
 return <main className="page admin-performance"><PerfHead title="BP Performance" subtitle="BP assignments, RSO ownership and SIM activation performance." month={month} q={s.q||""} from={s.from} to={s.to} placeholder="BP code, BP name or RSO"/><PerfSummary items={[{label:"BP Assignments",value:rows.length,sub:"Selected dates"},{label:"GA Target",value:totalT,sub:"Combined BP target"},{label:"GA Achieved",value:totalA,sub:`${totalT?Math.round(totalA/totalT*100):0}% complete`},{label:"GA Remaining",value:Math.max(0,totalT-totalA),sub:"To target"}]}/>
 <div className="perf-card-grid">{rows.map(b=><Link href={`/admin/performance/bps/${b.id}?month=${month}${s.from?`&from=${s.from}`:""}${s.to?`&to=${s.to}`:""}`} className="card perf-person-card" key={b.id}><div className="perf-person-top"><div className="perf-avatar">{b.retailer.retailerCode.slice(-2).toUpperCase()}</div><div><strong>{b.retailer.retailerName||b.retailer.retailerCode}</strong><span>{b.retailer.retailerCode} · RSO {b.employee.name} · {b.employee.supervisor?.name||"No supervisor"}</span></div><em>{b.gaTarget?Math.round(b.monthGa/b.gaTarget*100):0}%</em></div><div className="perf-money"><div><span>Target</span><b>{b.gaTarget}</b></div><div><span>Achieved</span><b>{b.monthGa}</b></div><div><span>Remaining</span><b>{Math.max(0,b.gaTarget-b.monthGa)}</b></div></div><PerfBar achieved={b.monthGa} target={b.gaTarget}/></Link>)}{!rows.length&&<EmptyPerf text="No BP performance found"/>}</div></main>
}

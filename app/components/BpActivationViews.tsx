import Link from "next/link";
import {FilterForm,LinkedList,StatStrip} from "./DrillUI";
import {PageHead} from "./RoleUI";
import type {BpViewer} from "../../lib/bp-activations";
import {bpAssignmentDetail,listBpAssignments} from "../../lib/bp-activations";

export async function BpActivationListView({user,basePath,month,q,eyebrow}:{user:BpViewer;basePath:string;month?:string;q?:string;eyebrow:string}){
 const data=await listBpAssignments(user,month,q);
 return <main className="page field-page"><PageHead eyebrow={eyebrow} title="BP Activation Details" subtitle="View SIM activations by assigned BP retailer and effective assignment period."/>
  <FilterForm q={q||""} month={data.month} placeholder="Search BP code, BP name or RSO"/>
  <LinkedList title="BP assignments" empty="No BP assignment found for this month." items={data.assignments.map(a=>({href:`${basePath}/${a.id}?month=${data.month}`,name:`${a.retailer.retailerCode} · ${a.retailer.retailerName||"BP"}`,meta:`RSO: ${a.employee.name}${a.employee.supervisor?.name?` · Sup: ${a.employee.supervisor.name}`:""} · ${a.startDate.toISOString().slice(0,10)} → ${a.endDate?.toISOString().slice(0,10)||"Current"}`,right:`${a.monthGa} GA`,status:a.active?"Active":"History"}))}/>
 </main>
}

export async function BpActivationDetailView({user,id,backHref,month,q,eyebrow}:{user:BpViewer;id:string;backHref:string;month?:string;q?:string;eyebrow:string}){
 const d=await bpAssignmentDetail(user,id,month,q);
 if(!d)return <main className="page field-page"><PageHead eyebrow={eyebrow} title="BP activation unavailable" subtitle="This BP assignment is outside your access scope or no longer exists."/><Link className="btn btn-soft" href={backHref}>Back</Link></main>;
 return <main className="page field-page"><PageHead eyebrow={eyebrow} title={d.assignment.retailer.retailerName||d.assignment.retailer.retailerCode} subtitle={`${d.assignment.retailer.retailerCode} · RSO ${d.assignment.employee.name} · ${d.assignment.employee.supervisor?.name||"No supervisor"}` } action={<Link className="btn btn-soft" href={`${backHref}?month=${d.month}`}>Back</Link>}/>
  <StatStrip items={[{label:"Total GA",value:d.total},{label:"150",value:d.total150},{label:"300",value:d.total300},{label:"GA Target",value:d.assignment.gaTarget||"—"}]}/>
  <div className="info-banner"><div className="info-dot"/><div>Counting only activations during this BP assignment period: <strong>{d.effectiveStart.toISOString().slice(0,10)}</strong> to <strong>{new Date(d.effectiveEnd.getTime()-1).toISOString().slice(0,10)}</strong>.</div></div>
  <FilterForm q={d.q} month={d.month} placeholder="Search SIM serial"/>
  <section className="section"><div className="section-head"><h2 className="section-title">Activation details</h2><span className="section-link">{d.rows.length} shown</span></div><div className="card panel activity-list">{d.rows.length?d.rows.map(x=><div className="activity-row" key={x.simNo}><div><div className="activity-date">SIM {x.simNo}</div><div className="activity-meta">{x.activationDate.toISOString().slice(0,10)}{x.activationTime?` · ${x.activationTime}`:""}</div></div><div className="activity-value">৳{Number(x.sellingPrice).toLocaleString()}<div className="mini-label">{Number(x.sellingPrice)===170?"150":"300"}</div></div></div>):<div className="empty">No activation found for this filter.</div>}</div></section>
  <section className="section"><div className="section-head"><h2 className="section-title">Daily GA</h2><span className="section-link">{d.daily.length} days</span></div><div className="card panel">{d.daily.length?d.daily.map(x=><div className="team-row" key={x.date.toISOString()}><div><div className="person-name">{x.date.toISOString().slice(0,10)}</div><div className="person-meta">BP activation count</div></div><div className="mini-value">{x.count} GA</div></div>):<div className="empty">No daily activity.</div>}</div></section>
 </main>
}

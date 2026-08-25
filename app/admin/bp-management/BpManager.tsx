"use client";
import {FormEvent,useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {dhakaTodayYmd} from "../../../lib/business-time";
type Emp={id:string;name:string;rsoMsisdn:string;supervisor:string};
type Retailer={id:string;code:string;name:string;employeeId:string;employee:string;rsoMsisdn:string};
type Current={id:string;employeeId:string;employee:string;supervisor:string;retailerId:string;code:string;name:string;startDate:string;gaTarget:number;login:string;mobile:string};
type Hist={id:string;employee:string;code:string;name:string;startDate:string;endDate:string};
export default function BpManager({employees,retailers,current,history}:{employees:Emp[];retailers:Retailer[];current:Current[];history:Hist[]}){
 const router=useRouter();const [employeeId,setEmployeeId]=useState("");const [q,setQ]=useState("");const [retailerId,setRetailerId]=useState("");const [msg,setMsg]=useState("");const today=dhakaTodayYmd();
 const selectedEmployee=employees.find(e=>e.id===employeeId);
 const filtered=useMemo(()=>{const s=q.trim().toLowerCase();return retailers.filter(r=>(!employeeId||r.employeeId===employeeId)&&(!s||`${r.code} ${r.name} ${r.employee}`.toLowerCase().includes(s))).slice(0,80)},[q,employeeId,retailers]);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setMsg("");const f=new FormData(e.currentTarget);const body=Object.fromEntries(f);const r=await fetch("/api/admin/bp-assignments",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)return setMsg(d.error||"Could not assign BP");setMsg(d.transferredLogin?`BP assigned. Existing BP login moved to ${d.code}.`:`BP assigned to ${d.code}.`);setRetailerId("");setQ("");router.refresh()}
 async function close(id:string){if(!confirm("End this BP assignment?"))return;const r=await fetch("/api/admin/bp-assignments",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id,active:false})});const d=await r.json();if(!r.ok)return setMsg(d.error||"Could not end assignment");router.refresh()}
 return <>
  <section className="card panel"><div className="section-head"><div><h2 className="section-title">Assign / change BP</h2><p className="page-subtitle">Choose the RSO first, then select one of that RSO's retailer codes. New assignment automatically closes the previous active BP for that RSO.</p></div></div>
   <form className="data-form bp-form" onSubmit={submit}>
    <label><span>RSO / Employee</span><select className="control" name="employeeId" required value={employeeId} onChange={e=>{setEmployeeId(e.target.value);setRetailerId("");setQ("")}}><option value="">Select RSO</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name} · {e.rsoMsisdn} · {e.supervisor}</option>)}</select></label>
    <label><span>Effective from</span><input className="control" type="date" name="startDate" defaultValue={today} required/></label>
    <label><span>BP GA target</span><input className="control" type="number" min="0" name="gaTarget" defaultValue="0" inputMode="numeric"/></label>
    <label className="bp-retailer-picker"><span>Retailer code</span><input className="control" placeholder={selectedEmployee?`Search ${selectedEmployee.name}'s retailer code or name`:`Select an RSO first`} value={q} onChange={e=>setQ(e.target.value)} disabled={!employeeId}/><select className="control" name="retailerId" required value={retailerId} onChange={e=>setRetailerId(e.target.value)} disabled={!employeeId}><option value="">Select retailer</option>{filtered.map(r=><option value={r.id} key={r.id}>{r.code} · {r.name||"Unnamed retailer"}</option>)}</select></label>
    <button className="btn btn-primary" disabled={!employeeId||!retailerId}>Assign BP</button>
   </form>{msg&&<div className="info-banner" style={{marginTop:12}}>{msg}</div>}
  </section>
  <section className="section"><div className="section-head"><h2 className="section-title">Current BP assignments</h2><span className="section-link">{current.length} active</span></div><div className="card panel"><div className="team-list">{current.length?current.map(x=><div className="team-row bp-current-row" key={x.id}><div className="team-person"><div className="person-avatar">BP</div><div><div className="person-name">{x.code} · {x.name||"Unnamed retailer"}</div><div className="person-meta">{x.employee} · {x.supervisor} · Since {x.startDate}{x.gaTarget?` · GA target ${x.gaTarget}`:""}</div>{x.login&&<div className="person-meta">Login: {x.login}{x.mobile?` · ${x.mobile}`:""}</div>}</div></div><button className="status-pill status-low" onClick={()=>close(x.id)}>Change / End</button></div>):<div className="empty">No BP is assigned yet.</div>}</div></div></section>
  <section className="section"><div className="section-head"><h2 className="section-title">Recent BP history</h2><span className="section-link">Last {history.length}</span></div><div className="card panel table-wrap"><table className="data-table"><thead><tr><th>BP Code</th><th>RSO</th><th>From</th><th>To</th></tr></thead><tbody>{history.map(x=><tr key={x.id}><td><strong>{x.code}</strong><br/><span className="person-meta">{x.name}</span></td><td>{x.employee}</td><td>{x.startDate}</td><td>{x.endDate||"-"}</td></tr>)}</tbody></table>{!history.length&&<div className="empty">BP change history will appear here.</div>}</div></section>
 </>
}
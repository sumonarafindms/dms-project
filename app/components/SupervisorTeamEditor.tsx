"use client";
import {useMemo,useState} from "react";
import {useRouter} from "next/navigation";
export default function SupervisorTeamEditor({supervisorId,employees,selected}:{supervisorId:string;employees:{id:string;name:string;meta:string}[];selected:string[]}){
 const router=useRouter(),[ids,setIds]=useState(selected),[q,setQ]=useState(""),[busy,setBusy]=useState(false),[msg,setMsg]=useState("");
 const filtered=useMemo(()=>employees.filter(x=>!q||`${x.name} ${x.meta}`.toLowerCase().includes(q.toLowerCase())),[employees,q]);
 function toggle(id:string){setIds(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id])}
 async function save(){setBusy(true);setMsg("");const r=await fetch("/api/admin/supervisor-team",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({supervisorId,rsoIds:ids})});const d=await r.json();setBusy(false);if(!r.ok)return setMsg(d.error||"Could not update team");setMsg(`${d.count} RSO assigned.`);router.refresh()}
 return <section className="card supervisor-team-editor"><div className="employee-form-divider"><span>Assigned RSOs</span></div><div className="supervisor-team-top"><input className="control" placeholder="Search RSO" value={q} onChange={e=>setQ(e.target.value)}/><span>{ids.length} selected</span></div><div className="supervisor-team-list">{filtered.map(x=><label key={x.id}><input type="checkbox" checked={ids.includes(x.id)} onChange={()=>toggle(x.id)}/><span><strong>{x.name}</strong><small>{x.meta}</small></span></label>)}</div><div className="supervisor-team-actions"><button className="btn admin-primary" type="button" disabled={busy} onClick={save}>{busy?"Saving...":"Save RSO Assignment"}</button>{msg&&<span>{msg}</span>}</div></section>
}
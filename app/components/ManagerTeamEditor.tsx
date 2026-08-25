"use client";
import {useMemo,useState} from "react";
import {useRouter} from "next/navigation";
export default function ManagerTeamEditor({managerId,supervisors,selected}:{managerId:string;supervisors:{id:string;name:string;meta:string}[];selected:string[]}){
 const router=useRouter(),[ids,setIds]=useState(selected),[q,setQ]=useState(""),[busy,setBusy]=useState(false),[msg,setMsg]=useState("");
 const filtered=useMemo(()=>supervisors.filter(x=>!q||`${x.name} ${x.meta}`.toLowerCase().includes(q.toLowerCase())),[supervisors,q]);
 function toggle(id:string){setIds(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id])}
 async function save(){setBusy(true);setMsg("");const r=await fetch("/api/admin/manager-team",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({managerId,supervisorIds:ids})});const d=await r.json();setBusy(false);if(!r.ok)return setMsg(d.error||"Could not update manager team");setMsg(`${d.count} supervisor assigned.`);router.refresh()}
 return <section className="card supervisor-team-editor"><div className="employee-form-divider"><span>Assigned Supervisors</span></div><div className="supervisor-team-top"><input className="control" placeholder="Search supervisor" value={q} onChange={e=>setQ(e.target.value)}/><span>{ids.length} selected</span></div><div className="supervisor-team-list">{filtered.map(x=><label key={x.id}><input type="checkbox" checked={ids.includes(x.id)} onChange={()=>toggle(x.id)}/><span><strong>{x.name}</strong><small>{x.meta}</small></span></label>)}</div><div className="supervisor-team-actions"><button className="btn admin-primary" type="button" disabled={busy} onClick={save}>{busy?"Saving...":"Save Supervisor Assignment"}</button>{msg&&<span>{msg}</span>}</div></section>
}
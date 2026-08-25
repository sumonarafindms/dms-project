"use client";
import {useMemo,useState} from "react";
import {useRouter} from "next/navigation";

type U={id:string;name:string;role:string;mobile:string;custom:number};

export default function PermissionBulkManager({users}:{users:U[]}){
 const router=useRouter();
 const [selected,setSelected]=useState<string[]>([]);
 const [role,setRole]=useState("ALL");
 const [preset,setPreset]=useState("ROLE_DEFAULT");
 const [sourceId,setSourceId]=useState("");
 const [busy,setBusy]=useState(false);
 const [msg,setMsg]=useState("");

 const visible=useMemo(()=>users.filter(u=>role==="ALL"||u.role===role),[users,role]);
 function toggle(id:string){setSelected(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id])}
 function toggleAll(){const ids=visible.map(x=>x.id);setSelected(v=>ids.every(id=>v.includes(id))?v.filter(id=>!ids.includes(id)):[...new Set([...v,...ids])])}

 async function applyPreset(){
  if(!selected.length)return setMsg("Select at least one user.");
  setBusy(true);setMsg("");
  const r=await fetch("/api/admin/permissions/bulk",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({mode:"preset",userIds:selected,preset})});
  const d=await r.json();setBusy(false);setMsg(r.ok?`Updated ${d.updated} user(s).`:d.error||"Could not apply preset.");if(r.ok)router.refresh()
 }
 async function copy(){
  const targets=selected.filter(id=>id!==sourceId);
  if(!sourceId)return setMsg("Choose a source user.");
  if(!targets.length)return setMsg("Select at least one target user.");
  setBusy(true);setMsg("");
  const r=await fetch("/api/admin/permissions/bulk",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({mode:"copy",sourceId,targetIds:targets})});
  const d=await r.json();setBusy(false);setMsg(r.ok?`Copied permissions to ${d.updated} user(s).`:d.error||"Could not copy permissions.");if(r.ok)router.refresh()
 }

 return <section className="card permission-bulk">
  <div className="permission-bulk-head"><div><strong>Bulk Permission Manager</strong><span>Apply presets or copy one user's access to multiple accounts.</span></div><select className="control" value={role} onChange={e=>setRole(e.target.value)}><option value="ALL">All roles</option>{["MANAGER","SUPERVISOR","ACCOUNTS","RSO","BP"].map(r=><option key={r}>{r}</option>)}</select></div>
  <div className="permission-bulk-select"><label><input type="checkbox" checked={visible.length>0&&visible.every(u=>selected.includes(u.id))} onChange={toggleAll}/><span>Select visible users</span></label><b>{selected.length} selected</b></div>
  <div className="permission-bulk-users">{visible.map(u=><label key={u.id}><input type="checkbox" checked={selected.includes(u.id)} onChange={()=>toggle(u.id)}/><span><strong>{u.name}</strong><small>{u.role} · {u.mobile||"No mobile"} · {u.custom?`${u.custom} custom`:"Role default"}</small></span></label>)}</div>
  <div className="permission-bulk-tools">
   <div className="permission-bulk-tool"><div><strong>Apply preset</strong><span>Replace selected users' effective access.</span></div><select className="control" value={preset} onChange={e=>setPreset(e.target.value)}><option value="ROLE_DEFAULT">Role Default</option><option value="VIEW_ONLY">View Only</option><option value="DATA_OPERATOR">Data Operator</option><option value="FULL_NON_ADMIN">Full Non-Admin Access</option></select><button className="btn admin-primary" disabled={busy} onClick={applyPreset}>Apply</button></div>
   <div className="permission-bulk-tool"><div><strong>Copy from user</strong><span>Copy effective permission setup to selected targets.</span></div><select className="control" value={sourceId} onChange={e=>setSourceId(e.target.value)}><option value="">Choose source user</option>{users.map(u=><option value={u.id} key={u.id}>{u.name} · {u.role}</option>)}</select><button className="btn btn-ghost" disabled={busy} onClick={copy}>Copy Permissions</button></div>
  </div>
  {msg&&<div className="permission-bulk-msg">{msg}</div>}
 </section>
}